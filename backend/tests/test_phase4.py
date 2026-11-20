"""
Phase 4 — SQL Generation & Schema Validation Unit Tests using SQLGlot.
Tests SQL Generator Agent (PostgreSQL, MySQL) and SQL Validation Agent.
Run: pytest tests/test_phase4.py -v
"""
import pytest
from app.services.ai_analyzer import analyze_requirements
from app.services.schema_designer import design_schema
from app.services.sql_agent import SQLGeneratorAgent, SQLValidationAgent


@pytest.mark.asyncio
async def test_postgresql_sql_generation_and_validation():
    req_text = """Create a college management database.
A student has student ID, name, email and phone number.
A department has department ID and department name.
Each student belongs to one department.
A department can have multiple students."""

    analyzed = await analyze_requirements(req_text)
    schema = await design_schema(requirement=analyzed, dialect="postgresql")

    sql_output = SQLGeneratorAgent.generate(
        schema_def=schema,
        dialect="postgresql",
        include_database_creation=True,
        include_indexes=True,
    )

    assert "CREATE TABLE" in sql_output
    assert "PRIMARY KEY" in sql_output

    # Validate with SQLGlot
    val_res = SQLValidationAgent.validate(sql_output, dialect="postgresql")
    assert val_res.syntax_valid is True
    assert val_res.is_valid is True
    assert len(val_res.errors) == 0
    assert len(val_res.tables_validated) >= 2


@pytest.mark.asyncio
async def test_mysql_sql_generation_and_validation():
    req_text = """Create an e-commerce database.
A customer has customer ID, name, email and phone number.
A product has product ID, product name, price and stock quantity.
An order belongs to one customer.
A customer can place multiple orders."""

    analyzed = await analyze_requirements(req_text)
    schema = await design_schema(requirement=analyzed, dialect="mysql")

    sql_output = SQLGeneratorAgent.generate(
        schema_def=schema,
        dialect="mysql",
        include_database_creation=True,
        include_indexes=True,
    )

    assert "CREATE TABLE" in sql_output
    assert "`" in sql_output  # MySQL backtick quoting

    # Validate with SQLGlot
    val_res = SQLValidationAgent.validate(sql_output, dialect="mysql")
    assert val_res.syntax_valid is True
    assert val_res.is_valid is True
    assert len(val_res.errors) == 0


def test_sql_validation_detects_invalid_sql():
    # 1. Syntax Error
    broken_sql = "CREATE TABLE broken (id INT PRIMARY KEY, name VARCHAR(255) NOT NULL"  # Missing closing parenthesis
    val1 = SQLValidationAgent.validate(broken_sql, dialect="postgresql")
    assert val1.is_valid is False
    assert val1.syntax_valid is False
    assert len(val1.errors) > 0

    # 2. Duplicate column detection
    duplicate_col_sql = """
    CREATE TABLE users (
        id INT PRIMARY KEY,
        email VARCHAR(255),
        email VARCHAR(255)
    );
    """
    val2 = SQLValidationAgent.validate(duplicate_col_sql, dialect="postgresql")
    assert any(e.rule == "DUPLICATE_COLUMN" for e in val2.errors)

    # 3. Invalid foreign key reference
    invalid_fk_sql = """
    CREATE TABLE orders (
        order_id INT PRIMARY KEY,
        customer_id INT,
        CONSTRAINT fk_cust FOREIGN KEY (customer_id) REFERENCES non_existent_table(id)
    );
    """
    val3 = SQLValidationAgent.validate(invalid_fk_sql, dialect="postgresql")
    assert any(e.rule == "INVALID_FOREIGN_KEY_TABLE" for e in val3.errors)
