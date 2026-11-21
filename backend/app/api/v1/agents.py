"""
Phase 6: Multi-Agent Workflow REST API Endpoints.
Endpoints:
  POST /api/agents/run-workflow
  GET  /api/agents/workflow-status/{execution_id}
  POST /api/agents/workflow-approve/{execution_id}
  GET  /api/agents/project/{project_id}/workflows
"""
import logging
from datetime import datetime, timezone
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.models import (
    User,
    Project,
    Schema,
    Migration,
    MigrationStatus,
    MigrationRiskLevel,
    MigrationHistory,
    AgentWorkflowExecution,
    WorkflowStatus,
)
from app.auth.dependencies import get_current_user
from app.schemas.agent_workflow import (
    WorkflowRunRequest,
    WorkflowApproveRequest,
    WorkflowStatusResponse,
)
from app.services.agent_workflow import (
    agent_workflow_app,
    human_approval_gate_node,
    AgentState,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/agents", tags=["Multi-Agent Orchestration"])


def _map_execution_to_response(execution: AgentWorkflowExecution) -> WorkflowStatusResponse:
    state = execution.workflow_state or {}
    return WorkflowStatusResponse(
        id=str(execution.id),
        project_id=str(execution.project_id),
        status=execution.status.value,
        current_step=execution.current_step,
        dialect=execution.dialect,
        requirements_text=execution.requirements_text,
        human_approval_required=execution.human_approval_required,
        is_approved=execution.is_approved,
        approved_by=execution.approved_by,
        approval_notes=execution.approval_notes,
        created_at=execution.created_at,
        updated_at=execution.updated_at,
        completed_at=execution.completed_at,
        steps_history=execution.steps_history or [],
        analyzed_requirements=state.get("analyzed_requirements"),
        designed_schema=state.get("designed_schema"),
        generated_sql=state.get("generated_sql"),
        validation_result=state.get("validation_result"),
        review_report=state.get("review_report"),
        diff_report=state.get("diff_report"),
        migration_sql=state.get("migration_sql"),
        rollback_sql=state.get("rollback_sql"),
        risk_level=state.get("risk_level"),
        error_message=state.get("error_message"),
    )


@router.post("/run-workflow", response_model=WorkflowStatusResponse)
async def run_agent_workflow(
    req: WorkflowRunRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Executes the autonomous multi-agent workflow:
    Requirement Analyzer -> Schema Designer -> SQL Generator -> Validation Agent -> Review Agent -> Migration Agent -> Human Approval Gate.
    """
    proj_res = await db.execute(select(Project).where(Project.id == req.project_id))
    project = proj_res.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if current_user.role == UserRole.ADMIN and project.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin accounts have read-only inspection access to developer projects and cannot execute workflows."
        )
    if project.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to modify this project."
        )

    # Load baseline schema if requested
    baseline_schema_dict = None
    if req.baseline_schema_id:
        base_res = await db.execute(select(Schema).where(Schema.id == req.baseline_schema_id))
        base_schema = base_res.scalar_one_or_none()
        if base_schema:
            baseline_schema_dict = base_schema.schema_definition

    # Create Initial Execution DB Entry
    execution = AgentWorkflowExecution(
        project_id=project.id,
        user_id=current_user.id,
        status=WorkflowStatus.RUNNING,
        current_step="INITIALIZING",
        dialect=req.dialect,
        requirements_text=req.requirements_text,
        workflow_state={},
        steps_history=[],
        human_approval_required=True,
    )
    db.add(execution)
    await db.commit()
    await db.refresh(execution)

    # Prepare Initial State
    initial_state: AgentState = {
        "workflow_id": str(execution.id),
        "project_id": str(project.id),
        "dialect": req.dialect.lower(),
        "requirements_text": req.requirements_text,
        "baseline_schema": baseline_schema_dict,
        "analyzed_requirements": None,
        "designed_schema": None,
        "mermaid_er": None,
        "generated_sql": None,
        "validation_result": None,
        "validation_retries": 0,
        "review_report": None,
        "risk_level": "SAFE",
        "diff_report": None,
        "migration_sql": None,
        "rollback_sql": None,
        "status": "RUNNING",
        "current_step": "START",
        "steps_history": [],
        "error_message": None,
        "human_approval_required": True,
        "is_approved": None,
        "approved_by": None,
        "approval_notes": None,
        "auto_apply_if_safe": req.auto_apply_if_safe,
    }

    try:
        # Run graph execution
        final_state = agent_workflow_app.invoke(initial_state)

        # Update DB entity
        execution.status = WorkflowStatus(final_state.get("status", "FAILED"))
        execution.current_step = final_state.get("current_step", "UNKNOWN")
        execution.human_approval_required = final_state.get("human_approval_required", True)
        execution.is_approved = final_state.get("is_approved")
        execution.approved_by = final_state.get("approved_by")
        execution.workflow_state = final_state
        execution.steps_history = final_state.get("steps_history", [])

        if execution.status == WorkflowStatus.COMPLETED:
            execution.completed_at = datetime.now(timezone.utc)

        await db.commit()
        await db.refresh(execution)

        return _map_execution_to_response(execution)

    except Exception as e:
        logger.exception("Agent workflow orchestration failed")
        execution.status = WorkflowStatus.FAILED
        execution.current_step = "EXECUTION_ERROR"
        await db.commit()
        raise HTTPException(
            status_code=500,
            detail=f"Workflow orchestration encountered an error: {str(e)}",
        )


@router.get("/workflow-status/{execution_id}", response_model=WorkflowStatusResponse)
async def get_workflow_status(
    execution_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieves current execution status, step progression, and agent artifacts."""
    res = await db.execute(
        select(AgentWorkflowExecution).where(AgentWorkflowExecution.id == execution_id)
    )
    execution = res.scalar_one_or_none()
    if not execution:
        raise HTTPException(status_code=404, detail="Workflow execution not found")

    proj_res = await db.execute(select(Project).where(Project.id == execution.project_id))
    project = proj_res.scalar_one_or_none()
    if current_user.role == UserRole.ADMIN and project and project.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin accounts have read-only inspection access to developer projects and cannot approve developer workflows."
        )
    if project and project.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to modify this project."
        )

    return _map_execution_to_response(execution)


@router.post("/workflow-approve/{execution_id}", response_model=WorkflowStatusResponse)
async def approve_workflow(
    execution_id: UUID,
    req: WorkflowApproveRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Human-in-the-loop decision endpoint.
    Approves or rejects the migration and optionally executes the migration upon approval.
    """
    res = await db.execute(
        select(AgentWorkflowExecution).where(AgentWorkflowExecution.id == execution_id)
    )
    execution = res.scalar_one_or_none()
    if not execution:
        raise HTTPException(status_code=404, detail="Workflow execution not found")

    proj_res = await db.execute(select(Project).where(Project.id == execution.project_id))
    project = proj_res.scalar_one_or_none()
    if current_user.role == UserRole.ADMIN and project and project.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin accounts have read-only inspection access to developer projects and cannot approve developer workflows."
        )
    if project and project.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to modify this project."
        )

    if execution.status != WorkflowStatus.AWAITING_HUMAN_APPROVAL:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot approve workflow in '{execution.status.value}' state. Must be 'AWAITING_HUMAN_APPROVAL'.",
        )

    # Resume state from checkpoint
    state: AgentState = execution.workflow_state or {}
    state["is_approved"] = req.approved
    state["approved_by"] = current_user.email
    state["approval_notes"] = req.notes

    # Evaluate Human Approval Gate
    final_state = human_approval_gate_node(state)

    execution.status = WorkflowStatus(final_state.get("status", "COMPLETED" if req.approved else "REJECTED"))
    execution.current_step = final_state.get("current_step", "COMPLETED" if req.approved else "REJECTED")
    execution.is_approved = req.approved
    execution.approved_by = current_user.email
    execution.approval_notes = req.notes
    execution.completed_at = datetime.now(timezone.utc)
    execution.steps_history = final_state.get("steps_history", [])
    execution.workflow_state = final_state

    # If approved and user wants to apply the migration
    if req.approved and req.apply_migration:
        # Save proposed schema to schemas table
        designed_schema = final_state.get("designed_schema")
        mermaid_er = final_state.get("mermaid_er")
        dialect = final_state.get("dialect", "postgresql")

        saved_schema = None
        if designed_schema:
            schema_name = designed_schema.get("schema_name", "AI Designed Schema")
            # Calculate next version
            latest_res = await db.execute(
                select(Schema)
                .where(Schema.project_id == execution.project_id)
                .order_by(Schema.version.desc())
            )
            latest_schema = latest_res.scalars().first()
            next_ver = (latest_schema.version + 1) if latest_schema else 1

            saved_schema = Schema(
                project_id=execution.project_id,
                schema_name=schema_name,
                schema_definition=designed_schema,
                database_dialect=dialect,
                version=next_ver,
                mermaid_er=mermaid_er,
            )
            db.add(saved_schema)
            await db.flush()

        # Save migration record
        migration_sql = final_state.get("migration_sql") or ""
        rollback_sql = final_state.get("rollback_sql") or ""
        diff_report = final_state.get("diff_report") or {}
        risk_level_str = final_state.get("risk_level", "SAFE")

        migration = Migration(
            project_id=execution.project_id,
            source_schema_id=None,
            target_schema_id=saved_schema.id if saved_schema else execution.project_id,
            database_dialect=dialect,
            migration_sql=migration_sql,
            rollback_sql=rollback_sql,
            status=MigrationStatus.EXECUTED,
            risk_level=MigrationRiskLevel(risk_level_str),
            detected_diff=diff_report,
            executed_at=datetime.now(timezone.utc),
        )
        db.add(migration)
        await db.flush()

        # Add history audit entry
        history_entry = MigrationHistory(
            migration_id=migration.id,
            version=saved_schema.version if saved_schema else 1,
            execution_status="SUCCESS",
            executed_by=current_user.email,
            execution_timestamp=datetime.now(timezone.utc),
        )
        db.add(history_entry)

    await db.commit()
    await db.refresh(execution)

    return _map_execution_to_response(execution)


@router.get("/project/{project_id}/workflows", response_model=List[WorkflowStatusResponse])
async def get_project_workflows(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lists all agent workflow executions for a project."""
    res = await db.execute(
        select(AgentWorkflowExecution)
        .where(AgentWorkflowExecution.project_id == project_id)
        .order_by(AgentWorkflowExecution.created_at.desc())
    )
    executions = res.scalars().all()
    return [_map_execution_to_response(e) for e in executions]
