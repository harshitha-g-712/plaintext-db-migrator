"""
Phase 2 — Requirement Analyzer Unit & Service Tests.
Run: pytest tests/test_phase2.py -v
"""
import pytest
from app.services.ai_analyzer import analyze_requirements
from app.schemas.requirement import AnalyzedRequirement


@pytest.mark.asyncio
async def test_college_management_requirement_analysis():
    text = """Create a college management database.
A student has student ID, name, email and phone number.
A department has department ID and department name.
Each student belongs to one department.
A department can have multiple students."""

    result = await analyze_requirements(text)
    assert isinstance(result, AnalyzedRequirement)

    entity_names = [e.name.lower() for e in result.entities]
    assert "student" in entity_names
    assert "department" in entity_names

    student_entity = next(e for e in result.entities if e.name.lower() == "student")
    student_attrs = [a.name.lower() for a in student_entity.attributes]
    assert "student_id" in student_attrs
    assert "name" in student_attrs
    assert "email" in student_attrs
    assert "phone_number" in student_attrs

    # Check relationships
    assert len(result.relationships) > 0
    rel = result.relationships[0]
    assert rel.relationship_type in ("ONE_TO_MANY", "MANY_TO_ONE")


@pytest.mark.asyncio
async def test_ecommerce_requirement_analysis():
    text = """Create an e-commerce database.
A customer has customer ID, name, email and phone number.
A product has product ID, product name, price and stock quantity.
An order belongs to one customer.
A customer can place multiple orders.
Each order can contain multiple products.
A product can belong to multiple orders.
Every order has an order date and order status.
Each order has payment information."""

    result = await analyze_requirements(text)
    assert isinstance(result, AnalyzedRequirement)

    entity_names = [e.name.lower() for e in result.entities]
    assert "customer" in entity_names
    assert "product" in entity_names
    assert "order" in entity_names
