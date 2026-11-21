"""
Project CRUD endpoints.
"""
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.models import User, Project, UserRole
from app.schemas.project import ProjectCreate, ProjectUpdate, ProjectResponse
from app.auth.dependencies import get_current_user

router = APIRouter(prefix="/projects", tags=["Projects"])


@router.post("/", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    payload: ProjectCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = Project(
        user_id=current_user.id,
        project_name=payload.project_name,
        description=payload.description,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return ProjectResponse(
        id=project.id,
        user_id=project.user_id,
        project_name=project.project_name,
        description=project.description,
        created_at=project.created_at,
        updated_at=project.updated_at,
        owner_name=current_user.name,
        owner_email=current_user.email,
    )


@router.get("/", response_model=List[ProjectResponse])
async def list_projects(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role == UserRole.ADMIN:
        stmt = select(Project).options(selectinload(Project.owner)).order_by(Project.created_at.desc())
    else:
        stmt = select(Project).options(selectinload(Project.owner)).where(Project.user_id == current_user.id).order_by(Project.created_at.desc())
    result = await db.execute(stmt)
    projects = result.scalars().all()
    resp = []
    for p in projects:
        resp.append(ProjectResponse(
            id=p.id,
            user_id=p.user_id,
            project_name=p.project_name,
            description=p.description,
            created_at=p.created_at,
            updated_at=p.updated_at,
            owner_name=p.owner.name if p.owner else None,
            owner_email=p.owner.email if p.owner else None,
        ))
    return resp


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role == UserRole.ADMIN:
        stmt = select(Project).options(selectinload(Project.owner)).where(Project.id == project_id)
    else:
        stmt = select(Project).options(selectinload(Project.owner)).where(Project.id == project_id, Project.user_id == current_user.id)
    result = await db.execute(stmt)
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return ProjectResponse(
        id=project.id,
        user_id=project.user_id,
        project_name=project.project_name,
        description=project.description,
        created_at=project.created_at,
        updated_at=project.updated_at,
        owner_name=project.owner.name if project.owner else None,
        owner_email=project.owner.email if project.owner else None,
    )


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: UUID,
    payload: ProjectUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Project).options(selectinload(Project.owner)).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if current_user.role == UserRole.ADMIN and project.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin accounts have read-only inspection access to developer projects and cannot modify them."
        )
    if project.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="You do not have permission to modify this project.")
    if payload.project_name is not None:
        project.project_name = payload.project_name
    if payload.description is not None:
        project.description = payload.description
    await db.commit()
    await db.refresh(project)
    return ProjectResponse(
        id=project.id,
        user_id=project.user_id,
        project_name=project.project_name,
        description=project.description,
        created_at=project.created_at,
        updated_at=project.updated_at,
        owner_name=project.owner.name if project.owner else None,
        owner_email=project.owner.email if project.owner else None,
    )


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if current_user.role == UserRole.ADMIN and project.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin accounts have read-only inspection access to developer projects and cannot delete them."
        )
    if project.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="You do not have permission to delete this project.")
    await db.delete(project)
    await db.commit()
    await db.commit()
