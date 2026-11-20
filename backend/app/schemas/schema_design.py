"""
Pydantic schemas for Phase 3: AI-Powered Database Schema Generation.
Defines normalized tables, columns, constraints, foreign keys, junction tables,
normalization checks, schema improvement suggestions, and Mermaid ER diagram code.
"""
from datetime import datetime
from typing import List, Optional
from uuid import UUID
from pydantic import BaseModel, Field


class ColumnDesign(BaseModel):
    name: str = Field(..., description="Column name in snake_case")
    data_type: str = Field(..., description="SQL data type (e.g. INTEGER, BIGINT, VARCHAR(255), TIMESTAMP, NUMERIC(10,2), BOOLEAN)")
    primary_key: bool = Field(default=False, description="Whether this column is part of the primary key")
    foreign_key: bool = Field(default=False, description="Whether this column references another table")
    references_table: Optional[str] = Field(default=None, description="Referenced table name")
    references_column: Optional[str] = Field(default=None, description="Referenced column name in the target table")
    nullable: bool = Field(default=False, description="Whether NULL values are permitted")
    unique: bool = Field(default=False, description="Whether UNIQUE constraint is applied")
    default: Optional[str] = Field(default=None, description="Default column value expression")
    check_constraint: Optional[str] = Field(default=None, description="Optional CHECK expression")
    description: Optional[str] = Field(default=None, description="Column business description")


class TableDesign(BaseModel):
    name: str = Field(..., description="Table name in plural or singular snake_case (e.g., students, departments)")
    description: Optional[str] = Field(default=None, description="Purpose and business context of this table")
    is_junction_table: bool = Field(default=False, description="Whether this is a many-to-many junction/link table")
    columns: List[ColumnDesign] = Field(default_factory=list, description="List of columns in the table")
    primary_key: List[str] = Field(default_factory=list, description="Primary key column name(s)")
    indexes: List[str] = Field(default_factory=list, description="Recommended index column names")


class RelationshipDesign(BaseModel):
    from_table: str = Field(..., description="Parent/Source table")
    to_table: str = Field(..., description="Child/Referencing table")
    cardinality: str = Field(..., description="Relationship cardinality: ONE_TO_ONE, ONE_TO_MANY, or MANY_TO_MANY")
    foreign_key_column: Optional[str] = Field(default=None, description="Foreign key column name")
    references_column: Optional[str] = Field(default=None, description="Target column in referenced table (usually PK)")
    junction_table: Optional[str] = Field(default=None, description="Junction table name for MANY_TO_MANY")
    on_delete: str = Field(default="CASCADE", description="Referential action ON DELETE")
    on_update: str = Field(default="CASCADE", description="Referential action ON UPDATE")
    description: Optional[str] = Field(default=None, description="Relationship description")


class SchemaImprovement(BaseModel):
    category: str = Field(..., description="Category: NORMALIZATION, INDEXING, DATA_INTEGRITY, or PERFORMANCE")
    title: str = Field(..., description="Short title of the improvement")
    description: str = Field(..., description="Detailed advice or architectural reasoning")
    severity: str = Field(default="SUGGESTION", description="Severity: SUGGESTION, LOW, MEDIUM, or HIGH")


class NormalizationReport(BaseModel):
    first_normal_form: bool = Field(default=True, description="1NF verified: Atomic values and primary key exists")
    second_normal_form: bool = Field(default=True, description="2NF verified: No partial functional dependency")
    third_normal_form: bool = Field(default=True, description="3NF verified: No transitive functional dependency")
    issues_found: List[str] = Field(default_factory=list, description="Any normalization issues detected")
    detected_duplicate_attributes: List[str] = Field(default_factory=list, description="Duplicate attributes across tables")


class CompleteSchemaDefinition(BaseModel):
    schema_name: str = Field(..., description="Name of the schema or database system")
    summary: Optional[str] = Field(default=None, description="Overview of the designed database architecture")
    tables: List[TableDesign] = Field(default_factory=list, description="List of normalized database tables")
    relationships: List[RelationshipDesign] = Field(default_factory=list, description="Relational links between tables")
    normalization_report: NormalizationReport = Field(default_factory=NormalizationReport, description="Normalization audit results")
    improvements: List[SchemaImprovement] = Field(default_factory=list, description="AI suggested schema improvements")
    mermaid_er: str = Field(default="", description="Mermaid ER diagram code representation")


# Request & Response schemas
class SchemaGenerateRequest(BaseModel):
    project_id: UUID
    database_dialect: str = Field(default="postgresql", description="Target dialect: postgresql or mysql")
    custom_instructions: Optional[str] = Field(default=None, description="Optional custom architectural instructions")


class SchemaUpdateRequest(BaseModel):
    schema_name: Optional[str] = None
    database_dialect: Optional[str] = None
    schema_definition: CompleteSchemaDefinition
    mermaid_er: Optional[str] = None


class SchemaResponse(BaseModel):
    id: UUID
    project_id: UUID
    schema_name: str
    database_dialect: str
    version: int
    schema_definition: CompleteSchemaDefinition
    mermaid_er: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
