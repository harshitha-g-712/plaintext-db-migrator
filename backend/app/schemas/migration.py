"""
Pydantic schemas for Phase 5: Database Migration & Schema Version Control.
"""
from datetime import datetime
from typing import List, Optional
from uuid import UUID
from pydantic import BaseModel, Field


class SchemaDiffItem(BaseModel):
    change_type: str = Field(..., description="TABLE_ADDED, TABLE_DROPPED, COLUMN_ADDED, COLUMN_DROPPED, COLUMN_MODIFIED, etc.")
    table_name: str
    column_name: Optional[str] = None
    details: str
    is_destructive: bool = False
    old_value: Optional[str] = None
    new_value: Optional[str] = None


class SchemaDiffReport(BaseModel):
    has_changes: bool
    risk_level: str = Field(default="SAFE", description="SAFE, LOW, MEDIUM, HIGH, or DESTRUCTIVE")
    data_loss_warnings: List[str] = Field(default_factory=list)
    differences: List[SchemaDiffItem] = Field(default_factory=list)
    tables_added: List[str] = Field(default_factory=list)
    tables_dropped: List[str] = Field(default_factory=list)
    columns_added: List[str] = Field(default_factory=list)
    columns_dropped: List[str] = Field(default_factory=list)
    columns_modified: List[str] = Field(default_factory=list)


class MigrationCompareRequest(BaseModel):
    project_id: UUID
    source_schema_id: Optional[UUID] = Field(default=None, description="Previous/Existing schema version (None if new database)")
    target_schema_id: UUID = Field(..., description="Proposed/Target schema version")
    database_dialect: str = Field(default="postgresql", description="Target SQL dialect: postgresql or mysql")


class MigrationGenerateRequest(BaseModel):
    project_id: UUID
    source_schema_id: Optional[UUID] = Field(default=None, description="Previous/Existing schema version (None if new database)")
    target_schema_id: UUID = Field(..., description="Proposed/Target schema version")
    database_dialect: str = Field(default="postgresql", description="Target SQL dialect: postgresql or mysql")


class MigrationExecuteRequest(BaseModel):
    connection_id: Optional[UUID] = None
    force_destructive: bool = Field(default=False, description="Explicit approval required if risk_level is DESTRUCTIVE")


class MigrationHistoryResponse(BaseModel):
    id: UUID
    version: int
    execution_status: str
    executed_by: str
    execution_timestamp: datetime
    error_message: Optional[str] = None

    model_config = {"from_attributes": True}


class MigrationResponse(BaseModel):
    id: UUID
    project_id: UUID
    source_schema_id: Optional[UUID] = None
    target_schema_id: UUID
    database_dialect: str
    migration_sql: str
    rollback_sql: str
    status: str
    risk_level: str
    detected_diff: SchemaDiffReport
    created_at: datetime
    executed_at: Optional[datetime] = None
    history: List[MigrationHistoryResponse] = Field(default_factory=list)

    model_config = {"from_attributes": True}
