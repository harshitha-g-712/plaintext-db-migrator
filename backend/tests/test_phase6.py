"""
Phase 6: Multi-Agent Orchestration with LangGraph Unit Tests.
Tests:
  1. Full multi-agent autonomous workflow pipeline (Requirement -> Schema -> SQL -> Validation -> Review -> Migration).
  2. Human-in-the-loop approval gate (rejection and approval branches).
  3. Schema evolution workflow comparing against a baseline schema.
"""
import pytest
from app.services.agent_workflow import (
    agent_workflow_app,
    human_approval_gate_node,
    AgentState,
)


def test_multi_agent_workflow_e2e_college():
    """Tests the full multi-agent workflow from plain English requirements to migration and approval pause."""
    college_req = """
    Create a college management database.
    A student has student ID, name, email and phone number.
    A department has department ID and department name.
    Each student belongs to one department.
    A department can have multiple students.
    """

    initial_state: AgentState = {
        "workflow_id": "test-wf-1",
        "project_id": "test-proj-1",
        "dialect": "postgresql",
        "requirements_text": college_req.strip(),
        "baseline_schema": None,
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
        "auto_apply_if_safe": False,
    }

    final_state = agent_workflow_app.invoke(initial_state)

    # 1. State must pause at human approval gate
    assert final_state["status"] == "AWAITING_HUMAN_APPROVAL"
    assert final_state["current_step"] == "HUMAN_APPROVAL_GATE"
    assert final_state["human_approval_required"] is True

    # 2. Requirement Analyzer Agent check
    assert final_state["analyzed_requirements"] is not None
    entity_names = [e["name"].lower() for e in final_state["analyzed_requirements"]["entities"]]
    assert "student" in entity_names
    assert "department" in entity_names

    # 3. Schema Designer Agent check
    assert final_state["designed_schema"] is not None
    table_names = [t["name"].lower() for t in final_state["designed_schema"]["tables"]]
    assert any("student" in t for t in table_names)
    assert any("department" in t for t in table_names)
    assert final_state["mermaid_er"] is not None
    assert "erDiagram" in final_state["mermaid_er"]

    # 4. SQL Generator Agent check
    assert final_state["generated_sql"] is not None
    assert "CREATE TABLE" in final_state["generated_sql"]
    assert "PRIMARY KEY" in final_state["generated_sql"]

    # 5. Validation Agent check
    assert final_state["validation_result"] is not None
    assert final_state["validation_result"]["is_valid"] is True

    # 6. Review Agent check
    assert final_state["review_report"] is not None
    assert "architecture_rating" in final_state["review_report"]
    assert final_state["risk_level"] in ["SAFE", "LOW"]

    # 7. Migration Agent check
    assert final_state["migration_sql"] is not None
    assert "CREATE TABLE" in final_state["migration_sql"]
    assert final_state["rollback_sql"] is not None
    assert "DROP TABLE" in final_state["rollback_sql"]

    # 8. Step History audit
    step_names = [s["step"] for s in final_state["steps_history"]]
    assert "REQUIREMENT_ANALYSIS" in step_names
    assert "SCHEMA_DESIGN" in step_names
    assert "SQL_GENERATION" in step_names
    assert "VALIDATION" in step_names
    assert "REVIEW_AND_RISK" in step_names
    assert "MIGRATION_GENERATION" in step_names
    assert "HUMAN_APPROVAL_GATE" in step_names


def test_human_approval_gate_decision_branches():
    """Tests human approval gate behavior for rejection and approval."""
    base_state: AgentState = {
        "workflow_id": "test-wf-2",
        "project_id": "test-proj-2",
        "dialect": "postgresql",
        "requirements_text": "sample requirements",
        "baseline_schema": None,
        "analyzed_requirements": None,
        "designed_schema": None,
        "mermaid_er": None,
        "generated_sql": None,
        "validation_result": None,
        "validation_retries": 0,
        "review_report": None,
        "risk_level": "HIGH",
        "diff_report": None,
        "migration_sql": "DROP TABLE old_table;",
        "rollback_sql": "CREATE TABLE old_table (id INT);",
        "status": "AWAITING_HUMAN_APPROVAL",
        "current_step": "HUMAN_APPROVAL_GATE",
        "steps_history": [],
        "error_message": None,
        "human_approval_required": True,
        "is_approved": None,
        "approved_by": None,
        "approval_notes": None,
        "auto_apply_if_safe": False,
    }

    # Branch A: Human Rejection
    rejection_state = dict(base_state)
    rejection_state["is_approved"] = False
    rejection_state["approved_by"] = "lead_dba@example.com"
    rejection_state["approval_notes"] = "Data loss risk is unacceptably high. Add archiving first."

    outcome_rejected = human_approval_gate_node(rejection_state)
    assert outcome_rejected["status"] == "REJECTED"
    assert outcome_rejected["is_approved"] is False

    # Branch B: Human Approval
    approval_state = dict(base_state)
    approval_state["is_approved"] = True
    approval_state["approved_by"] = "senior_engineer@example.com"
    approval_state["approval_notes"] = "Reviewed diff, approved for maintenance window."

    outcome_approved = human_approval_gate_node(approval_state)
    assert outcome_approved["status"] == "COMPLETED"
    assert outcome_approved["is_approved"] is True


def test_multi_agent_evolution_with_baseline():
    """Tests the multi-agent workflow when given an existing baseline schema."""
    baseline_schema = {
        "schema_name": "Students V1",
        "database_dialect": "postgresql",
        "tables": [
            {
                "name": "students",
                "description": "Student table",
                "columns": [
                    {"name": "student_id", "type": "INTEGER", "primary_key": True, "nullable": False, "unique": True},
                    {"name": "name", "type": "VARCHAR(255)", "primary_key": False, "nullable": False, "unique": False},
                ]
            },
            {
                "name": "departments",
                "description": "Department table",
                "columns": [
                    {"name": "department_id", "type": "INTEGER", "primary_key": True, "nullable": False, "unique": True},
                    {"name": "department_name", "type": "VARCHAR(255)", "primary_key": False, "nullable": False, "unique": False},
                ]
            }
        ],
        "relationships": [],
        "mermaid_er": ""
    }

    evolved_req = """
    Create a college management database.
    A student has student ID, name, email and phone number.
    A department has department ID and department name.
    Each student belongs to one department.
    A department can have multiple students.
    """

    initial_state: AgentState = {
        "workflow_id": "test-wf-3",
        "project_id": "test-proj-3",
        "dialect": "postgresql",
        "requirements_text": evolved_req.strip(),
        "baseline_schema": baseline_schema,
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
        "auto_apply_if_safe": False,
    }

    final_state = agent_workflow_app.invoke(initial_state)

    assert final_state["status"] == "AWAITING_HUMAN_APPROVAL"
    assert final_state["diff_report"] is not None
    # Check that columns added were detected in diff report
    added_cols = final_state["diff_report"]["columns_added"]
    assert any("email" in c for c in added_cols) or any("phone" in c for c in added_cols)
    # Forward migration SQL must contain ALTER TABLE ADD COLUMN
    assert "ALTER TABLE" in final_state["migration_sql"]
    assert "ADD COLUMN" in final_state["migration_sql"]
