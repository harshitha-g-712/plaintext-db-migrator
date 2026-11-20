from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class WorkflowRunRequest(BaseModel):
    project_id: str
    requirements_text: str = Field(..., min_length=10, description="Plain English database requirements")
    dialect: str = Field(default="postgresql", description="Target SQL dialect: postgresql or mysql")
    baseline_schema_id: Optional[str] = Field(default=None, description="Optional existing schema to compute migration diff against")
    auto_apply_if_safe: bool = Field(default=False, description="Automatically apply migration if risk level is SAFE and no destructive changes")


class WorkflowApproveRequest(BaseModel):
    approved: bool = Field(..., description="Whether to approve or reject the migration")
    notes: Optional[str] = Field(default=None, description="Human reviewer feedback or approval notes")
    apply_migration: bool = Field(default=True, description="Whether to execute the migration upon approval")


class WorkflowStepLog(BaseModel):
    step: str
    agent: str
    status: str
    timestamp: str
    summary: str
    details: Optional[Dict[str, Any]] = None


class WorkflowStatusResponse(BaseModel):
    id: str
    project_id: str
    status: str
    current_step: str
    dialect: str
    requirements_text: str
    human_approval_required: bool
    is_approved: Optional[bool] = None
    approved_by: Optional[str] = None
    approval_notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None
    steps_history: List[Dict[str, Any]] = []
    
    # Artifacts produced by agents
    analyzed_requirements: Optional[Dict[str, Any]] = None
    designed_schema: Optional[Dict[str, Any]] = None
    generated_sql: Optional[str] = None
    validation_result: Optional[Dict[str, Any]] = None
    review_report: Optional[Dict[str, Any]] = None
    diff_report: Optional[Dict[str, Any]] = None
    migration_sql: Optional[str] = None
    rollback_sql: Optional[str] = None
    risk_level: Optional[str] = None
    error_message: Optional[str] = None

    class Config:
        from_attributes = True
