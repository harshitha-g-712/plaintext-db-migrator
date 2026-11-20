"""
SQLAlchemy ORM models for PlainText-to-DB Schema Migrator.
Covers: users, projects, database_connections, requirements, schemas, migrations, migration_history.
Uses cross-database compatible types (works with SQLite for local dev and PostgreSQL for production).
"""
import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Column, String, Enum, ForeignKey, DateTime, Text, Boolean, JSON, Integer
)
from sqlalchemy.types import TypeDecorator, CHAR
from sqlalchemy.orm import relationship

from app.database.session import Base


def utcnow():
    return datetime.now(timezone.utc)


class GUID(TypeDecorator):
    """
    Platform-independent UUID type.
    Uses PostgreSQL's UUID type when available; falls back to CHAR(36) (SQLite, MySQL).
    """
    impl = CHAR
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            from sqlalchemy.dialects.postgresql import UUID
            return dialect.type_descriptor(UUID(as_uuid=True))
        return dialect.type_descriptor(CHAR(36))

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        if dialect.name == "postgresql":
            return str(value)
        if isinstance(value, uuid.UUID):
            return str(value)
        return str(uuid.UUID(value))

    def process_result_value(self, value, dialect):
        if value is None:
            return value
        return uuid.UUID(str(value))


class UserRole(str, enum.Enum):
    ADMIN = "ADMIN"
    DEVELOPER = "DEVELOPER"


class User(Base):
    __tablename__ = "users"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), nullable=False, default=UserRole.DEVELOPER)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    # Relationships
    projects = relationship("Project", back_populates="owner", cascade="all, delete-orphan")


class Project(Base):
    __tablename__ = "projects"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id = Column(GUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    project_name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    # Relationships
    owner = relationship("User", back_populates="projects")
    database_connections = relationship("DatabaseConnection", back_populates="project", cascade="all, delete-orphan")
    requirements = relationship("Requirement", back_populates="project", cascade="all, delete-orphan")
    schemas = relationship("Schema", back_populates="project", cascade="all, delete-orphan")
    migrations = relationship("Migration", back_populates="project", cascade="all, delete-orphan")
    workflows = relationship("AgentWorkflowExecution", back_populates="project", cascade="all, delete-orphan")


class DatabaseType(str, enum.Enum):
    POSTGRESQL = "postgresql"
    MYSQL = "mysql"


class DatabaseConnection(Base):
    __tablename__ = "database_connections"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    project_id = Column(GUID(), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    connection_name = Column(String(255), nullable=False)
    database_type = Column(Enum(DatabaseType), nullable=False)
    # Stored as encrypted/serialized JSON string — credentials never exposed in API responses
    connection_configuration = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    # Relationships
    project = relationship("Project", back_populates="database_connections")


class Requirement(Base):
    __tablename__ = "requirements"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    project_id = Column(GUID(), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    original_text = Column(Text, nullable=False)
    analyzed_data = Column(JSON, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    # Relationships
    project = relationship("Project", back_populates="requirements")


class Schema(Base):
    __tablename__ = "schemas"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    project_id = Column(GUID(), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    schema_name = Column(String(255), nullable=False)
    schema_definition = Column(JSON, nullable=False)
    database_dialect = Column(String(50), nullable=False, default="postgresql")
    version = Column(Integer, nullable=False, default=1)
    mermaid_er = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    # Relationships
    project = relationship("Project", back_populates="schemas")


class MigrationStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    EXECUTED = "EXECUTED"
    REJECTED = "REJECTED"
    ROLLED_BACK = "ROLLED_BACK"


class MigrationRiskLevel(str, enum.Enum):
    SAFE = "SAFE"
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    DESTRUCTIVE = "DESTRUCTIVE"


class Migration(Base):
    __tablename__ = "migrations"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    project_id = Column(GUID(), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    source_schema_id = Column(GUID(), ForeignKey("schemas.id", ondelete="SET NULL"), nullable=True)
    target_schema_id = Column(GUID(), ForeignKey("schemas.id", ondelete="CASCADE"), nullable=False)
    database_dialect = Column(String(50), nullable=False, default="postgresql")
    migration_sql = Column(Text, nullable=False)
    rollback_sql = Column(Text, nullable=False)
    status = Column(Enum(MigrationStatus), nullable=False, default=MigrationStatus.PENDING)
    risk_level = Column(Enum(MigrationRiskLevel), nullable=False, default=MigrationRiskLevel.SAFE)
    detected_diff = Column(JSON, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    executed_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    project = relationship("Project", back_populates="migrations")
    source_schema = relationship("Schema", foreign_keys=[source_schema_id])
    target_schema = relationship("Schema", foreign_keys=[target_schema_id])
    history = relationship("MigrationHistory", back_populates="migration", cascade="all, delete-orphan", lazy="selectin")


class MigrationHistory(Base):
    __tablename__ = "migration_history"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    migration_id = Column(GUID(), ForeignKey("migrations.id", ondelete="CASCADE"), nullable=False)
    version = Column(Integer, nullable=False)
    execution_status = Column(String(50), nullable=False)  # SUCCESS, FAILED, ROLLED_BACK
    executed_by = Column(String(255), nullable=False)      # User name or email
    execution_timestamp = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    error_message = Column(Text, nullable=True)

    # Relationships
    migration = relationship("Migration", back_populates="history")


class WorkflowStatus(str, enum.Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    AWAITING_HUMAN_APPROVAL = "AWAITING_HUMAN_APPROVAL"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class AgentWorkflowExecution(Base):
    __tablename__ = "agent_workflow_executions"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    project_id = Column(GUID(), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(GUID(), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    status = Column(Enum(WorkflowStatus), nullable=False, default=WorkflowStatus.PENDING)
    current_step = Column(String(100), nullable=False, default="INIT")
    dialect = Column(String(50), nullable=False, default="postgresql")
    requirements_text = Column(Text, nullable=False)

    # State checkpointing
    workflow_state = Column(JSON, nullable=False)
    steps_history = Column(JSON, nullable=False)

    # Human-in-the-loop review
    human_approval_required = Column(Boolean, default=True, nullable=False)
    is_approved = Column(Boolean, nullable=True)
    approved_by = Column(String(255), nullable=True)
    approval_notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    project = relationship("Project", back_populates="workflows")
    user = relationship("User")
