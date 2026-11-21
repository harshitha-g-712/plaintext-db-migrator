"""
SQL Generation & Validation API Endpoints.
Covers DDL generation for PostgreSQL and MySQL, real-time SQLGlot validation,
syntax checking, and dialect inspection.
"""
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.models import User, Project, Schema, UserRole
from app.schemas.schema_design import CompleteSchemaDefinition
from app.schemas.sql_generation import (
    SQLGenerateRequest,
    SQLGenerateResponse,
    SQLValidateRequest,
    SQLValidationResult,
)
from app.services.sql_agent import SQLGeneratorAgent, SQLValidationAgent
from app.auth.dependencies import get_current_user

router = APIRouter(prefix="/sql", tags=["SQL Generation & Validation"])


@router.post("/generate", response_model=SQLGenerateResponse, status_code=status.HTTP_200_OK)
async def generate_sql(
    payload: SQLGenerateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Generate production-ready SQL (CREATE TABLE, PRIMARY KEY, FOREIGN KEY, INDEX, CHECK)
    from an approved database schema for PostgreSQL or MySQL.
    Validates the generated SQL using SQLGlot before returning.
    """
    # Fetch schema and verify ownership
    if current_user.role == UserRole.ADMIN:
        schema_res = await db.execute(select(Schema).where(Schema.id == payload.schema_id))
    else:
        schema_res = await db.execute(
            select(Schema).join(Project).where(
                Schema.id == payload.schema_id,
                Project.user_id == current_user.id,
            )
        )
    schema_record = schema_res.scalar_one_or_none()
    if not schema_record:
        raise HTTPException(status_code=404, detail="Schema not found or access denied.")

    schema_def = CompleteSchemaDefinition.model_validate(schema_record.schema_definition)

    # Generate SQL
    generated_sql = SQLGeneratorAgent.generate(
        schema_def=schema_def,
        dialect=payload.database_dialect,
        include_database_creation=payload.include_database_creation,
        include_drop_tables=payload.include_drop_tables,
        include_indexes=payload.include_indexes,
    )

    # Validate generated SQL with SQLGlot
    validation_res = SQLValidationAgent.validate(
        sql_content=generated_sql,
        dialect=payload.database_dialect,
    )

    return SQLGenerateResponse(
        schema_id=payload.schema_id,
        database_dialect=payload.database_dialect,
        generated_sql=generated_sql,
        validation_result=validation_res,
        table_count=len(schema_def.tables),
        statement_count=validation_res.total_statements,
    )


@router.post("/validate", response_model=SQLValidationResult, status_code=status.HTTP_200_OK)
async def validate_sql(
    payload: SQLValidateRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Validate arbitrary SQL statements using SQLGlot AST inspection.
    Checks syntax errors, missing primary keys, invalid foreign key targets,
    duplicate column names, and dialect compatibility.
    """
    validation_result = SQLValidationAgent.validate(
        sql_content=payload.sql_content,
        dialect=payload.database_dialect,
    )
    return validation_result


@router.get("/{schema_id}", response_model=SQLGenerateResponse)
async def get_sql_by_schema(
    schema_id: UUID,
    database_dialect: Optional[str] = "postgresql",
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Retrieve generated SQL for a schema ID. Generates on the fly if not cached.
    """
    schema_res = await db.execute(
        select(Schema).join(Project).where(
            Schema.id == schema_id,
            Project.user_id == current_user.id,
        )
    )
    schema_record = schema_res.scalar_one_or_none()
    if not schema_record:
        raise HTTPException(status_code=404, detail="Schema not found")

    dialect = database_dialect or schema_record.database_dialect or "postgresql"
    schema_def = CompleteSchemaDefinition.model_validate(schema_record.schema_definition)

    generated_sql = SQLGeneratorAgent.generate(
        schema_def=schema_def,
        dialect=dialect,
    )

    validation_res = SQLValidationAgent.validate(
        sql_content=generated_sql,
        dialect=dialect,
    )

    return SQLGenerateResponse(
        schema_id=schema_id,
        database_dialect=dialect,
        generated_sql=generated_sql,
        validation_result=validation_res,
        table_count=len(schema_def.tables),
        statement_count=validation_res.total_statements,
    )
