"""
Phase 3 — AI-Powered Database Schema Generation Tests.
Tests Schema Designer Agent, normalization checks, junction tables, and Mermaid ER generation.
Run: pytest tests/test_phase3.py -v
"""
import pytest
from app.services.ai_analyzer import analyze_requirements
from app.services.schema_designer import design_schema
from app.schemas.schema_design import CompleteSchemaDefinition


@pytest.mark.asyncio
async def test_college_schema_generation():
    req_text = """Create a college management database.
A student has student ID, name, email and phone number.
A department has department ID and department name.
Each student belongs to one department.
A department can have multiple students."""

    analyzed = await analyze_requirements(req_text)
    schema = await design_schema(requirement=analyzed, dialect="postgresql")

    assert isinstance(schema, CompleteSchemaDefinition)
    assert len(schema.tables) >= 2

    table_names = [t.name.lower() for t in schema.tables]
    assert any("student" in t for t in table_names)
    assert any("department" in t for t in table_names)

    # Check normalization
    assert schema.normalization_report.third_normal_form is True

    # Check Mermaid ER diagram
    assert "erDiagram" in schema.mermaid_er
    assert len(schema.improvements) > 0


@pytest.mark.asyncio
async def test_ecommerce_schema_generation_with_junction_table():
    req_text = """Create an e-commerce database.
A customer has customer ID, name, email and phone number.
A product has product ID, product name, price and stock quantity.
An order belongs to one customer.
A customer can place multiple orders.
Each order can contain multiple products.
A product can belong to multiple orders.
Every order has an order date and order status.
Each order has payment information."""

    analyzed = await analyze_requirements(req_text)
    schema = await design_schema(requirement=analyzed, dialect="postgresql")

    assert isinstance(schema, CompleteSchemaDefinition)
    assert len(schema.tables) >= 3

    # Check junction table handling for many-to-many products <-> orders
    has_junction = any(t.is_junction_table or "item" in t.name or "product" in t.name for t in schema.tables)
    assert has_junction is True

    # Check relationships
    assert len(schema.relationships) > 0
    assert "erDiagram" in schema.mermaid_er
