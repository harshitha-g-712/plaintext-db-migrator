"""
Schema API Endpoints.
Covers schema generation from analyzed requirements, fetching schema, and manual editing.
"""
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.models import User, Project, Requirement, Schema, UserRole
from app.schemas.requirement import AnalyzedRequirement
from app.schemas.schema_design import (
    SchemaGenerateRequest,
    SchemaUpdateRequest,
    SchemaResponse,
)
from app.services.schema_designer import design_schema
from app.auth.dependencies import get_current_user

router = APIRouter(prefix="/schema", tags=["Schema"])


@router.post("/generate", response_model=SchemaResponse, status_code=status.HTTP_200_OK)
async def generate_database_schema(
    payload: SchemaGenerateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Generate a complete, normalized relational database schema from analyzed requirements.
    Performs normalization audit (1NF-3NF), generates Mermaid ER code, and saves versioned schema.
    """
    # Verify project
    res = await db.execute(select(Project).where(Project.id == payload.project_id))
    project = res.scalar_one_or_none()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found."
        )

    # Enforce Admin read-only rule
    if current_user.role == UserRole.ADMIN and project.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin accounts have read-only inspection access to developer projects and cannot generate schemas."
        )
    if project.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to modify this project."
        )

    # Fetch latest requirement for this project
    req_res = await db.execute(
        select(Requirement).where(Requirement.project_id == payload.project_id).order_by(Requirement.created_at.desc())
    )
    requirement = req_res.scalars().first()
    if not requirement:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No analyzed requirements found for this project. Please analyze your natural language requirements first (Phase 2)."
        )

    analyzed_req = AnalyzedRequirement.model_validate(requirement.analyzed_data)

    # Invoke Schema Designer Agent
    schema_design = await design_schema(
        requirement=analyzed_req,
        dialect=payload.database_dialect,
        custom_instructions=payload.custom_instructions,
    )

    # Determine schema version
    ver_res = await db.execute(
        select(Schema).where(Schema.project_id == payload.project_id).order_by(Schema.version.desc())
    )
    latest_schema = ver_res.scalars().first()
    next_version = (latest_schema.version + 1) if latest_schema else 1

    # Save schema in database
    new_schema = Schema(
        project_id=payload.project_id,
        schema_name=schema_design.schema_name or f"{project.project_name.replace(' ', '_')}_schema",
        schema_definition=schema_design.model_dump(),
        database_dialect=payload.database_dialect,
        version=next_version,
        mermaid_er=schema_design.mermaid_er,
    )
    db.add(new_schema)
    await db.commit()
    await db.refresh(new_schema)
    return new_schema


@router.get("/project/{project_id}", response_model=Optional[SchemaResponse])
async def get_latest_project_schema(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Retrieve the most recent generated schema for a given project.
    """
    if current_user.role == UserRole.ADMIN:
        res = await db.execute(select(Project).where(Project.id == project_id))
    else:
        res = await db.execute(
            select(Project).where(Project.id == project_id, Project.user_id == current_user.id)
        )
    if not res.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")

    schema_res = await db.execute(
        select(Schema).where(Schema.project_id == project_id).order_by(Schema.version.desc())
    )
    return schema_res.scalars().first()


@router.get("/{id}", response_model=SchemaResponse)
async def get_schema_by_id(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Retrieve a schema by its specific schema ID.
    """
    if current_user.role == UserRole.ADMIN:
        schema_res = await db.execute(select(Schema).where(Schema.id == id))
    else:
        schema_res = await db.execute(
            select(Schema).join(Project).where(Schema.id == id, Project.user_id == current_user.id)
        )
    schema_record = schema_res.scalar_one_or_none()
    if not schema_record:
        raise HTTPException(status_code=404, detail="Schema not found")
    return schema_record


@router.put("/{id}", response_model=SchemaResponse)
async def update_schema_by_id(
    id: UUID,
    payload: SchemaUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Update or modify an existing schema definition and its ER diagram.
    """
    schema_res = await db.execute(select(Schema).where(Schema.id == id))
    schema_record = schema_res.scalar_one_or_none()
    if not schema_record:
        raise HTTPException(status_code=404, detail="Schema not found")

    proj_res = await db.execute(select(Project).where(Project.id == schema_record.project_id))
    project = proj_res.scalar_one_or_none()
    if current_user.role == UserRole.ADMIN and project and project.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin accounts have read-only inspection access to developer projects and cannot modify schemas."
        )
    if project and project.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to modify this project."
        )

    if payload.schema_name is not None:
        schema_record.schema_name = payload.schema_name
    if payload.database_dialect is not None:
        schema_record.database_dialect = payload.database_dialect

    schema_record.schema_definition = payload.schema_definition.model_dump()
    if payload.mermaid_er is not None:
        schema_record.mermaid_er = payload.mermaid_er
    else:
        schema_record.mermaid_er = payload.schema_definition.mermaid_er

    db.add(schema_record)
    await db.commit()
    await db.refresh(schema_record)
    return schema_record
