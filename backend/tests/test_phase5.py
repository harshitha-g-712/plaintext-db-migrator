"""
Phase 5 — Database Migration & Schema Version Control Tests.
Tests Schema Diff Engine, Risk Assessment, Migration Generator, and Rollback Scripting.
Run: pytest tests/test_phase5.py -v
"""
import pytest
from app.services.ai_analyzer import analyze_requirements
from app.services.schema_designer import design_schema
from app.services.migration_engine import SchemaComparisonEngine, MigrationGeneratorAgent
from app.schemas.schema_design import TableDesign, ColumnDesign, CompleteSchemaDefinition


@pytest.mark.asyncio
async def test_ecommerce_schema_evolution():
    """
    Tests sample schema evolution from prompt section 6:
    Base: Customer and Order
    Evolution: Add delivery_address to Customers, add delivery_status to Orders.
    """
    base_text = """Create an e-commerce database.
A customer has customer ID, name, email and phone number.
A product has product ID, product name, price and stock quantity.
An order belongs to one customer.
A customer can place multiple orders."""

    analyzed_base = await analyze_requirements(base_text)
    base_schema = await design_schema(requirement=analyzed_base, dialect="postgresql")

    # Clone base schema and apply evolution
    evolved_tables = []
    for t in base_schema.tables:
        t_copy = t.model_copy(deep=True)
        if "customer" in t.name.lower():
            t_copy.columns.append(
                ColumnDesign(name="delivery_address", data_type="VARCHAR(255)", nullable=True)
            )
        elif "order" in t.name.lower() and not t.is_junction_table:
            t_copy.columns.append(
                ColumnDesign(name="delivery_status", data_type="VARCHAR(50)", nullable=True, default="'PENDING'")
            )
        evolved_tables.append(t_copy)

    evolved_schema = CompleteSchemaDefinition(
        schema_name="EvolvedEcommerceSchema",
        tables=evolved_tables,
        relationships=base_schema.relationships,
        mermaid_er="",
    )

    # 1. Compare schemas
    diff_report = SchemaComparisonEngine.compare(
        existing_schema=base_schema,
        proposed_schema=evolved_schema,
        dialect="postgresql",
    )

    assert diff_report.has_changes is True
    assert diff_report.risk_level in ("SAFE", "LOW")
    assert any("delivery_address" in c for c in diff_report.columns_added)
    assert any("delivery_status" in c for c in diff_report.columns_added)

    # 2. Generate migration and rollback scripts
    mig_sql, roll_sql = MigrationGeneratorAgent.generate(
        diff=diff_report,
        existing_schema=base_schema,
        proposed_schema=evolved_schema,
        dialect="postgresql",
    )

    assert "ALTER TABLE" in mig_sql
    assert "delivery_address" in mig_sql
    assert "delivery_status" in mig_sql

    # Rollback must drop the added columns
    assert "DROP COLUMN" in roll_sql
    assert "delivery_address" in roll_sql
    assert "delivery_status" in roll_sql


def test_destructive_migration_risk_assessment():
    """
    Tests that dropping a table or column flags DESTRUCTIVE risk and emits data loss warnings.
    """
    existing_schema = CompleteSchemaDefinition(
        schema_name="OldSystem",
        tables=[
            TableDesign(
                name="users",
                columns=[
                    ColumnDesign(name="id", data_type="INTEGER", primary_key=True),
                    ColumnDesign(name="email", data_type="VARCHAR(255)"),
                    ColumnDesign(name="legacy_token", data_type="VARCHAR(255)"),
                ],
                primary_key=["id"],
            ),
            TableDesign(
                name="deprecated_audit_logs",
                columns=[ColumnDesign(name="id", data_type="INTEGER", primary_key=True)],
                primary_key=["id"],
            ),
        ],
        relationships=[],
        mermaid_er="",
    )

    # Proposed schema removes deprecated_audit_logs and drops legacy_token
    proposed_schema = CompleteSchemaDefinition(
        schema_name="NewSystem",
        tables=[
            TableDesign(
                name="users",
                columns=[
                    ColumnDesign(name="id", data_type="INTEGER", primary_key=True),
                    ColumnDesign(name="email", data_type="VARCHAR(255)"),
                ],
                primary_key=["id"],
            )
        ],
        relationships=[],
        mermaid_er="",
    )

    diff_report = SchemaComparisonEngine.compare(
        existing_schema=existing_schema,
        proposed_schema=proposed_schema,
        dialect="postgresql",
    )

    assert diff_report.risk_level == "DESTRUCTIVE"
    assert len(diff_report.data_loss_warnings) >= 2
    assert "deprecated_audit_logs" in diff_report.tables_dropped
    assert any("legacy_token" in c for c in diff_report.columns_dropped)

    mig_sql, roll_sql = MigrationGeneratorAgent.generate(
        diff=diff_report,
        existing_schema=existing_schema,
        proposed_schema=proposed_schema,
        dialect="postgresql",
    )

    assert "DROP TABLE" in mig_sql
    assert "DROP COLUMN" in mig_sql
    assert "CREATE TABLE" in roll_sql  # Rollback recreates table
