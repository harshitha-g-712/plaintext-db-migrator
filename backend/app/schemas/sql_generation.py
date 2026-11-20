"""
Pydantic schemas for Phase 4: SQL Generation and Schema Validation using SQLGlot.
"""
from typing import List, Optional, Dict, Any
from uuid import UUID
from pydantic import BaseModel, Field


class SQLValidationError(BaseModel):
    message: str
    severity: str = Field(default="ERROR", description="ERROR or WARNING")
    table: Optional[str] = None
    column: Optional[str] = None
    line: Optional[int] = None
    rule: Optional[str] = None


class SQLValidationResult(BaseModel):
    is_valid: bool
    syntax_valid: bool
    design_valid: bool
    dialect: str
    errors: List[SQLValidationError] = Field(default_factory=list)
    warnings: List[SQLValidationError] = Field(default_factory=list)
    suggested_corrections: List[str] = Field(default_factory=list)
    tables_validated: List[str] = Field(default_factory=list)
    total_statements: int = 0


class SQLGenerateRequest(BaseModel):
    schema_id: UUID
    database_dialect: str = Field(default="postgresql", description="Target SQL dialect: postgresql or mysql")
    include_database_creation: bool = Field(default=True, description="Include CREATE DATABASE statement")
    include_drop_tables: bool = Field(default=False, description="Include DROP TABLE IF EXISTS statements")
    include_indexes: bool = Field(default=True, description="Include explicit CREATE INDEX statements")


class SQLGenerateResponse(BaseModel):
    schema_id: UUID
    database_dialect: str
    generated_sql: str
    validation_result: SQLValidationResult
    table_count: int
    statement_count: int


class SQLValidateRequest(BaseModel):
    sql_content: str = Field(..., min_length=5, description="Raw SQL statements to validate")
    database_dialect: str = Field(default="postgresql", description="Target dialect: postgresql or mysql")
