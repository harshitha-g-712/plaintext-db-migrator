"""
Pydantic schemas for Natural Language Requirement Analysis.
Validates structured entity, attribute, relationship, constraint, and business rule definitions.
"""
from datetime import datetime
from typing import List, Optional
from uuid import UUID
from pydantic import BaseModel, Field


class AttributeDefinition(BaseModel):
    name: str = Field(..., description="Attribute/column name in snake_case (e.g., student_id, first_name)")
    type: str = Field(..., description="Suggested SQL data type (e.g., INTEGER, VARCHAR(255), TIMESTAMP, BOOLEAN, DECIMAL(10,2))")
    primary_key: bool = Field(default=False, description="Whether this attribute is a primary key candidate")
    foreign_key: bool = Field(default=False, description="Whether this attribute is a foreign key candidate")
    references: Optional[str] = Field(default=None, description="Referenced entity and attribute if foreign key (e.g., Department.department_id)")
    nullable: bool = Field(default=False, description="Whether null values are permitted")
    unique: bool = Field(default=False, description="Whether values must be unique across rows")
    default_value: Optional[str] = Field(default=None, description="Default value if specified")
    description: Optional[str] = Field(default=None, description="Business meaning or description of this attribute")


class EntityDefinition(BaseModel):
    name: str = Field(..., description="Entity/table name in singular PascalCase or plural (e.g., Student, Department)")
    description: Optional[str] = Field(default=None, description="Brief explanation of what this entity represents")
    attributes: List[AttributeDefinition] = Field(default_factory=list, description="List of attributes belonging to this entity")


class RelationshipDefinition(BaseModel):
    source_entity: str = Field(..., description="Source entity name")
    target_entity: str = Field(..., description="Target entity name")
    relationship_type: str = Field(
        ...,
        description="Cardinality: ONE_TO_ONE, ONE_TO_MANY, or MANY_TO_MANY"
    )
    foreign_key_column: Optional[str] = Field(
        default=None,
        description="Foreign key column name used to establish the link"
    )
    junction_table: Optional[str] = Field(
        default=None,
        description="Name of junction table if relationship is MANY_TO_MANY"
    )
    description: Optional[str] = Field(
        default=None,
        description="Natural language explanation of the relationship"
    )


class ConstraintDefinition(BaseModel):
    entity: str = Field(..., description="Entity on which the constraint is applied")
    type: str = Field(..., description="Constraint type: PRIMARY_KEY, FOREIGN_KEY, UNIQUE, NOT_NULL, or CHECK")
    columns: List[str] = Field(default_factory=list, description="Target column(s)")
    details: Optional[str] = Field(default=None, description="Details or expression of the constraint")


class AnalyzedRequirement(BaseModel):
    summary: Optional[str] = Field(default=None, description="High-level overview of the proposed database design")
    entities: List[EntityDefinition] = Field(default_factory=list, description="Extracted entities and their attributes")
    relationships: List[RelationshipDefinition] = Field(default_factory=list, description="Identified relationships between entities")
    constraints: List[ConstraintDefinition] = Field(default_factory=list, description="Database constraints")
    business_rules: List[str] = Field(default_factory=list, description="Extracted business rules and domain logic")


# Request & Response schemas
class RequirementAnalyzeRequest(BaseModel):
    project_id: UUID
    requirements_text: str = Field(..., min_length=10, description="Plain English database specification")


class RequirementUpdateRequest(BaseModel):
    original_text: Optional[str] = None
    analyzed_data: AnalyzedRequirement


class RequirementResponse(BaseModel):
    id: UUID
    project_id: UUID
    original_text: str
    analyzed_data: AnalyzedRequirement
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
