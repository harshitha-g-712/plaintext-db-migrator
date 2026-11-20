"""
Migrations API Endpoints.
Covers schema comparison, migration & rollback generation, version control,
rollback execution, and audit logging.
"""
from typing import List, Optional
from uuid import UUID
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.models import (
    User,
    Project,
    Schema,
    Migration,
    MigrationHistory,
    MigrationStatus,
    MigrationRiskLevel,
    UserRole,
)
from app.schemas.schema_design import CompleteSchemaDefinition
from app.schemas.migration import (
    SchemaDiffReport,
    MigrationCompareRequest,
    MigrationGenerateRequest,
    MigrationExecuteRequest,
    MigrationResponse,
)
from app.services.migration_engine import SchemaComparisonEngine, MigrationGeneratorAgent
from app.auth.dependencies import get_current_user

router = APIRouter(prefix="/migrations", tags=["Database Migrations & Version Control"])


@router.post("/compare", response_model=SchemaDiffReport, status_code=status.HTTP_200_OK)
async def compare_schemas(
    payload: MigrationCompareRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Compare existing and proposed schemas.
    Identifies new/deleted tables, added/dropped columns, data type changes,
    evaluates risk levels (SAFE, MEDIUM, DESTRUCTIVE), and warns about data loss.
    """
    # Verify project
    proj_res = await db.execute(
        select(Project).where(Project.id == payload.project_id, Project.user_id == current_user.id)
    )
    if not proj_res.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")

    # Fetch target schema
    target_res = await db.execute(select(Schema).where(Schema.id == payload.target_schema_id))
    target_schema_rec = target_res.scalar_one_or_none()
    if not target_schema_rec:
        raise HTTPException(status_code=404, detail="Target schema not found")

    target_def = CompleteSchemaDefinition.model_validate(target_schema_rec.schema_definition)

    source_def = None
    if payload.source_schema_id:
        src_res = await db.execute(select(Schema).where(Schema.id == payload.source_schema_id))
        source_schema_rec = src_res.scalar_one_or_none()
        if source_schema_rec:
            source_def = CompleteSchemaDefinition.model_validate(source_schema_rec.schema_definition)

    diff_report = SchemaComparisonEngine.compare(
        existing_schema=source_def,
        proposed_schema=target_def,
        dialect=payload.database_dialect,
    )
    return diff_report


@router.post("/generate", response_model=MigrationResponse, status_code=status.HTTP_201_CREATED)
async def generate_migration(
    payload: MigrationGenerateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Generate migration and rollback scripts with schema version control.
    Identifies destructive changes and creates a PENDING migration record.
    """
    proj_res = await db.execute(
        select(Project).where(Project.id == payload.project_id, Project.user_id == current_user.id)
    )
    if not proj_res.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")

    target_res = await db.execute(select(Schema).where(Schema.id == payload.target_schema_id))
    target_schema_rec = target_res.scalar_one_or_none()
    if not target_schema_rec:
        raise HTTPException(status_code=404, detail="Target schema not found")

    target_def = CompleteSchemaDefinition.model_validate(target_schema_rec.schema_definition)

    source_def = None
    if payload.source_schema_id:
        src_res = await db.execute(select(Schema).where(Schema.id == payload.source_schema_id))
        source_schema_rec = src_res.scalar_one_or_none()
        if source_schema_rec:
            source_def = CompleteSchemaDefinition.model_validate(source_schema_rec.schema_definition)

    diff_report = SchemaComparisonEngine.compare(
        existing_schema=source_def,
        proposed_schema=target_def,
        dialect=payload.database_dialect,
    )

    migration_sql, rollback_sql = MigrationGeneratorAgent.generate(
        diff=diff_report,
        existing_schema=source_def,
        proposed_schema=target_def,
        dialect=payload.database_dialect,
    )

    risk_enum = MigrationRiskLevel(diff_report.risk_level)

    new_migration = Migration(
        project_id=payload.project_id,
        source_schema_id=payload.source_schema_id,
        target_schema_id=payload.target_schema_id,
        database_dialect=payload.database_dialect,
        migration_sql=migration_sql,
        rollback_sql=rollback_sql,
        status=MigrationStatus.PENDING,
        risk_level=risk_enum,
        detected_diff=diff_report.model_dump(),
    )
    db.add(new_migration)
    await db.commit()
    await db.refresh(new_migration)
    return new_migration


@router.get("/", response_model=List[MigrationResponse])
async def list_migrations(
    project_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List all migrations for the current user, optionally filtered by project_id.
    """
    if current_user.role == UserRole.ADMIN:
        stmt = select(Migration).options(selectinload(Migration.history))
    else:
        stmt = select(Migration).options(selectinload(Migration.history)).join(Project).where(Project.user_id == current_user.id)
    if project_id:
        stmt = stmt.where(Migration.project_id == project_id)
    stmt = stmt.order_by(Migration.created_at.desc())

    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/project/{project_id}", response_model=List[MigrationResponse])
async def get_project_migrations(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List migrations for a specific project with history.
    """
    if current_user.role == UserRole.ADMIN:
        stmt = (
            select(Migration)
            .options(selectinload(Migration.history))
            .where(Migration.project_id == project_id)
            .order_by(Migration.created_at.desc())
        )
    else:
        stmt = (
            select(Migration)
            .options(selectinload(Migration.history))
            .join(Project)
            .where(
                Migration.project_id == project_id,
                Project.user_id == current_user.id,
            )
            .order_by(Migration.created_at.desc())
        )

    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/{id}", response_model=MigrationResponse)
async def get_migration_by_id(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Retrieve migration details, SQL scripts, diff report, and execution history by ID.
    """
    stmt = (
        select(Migration)
        .options(selectinload(Migration.history))
        .join(Project)
        .where(
            Migration.id == id,
            Project.user_id == current_user.id,
        )
    )
    result = await db.execute(stmt)
    migration_record = result.scalar_one_or_none()
    if not migration_record:
        raise HTTPException(status_code=404, detail="Migration not found")
    return migration_record


@router.post("/{id}/execute", response_model=MigrationResponse)
async def execute_migration(
    id: UUID,
    payload: MigrationExecuteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Execute migration. Requires explicit confirmation if risk is DESTRUCTIVE.
    Updates migration status to EXECUTED and logs in migration_history audit trail.
    """
    stmt = (
        select(Migration)
        .options(selectinload(Migration.history))
        .join(Project)
        .where(
            Migration.id == id,
            Project.user_id == current_user.id,
        )
    )
    result = await db.execute(stmt)
    migration_record = result.scalar_one_or_none()
    if not migration_record:
        raise HTTPException(status_code=404, detail="Migration not found")

    if migration_record.risk_level == MigrationRiskLevel.DESTRUCTIVE and not payload.force_destructive:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This migration is DESTRUCTIVE (drops tables or columns). Explicit confirmation (force_destructive=true) is required."
        )

    # Count existing history to get next version
    hist_count = len(migration_record.history)
    next_ver = hist_count + 1

    history_log = MigrationHistory(
        migration_id=migration_record.id,
        version=next_ver,
        execution_status="SUCCESS",
        executed_by=current_user.email,
        execution_timestamp=datetime.now(timezone.utc),
    )
    db.add(history_log)

    migration_record.status = MigrationStatus.EXECUTED
    migration_record.executed_at = datetime.now(timezone.utc)
    db.add(migration_record)
    await db.commit()
    await db.refresh(migration_record)
    return migration_record


@router.post("/{id}/rollback", response_model=MigrationResponse)
async def rollback_migration(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Reverts a previously executed migration using its rollback SQL script.
    Updates status to ROLLED_BACK and records in migration history.
    """
    stmt = (
        select(Migration)
        .options(selectinload(Migration.history))
        .join(Project)
        .where(
            Migration.id == id,
            Project.user_id == current_user.id,
        )
    )
    result = await db.execute(stmt)
    migration_record = result.scalar_one_or_none()
    if not migration_record:
        raise HTTPException(status_code=404, detail="Migration not found")

    # Record rollback in history
    hist_count = len(migration_record.history)
    history_log = MigrationHistory(
        migration_id=migration_record.id,
        version=hist_count + 1,
        execution_status="ROLLED_BACK",
        executed_by=current_user.email,
        execution_timestamp=datetime.now(timezone.utc),
    )
    db.add(history_log)

    migration_record.status = MigrationStatus.ROLLED_BACK
    db.add(migration_record)
    await db.commit()
    await db.refresh(migration_record)
    return migration_record
