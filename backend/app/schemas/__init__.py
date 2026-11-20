from app.schemas.auth import UserRegister, UserLogin, UserResponse, TokenResponse
from app.schemas.project import ProjectCreate, ProjectUpdate, ProjectResponse
from app.schemas.requirement import (
    AttributeDefinition,
    EntityDefinition,
    RelationshipDefinition,
    ConstraintDefinition,
    AnalyzedRequirement,
    RequirementAnalyzeRequest,
    RequirementUpdateRequest,
    RequirementResponse,
)
from app.schemas.schema_design import (
    ColumnDesign,
    TableDesign,
    RelationshipDesign,
    SchemaImprovement,
    NormalizationReport,
    CompleteSchemaDefinition,
    SchemaGenerateRequest,
    SchemaUpdateRequest,
    SchemaResponse,
)
from app.schemas.sql_generation import (
    SQLValidationError,
    SQLValidationResult,
    SQLGenerateRequest,
    SQLGenerateResponse,
    SQLValidateRequest,
)
from app.schemas.migration import (
    SchemaDiffItem,
    SchemaDiffReport,
    MigrationCompareRequest,
    MigrationGenerateRequest,
    MigrationExecuteRequest,
    MigrationHistoryResponse,
    MigrationResponse,
)

__all__ = [
    "UserRegister", "UserLogin", "UserResponse", "TokenResponse",
    "ProjectCreate", "ProjectUpdate", "ProjectResponse",
    "AttributeDefinition", "EntityDefinition", "RelationshipDefinition",
    "ConstraintDefinition", "AnalyzedRequirement", "RequirementAnalyzeRequest",
    "RequirementUpdateRequest", "RequirementResponse",
    "ColumnDesign", "TableDesign", "RelationshipDesign", "SchemaImprovement",
    "NormalizationReport", "CompleteSchemaDefinition", "SchemaGenerateRequest",
    "SchemaUpdateRequest", "SchemaResponse",
    "SQLValidationError", "SQLValidationResult", "SQLGenerateRequest",
    "SQLGenerateResponse", "SQLValidateRequest",
    "SchemaDiffItem", "SchemaDiffReport", "MigrationCompareRequest",
    "MigrationGenerateRequest", "MigrationExecuteRequest",
    "MigrationHistoryResponse", "MigrationResponse",
]
