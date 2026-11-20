"""
Phase 6: Multi-Agent Orchestration with LangGraph.
Coordinates Requirement Analysis, Schema Design, SQL Generation, Validation,
Review / Risk Assessment, Migration Generation, and Human-in-the-Loop Approval.
"""
import asyncio
import concurrent.futures
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple, TypedDict
from uuid import UUID

from langgraph.graph import StateGraph, END

from app.schemas.requirement import AnalyzedRequirement
from app.schemas.schema_design import CompleteSchemaDefinition
from app.schemas.migration import SchemaDiffReport
from app.services.ai_analyzer import analyze_requirements, _heuristic_analyzer
from app.services.schema_designer import design_schema, _heuristic_schema_designer
from app.services.sql_agent import SQLGeneratorAgent, SQLValidationAgent
from app.services.migration_engine import SchemaComparisonEngine, MigrationGeneratorAgent

logger = logging.getLogger(__name__)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_schema_dict(d: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Ensures compatibility between column 'type' and 'data_type' in schema dictionary."""
    if not d:
        return None
    cleaned = dict(d)
    if "tables" in cleaned:
        tables = []
        for t in cleaned["tables"]:
            t_dict = dict(t)
            if "columns" in t_dict:
                cols = []
                for c in t_dict["columns"]:
                    c_dict = dict(c)
                    if "type" in c_dict and "data_type" not in c_dict:
                        c_dict["data_type"] = c_dict["type"]
                    cols.append(c_dict)
                t_dict["columns"] = cols
            tables.append(t_dict)
        cleaned["tables"] = tables
    return cleaned


def _run_coroutine_sync(coro, fallback_fn, *fallback_args):
    """Safely executes an async coroutine synchronously, falling back to a sync function if execution fails."""
    try:
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None

        if loop and loop.is_running():
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
                return executor.submit(asyncio.run, coro).result(timeout=45.0)
        else:
            return asyncio.run(coro)
    except Exception as exc:
        logger.warning("Async execution encountered issue (%s). Using fallback engine.", exc)
        return fallback_fn(*fallback_args)


# ── LangGraph Agent Shared State ──────────────────────────────────────────────

class AgentState(TypedDict):
    workflow_id: str
    project_id: str
    dialect: str
    requirements_text: str
    baseline_schema: Optional[Dict[str, Any]]
    analyzed_requirements: Optional[Dict[str, Any]]
    designed_schema: Optional[Dict[str, Any]]
    mermaid_er: Optional[str]
    generated_sql: Optional[str]
    validation_result: Optional[Dict[str, Any]]
    validation_retries: int
    review_report: Optional[Dict[str, Any]]
    risk_level: str
    diff_report: Optional[Dict[str, Any]]
    migration_sql: Optional[str]
    rollback_sql: Optional[str]
    status: str
    current_step: str
    steps_history: List[Dict[str, Any]]
    error_message: Optional[str]
    human_approval_required: bool
    is_approved: Optional[bool]
    approved_by: Optional[str]
    approval_notes: Optional[str]
    auto_apply_if_safe: bool


def _add_step(
    state: AgentState,
    step: str,
    agent: str,
    status: str,
    summary: str,
    details: Optional[Dict[str, Any]] = None,
) -> None:
    if "steps_history" not in state or state["steps_history"] is None:
        state["steps_history"] = []
    state["steps_history"].append({
        "step": step,
        "agent": agent,
        "status": status,
        "timestamp": _utc_now_iso(),
        "summary": summary,
        "details": details or {},
    })


# ── Agent 1: Requirement Analyzer Agent ───────────────────────────────────────

def requirement_analyzer_node(state: AgentState) -> AgentState:
    """Extracts entities, attributes, relationships, and business rules from plain English."""
    state["current_step"] = "REQUIREMENT_ANALYSIS"
    try:
        raw_text = state["requirements_text"]
        analyzed_data: AnalyzedRequirement = _run_coroutine_sync(
            analyze_requirements(raw_text),
            _heuristic_analyzer,
            raw_text,
        )
        state["analyzed_requirements"] = analyzed_data.model_dump()
        entity_count = len(analyzed_data.entities)
        rel_count = len(analyzed_data.relationships)

        _add_step(
            state,
            step="REQUIREMENT_ANALYSIS",
            agent="Requirement Analyzer Agent",
            status="COMPLETED",
            summary=f"Extracted {entity_count} entities and {rel_count} relationships from requirements.",
            details={"entity_count": entity_count, "relationship_count": rel_count},
        )
    except Exception as e:
        logger.exception("Requirement Analyzer Agent failed")
        state["status"] = "FAILED"
        state["error_message"] = f"Requirement Analyzer Agent error: {str(e)}"
        _add_step(
            state,
            step="REQUIREMENT_ANALYSIS",
            agent="Requirement Analyzer Agent",
            status="FAILED",
            summary=f"Analysis failed: {str(e)}",
        )
    return state


# ── Agent 2: Schema Designer Agent ────────────────────────────────────────────

def schema_designer_node(state: AgentState) -> AgentState:
    """Normalizes schema (1NF-3NF), resolves relationships, handles junction tables, generates ER diagram."""
    state["current_step"] = "SCHEMA_DESIGN"
    try:
        req_data = state.get("analyzed_requirements")
        if not req_data:
            raise ValueError("Missing analyzed requirements for Schema Designer Agent")

        analyzed_obj = AnalyzedRequirement.model_validate(req_data)
        dialect = state.get("dialect", "postgresql").lower()

        schema_def: CompleteSchemaDefinition = _run_coroutine_sync(
            design_schema(analyzed_obj, dialect=dialect),
            _heuristic_schema_designer,
            analyzed_obj,
            dialect,
        )

        state["designed_schema"] = schema_def.model_dump()
        state["mermaid_er"] = schema_def.mermaid_er

        table_count = len(schema_def.tables)
        rel_count = len(schema_def.relationships)
        _add_step(
            state,
            step="SCHEMA_DESIGN",
            agent="Schema Designer Agent",
            status="COMPLETED",
            summary=f"Normalized schema into {table_count} relational tables with {rel_count} foreign key relationships and ER diagram.",
            details={"table_count": table_count, "relationship_count": rel_count},
        )
    except Exception as e:
        logger.exception("Schema Designer Agent failed")
        state["status"] = "FAILED"
        state["error_message"] = f"Schema Designer Agent error: {str(e)}"
        _add_step(
            state,
            step="SCHEMA_DESIGN",
            agent="Schema Designer Agent",
            status="FAILED",
            summary=f"Schema design failed: {str(e)}",
        )
    return state


# ── Agent 3: SQL Generator Agent ──────────────────────────────────────────────

def sql_generator_node(state: AgentState) -> AgentState:
    """Generates dialect-specific DDL (PostgreSQL / MySQL) with topological dependency sorting."""
    state["current_step"] = "SQL_GENERATION"
    try:
        schema_dict = state.get("designed_schema")
        if not schema_dict:
            raise ValueError("Missing designed schema for SQL Generator Agent")

        schema_obj = CompleteSchemaDefinition.model_validate(schema_dict)
        dialect = state.get("dialect", "postgresql").lower()

        ddl = SQLGeneratorAgent.generate(schema_obj, dialect=dialect)
        state["generated_sql"] = ddl

        _add_step(
            state,
            step="SQL_GENERATION",
            agent="SQL Generator Agent",
            status="COMPLETED",
            summary=f"Generated {len(ddl.splitlines())} lines of {dialect.upper()} DDL with primary/foreign keys and indexes.",
            details={"dialect": dialect, "sql_length": len(ddl)},
        )
    except Exception as e:
        logger.exception("SQL Generator Agent failed")
        state["status"] = "FAILED"
        state["error_message"] = f"SQL Generator Agent error: {str(e)}"
        _add_step(
            state,
            step="SQL_GENERATION",
            agent="SQL Generator Agent",
            status="FAILED",
            summary=f"SQL generation failed: {str(e)}",
        )
    return state


# ── Agent 4: Validation Agent ─────────────────────────────────────────────────

def validation_agent_node(state: AgentState) -> AgentState:
    """Validates generated SQL with SQLGlot AST parsing (syntax, types, PKs, FK targets)."""
    state["current_step"] = "VALIDATION"
    try:
        sql = state.get("generated_sql")
        dialect = state.get("dialect", "postgresql").lower()
        if not sql:
            raise ValueError("No SQL found to validate")

        val_result = SQLValidationAgent.validate(sql, dialect=dialect)
        state["validation_result"] = val_result.model_dump()

        if val_result.is_valid:
            _add_step(
                state,
                step="VALIDATION",
                agent="SQL Validation Agent",
                status="COMPLETED",
                summary=f"SQL AST validation passed for {dialect.upper()} (Dialect: {val_result.dialect}).",
                details=val_result.model_dump(),
            )
        else:
            state["validation_retries"] = state.get("validation_retries", 0) + 1
            error_msgs = [e.message for e in val_result.errors]
            _add_step(
                state,
                step="VALIDATION",
                agent="SQL Validation Agent",
                status="WARNING" if state["validation_retries"] < 2 else "FAILED",
                summary=f"Validation detected issues: {', '.join(error_msgs)}",
                details=val_result.model_dump(),
            )
    except Exception as e:
        logger.exception("Validation Agent failed")
        state["status"] = "FAILED"
        state["error_message"] = f"Validation Agent error: {str(e)}"
        _add_step(
            state,
            step="VALIDATION",
            agent="SQL Validation Agent",
            status="FAILED",
            summary=f"Validation failed: {str(e)}",
        )
    return state


# ── Agent 5: Review & Risk Assessment Agent ───────────────────────────────────

def review_agent_node(state: AgentState) -> AgentState:
    """Reviews schema architecture, evaluates safety risks, and detects potential data loss."""
    state["current_step"] = "REVIEW_AND_RISK"
    try:
        schema_dict = state.get("designed_schema")
        if not schema_dict:
            raise ValueError("No designed schema to review")

        proposed_schema = CompleteSchemaDefinition.model_validate(schema_dict)
        dialect = state.get("dialect", "postgresql").lower()

        baseline_dict = _normalize_schema_dict(state.get("baseline_schema"))
        baseline_schema = CompleteSchemaDefinition.model_validate(baseline_dict) if baseline_dict else None

        # Run comparison engine
        diff_report: SchemaDiffReport = SchemaComparisonEngine.compare(
            existing_schema=baseline_schema,
            proposed_schema=proposed_schema,
            dialect=dialect,
        )
        state["diff_report"] = diff_report.model_dump()
        state["risk_level"] = diff_report.risk_level

        # Compute architecture metrics
        table_count = len(proposed_schema.tables)
        total_cols = sum(len(t.columns) for t in proposed_schema.tables)
        total_pks = sum(1 for t in proposed_schema.tables if any(c.primary_key for c in t.columns))
        total_fks = sum(1 for t in proposed_schema.tables for c in t.columns if c.foreign_key)

        architecture_rating = "OPTIMAL" if total_pks == table_count else "NEEDS_IMPROVEMENT"
        review_findings = [
            f"Verified {table_count} tables and {total_cols} columns.",
            f"All {total_pks}/{table_count} tables have primary keys configured.",
            f"Identified {total_fks} foreign key relational pointers.",
        ]

        destructive_diffs = [d for d in diff_report.differences if d.is_destructive]
        if destructive_diffs:
            review_findings.append(f"CRITICAL: {len(destructive_diffs)} destructive schema changes detected!")
        elif diff_report.data_loss_warnings:
            review_findings.append(f"WARNING: Potential data loss warnings: {'; '.join(diff_report.data_loss_warnings)}")
        else:
            review_findings.append("Schema evolution is classified as non-destructive and backward compatible.")

        review_report = {
            "architecture_rating": architecture_rating,
            "risk_level": diff_report.risk_level,
            "destructive_changes_count": len(destructive_diffs),
            "data_loss_warnings": diff_report.data_loss_warnings,
            "review_findings": review_findings,
            "tables_added": diff_report.tables_added,
            "tables_dropped": diff_report.tables_dropped,
            "columns_added": diff_report.columns_added,
            "columns_dropped": diff_report.columns_dropped,
            "columns_modified": diff_report.columns_modified,
        }
        state["review_report"] = review_report

        _add_step(
            state,
            step="REVIEW_AND_RISK",
            agent="Review & Risk Sentinel Agent",
            status="COMPLETED",
            summary=f"Risk assessment: {diff_report.risk_level}. Architecture rating: {architecture_rating}.",
            details=review_report,
        )
    except Exception as e:
        logger.exception("Review Agent failed")
        state["status"] = "FAILED"
        state["error_message"] = f"Review Agent error: {str(e)}"
        _add_step(
            state,
            step="REVIEW_AND_RISK",
            agent="Review & Risk Sentinel Agent",
            status="FAILED",
            summary=f"Review failed: {str(e)}",
        )
    return state


# ── Agent 6: Migration Agent ──────────────────────────────────────────────────

def migration_agent_node(state: AgentState) -> AgentState:
    """Generates forward DDL and reversible rollback scripts."""
    state["current_step"] = "MIGRATION_GENERATION"
    try:
        schema_dict = state.get("designed_schema")
        diff_dict = state.get("diff_report")
        dialect = state.get("dialect", "postgresql").lower()

        if not schema_dict or not diff_dict:
            raise ValueError("Missing schema or diff report for Migration Agent")

        proposed_schema = CompleteSchemaDefinition.model_validate(schema_dict)
        diff_report = SchemaDiffReport.model_validate(diff_dict)

        baseline_dict = _normalize_schema_dict(state.get("baseline_schema"))
        baseline_schema = CompleteSchemaDefinition.model_validate(baseline_dict) if baseline_dict else None

        migration_sql, rollback_sql = MigrationGeneratorAgent.generate(
            diff=diff_report,
            existing_schema=baseline_schema,
            proposed_schema=proposed_schema,
            dialect=dialect,
        )

        state["migration_sql"] = migration_sql
        state["rollback_sql"] = rollback_sql

        _add_step(
            state,
            step="MIGRATION_GENERATION",
            agent="Migration Generator Agent",
            status="COMPLETED",
            summary=f"Generated forward migration and reversible rollback scripts for {dialect.upper()}.",
            details={"migration_sql_length": len(migration_sql), "rollback_sql_length": len(rollback_sql)},
        )
    except Exception as e:
        logger.exception("Migration Agent failed")
        state["status"] = "FAILED"
        state["error_message"] = f"Migration Agent error: {str(e)}"
        _add_step(
            state,
            step="MIGRATION_GENERATION",
            agent="Migration Generator Agent",
            status="FAILED",
            summary=f"Migration generation failed: {str(e)}",
        )
    return state


# ── Agent 7: Human-in-the-Loop Approval Gate ──────────────────────────────────

def human_approval_gate_node(state: AgentState) -> AgentState:
    """
    Enforces human approval boundary before any database migration.
    Pauses execution in AWAITING_HUMAN_APPROVAL until authorized by user.
    """
    state["current_step"] = "HUMAN_APPROVAL_GATE"

    # If resumed with approval outcome
    if state.get("is_approved") is True:
        state["status"] = "COMPLETED"
        _add_step(
            state,
            step="HUMAN_APPROVAL_GATE",
            agent="Human Approval Sentinel",
            status="COMPLETED",
            summary=f"Approved by {state.get('approved_by', 'User')}. Migration authorized.",
            details={"notes": state.get("approval_notes")},
        )
        return state
    elif state.get("is_approved") is False:
        state["status"] = "REJECTED"
        _add_step(
            state,
            step="HUMAN_APPROVAL_GATE",
            agent="Human Approval Sentinel",
            status="REJECTED",
            summary=f"Migration rejected by {state.get('approved_by', 'User')}. Reason: {state.get('approval_notes', 'No notes provided')}",
            details={"notes": state.get("approval_notes")},
        )
        return state

    # Check auto-apply condition if risk is SAFE and user requested auto_apply_if_safe
    is_safe = state.get("risk_level") == "SAFE"
    destructive = [d for d in (state.get("diff_report") or {}).get("differences", []) if d.get("is_destructive")]
    if state.get("auto_apply_if_safe") and is_safe and not destructive:
        state["status"] = "COMPLETED"
        state["human_approval_required"] = False
        state["is_approved"] = True
        state["approved_by"] = "Autonomous Policy (Auto-Apply SAFE)"
        _add_step(
            state,
            step="HUMAN_APPROVAL_GATE",
            agent="Autonomous Policy Sentinel",
            status="COMPLETED",
            summary="Autonomous clearance: 100% SAFE with zero destructive operations.",
        )
        return state

    # Standard Human-in-the-Loop stop
    state["status"] = "AWAITING_HUMAN_APPROVAL"
    state["human_approval_required"] = True
    _add_step(
        state,
        step="HUMAN_APPROVAL_GATE",
        agent="Human-in-the-Loop Sentinel",
        status="AWAITING_HUMAN_APPROVAL",
        summary=f"Execution paused safely. Risk Level: {state.get('risk_level', 'SAFE')}. Waiting for human approval before execution.",
        details={"risk_level": state.get("risk_level")},
    )
    return state


# ── Conditional Routing Functions ─────────────────────────────────────────────

def route_after_validation(state: AgentState) -> str:
    """Routes back to schema designer if validation failed and retries remain, else proceeds to review."""
    if state.get("status") == "FAILED":
        return END

    val_res = state.get("validation_result") or {}
    is_valid = val_res.get("is_valid", False)
    retries = state.get("validation_retries", 0)

    if not is_valid and retries < 2:
        return "schema_designer_agent"
    return "review_agent"


def route_after_review(state: AgentState) -> str:
    if state.get("status") == "FAILED":
        return END
    return "migration_agent"


def route_after_migration(state: AgentState) -> str:
    if state.get("status") == "FAILED":
        return END
    return "human_approval_gate"


# ── LangGraph Graph Builder ───────────────────────────────────────────────────

def build_agent_workflow_graph():
    """Builds the compiled LangGraph StateGraph representing the multi-agent workflow."""
    workflow = StateGraph(AgentState)

    # Add Nodes
    workflow.add_node("requirement_analyzer_agent", requirement_analyzer_node)
    workflow.add_node("schema_designer_agent", schema_designer_node)
    workflow.add_node("sql_generator_agent", sql_generator_node)
    workflow.add_node("validation_agent", validation_agent_node)
    workflow.add_node("review_agent", review_agent_node)
    workflow.add_node("migration_agent", migration_agent_node)
    workflow.add_node("human_approval_gate", human_approval_gate_node)

    # Set Entry Point
    workflow.set_entry_point("requirement_analyzer_agent")

    # Connect Edges
    workflow.add_edge("requirement_analyzer_agent", "schema_designer_agent")
    workflow.add_edge("schema_designer_agent", "sql_generator_agent")
    workflow.add_edge("sql_generator_agent", "validation_agent")

    # Conditional Routing from Validation Agent
    workflow.add_conditional_edges(
        "validation_agent",
        route_after_validation,
        {
            "schema_designer_agent": "schema_designer_agent",
            "review_agent": "review_agent",
            END: END,
        },
    )

    # Conditional Routing from Review Agent
    workflow.add_conditional_edges(
        "review_agent",
        route_after_review,
        {
            "migration_agent": "migration_agent",
            END: END,
        },
    )

    # Connect to Human Approval Gate
    workflow.add_conditional_edges(
        "migration_agent",
        route_after_migration,
        {
            "human_approval_gate": "human_approval_gate",
            END: END,
        },
    )

    workflow.add_edge("human_approval_gate", END)

    return workflow.compile()


# Compiled Singleton Application
agent_workflow_app = build_agent_workflow_graph()
