"""
Requirements API Endpoints.
Covers requirement analysis via OpenRouter / AI, requirement review, and editing.
"""
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.models import User, Project, Requirement, UserRole
from app.schemas.requirement import (
    RequirementAnalyzeRequest,
    RequirementUpdateRequest,
    RequirementResponse,
)
from app.services.ai_analyzer import analyze_requirements
from app.auth.dependencies import get_current_user

router = APIRouter(prefix="/requirements", tags=["Requirements"])


@router.post("/analyze", response_model=RequirementResponse, status_code=status.HTTP_200_OK)
async def analyze_project_requirements(
    payload: RequirementAnalyzeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Analyze plain English requirements into structured entities, attributes, and relationships.
    Saves or updates the analysis record for the specified project.
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
            detail="Admin accounts have read-only inspection access to developer projects and cannot modify requirements."
        )
    if project.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to modify this project."
        )

    # Perform AI analysis
    analyzed_result = await analyze_requirements(payload.requirements_text)

    # Check if a requirement already exists for this project
    req_res = await db.execute(
        select(Requirement).where(Requirement.project_id == payload.project_id).order_by(Requirement.created_at.desc())
    )
    existing_req = req_res.scalars().first()

    if existing_req:
        existing_req.original_text = payload.requirements_text
        existing_req.analyzed_data = analyzed_result.model_dump()
        db.add(existing_req)
        await db.commit()
        await db.refresh(existing_req)
        return existing_req
    else:
        new_req = Requirement(
            project_id=payload.project_id,
            original_text=payload.requirements_text,
            analyzed_data=analyzed_result.model_dump(),
        )
        db.add(new_req)
        await db.commit()
        await db.refresh(new_req)
        return new_req


@router.get("/project/{project_id}", response_model=Optional[RequirementResponse])
async def get_project_requirement(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Retrieve the most recent analyzed requirement for a given project.
    """
    if current_user.role == UserRole.ADMIN:
        res = await db.execute(select(Project).where(Project.id == project_id))
    else:
        res = await db.execute(
            select(Project).where(Project.id == project_id, Project.user_id == current_user.id)
        )
    if not res.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")

    req_res = await db.execute(
        select(Requirement).where(Requirement.project_id == project_id).order_by(Requirement.created_at.desc())
    )
    req = req_res.scalars().first()
    return req


@router.get("/{requirement_id}", response_model=RequirementResponse)
async def get_requirement_by_id(
    requirement_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Retrieve requirement details by requirement ID.
    """
    if current_user.role == UserRole.ADMIN:
        req_res = await db.execute(select(Requirement).where(Requirement.id == requirement_id))
    else:
        req_res = await db.execute(
            select(Requirement).join(Project).where(
                Requirement.id == requirement_id,
                Project.user_id == current_user.id
            )
        )
    req = req_res.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Requirement not found")
    return req


@router.put("/{requirement_id}", response_model=RequirementResponse)
async def update_requirement(
    requirement_id: UUID,
    payload: RequirementUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Update requirement analysis (review and correct extracted entities/attributes).
    """
    req_res = await db.execute(select(Requirement).where(Requirement.id == requirement_id))
    req = req_res.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Requirement not found")

    proj_res = await db.execute(select(Project).where(Project.id == req.project_id))
    project = proj_res.scalar_one_or_none()
    if current_user.role == UserRole.ADMIN and project and project.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin accounts have read-only inspection access to developer projects and cannot modify requirements."
        )
    if project and project.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to modify this project."
        )

    if payload.original_text is not None:
        req.original_text = payload.original_text

    req.analyzed_data = payload.analyzed_data.model_dump()
    db.add(req)
    await db.commit()
    await db.refresh(req)
    return req
