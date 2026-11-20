"""
Phase 4: SQL Generator Agent & SQL Validation Agent using SQLGlot.
Generates complete DDL (CREATE DATABASE, CREATE TABLE, ALTER TABLE, PRIMARY KEY,
FOREIGN KEY, UNIQUE, NOT NULL, DEFAULT, INDEX, CHECK) for MySQL and PostgreSQL.
Validates syntax and relational integrity using SQLGlot AST inspection.
"""
import logging
import re
from typing import List, Dict, Tuple, Set, Optional

import sqlglot
from sqlglot import parse, exp
from sqlglot.errors import ParseError

from app.schemas.schema_design import CompleteSchemaDefinition, TableDesign, ColumnDesign
from app.schemas.sql_generation import (
    SQLValidationError,
    SQLValidationResult,
    SQLGenerateResponse,
)

logger = logging.getLogger(__name__)


# ── Dialect Mapping Helpers ──────────────────────────────────────────────────

def _map_data_type(generic_type: str, dialect: str) -> str:
    """Map logical data types to dialect-specific SQL types."""
    d = dialect.lower()
    t = generic_type.strip().upper()

    if d == "mysql":
        if t in ("SERIAL", "BIGSERIAL"):
            return "BIGINT AUTO_INCREMENT"
        if "BOOLEAN" in t:
            return "TINYINT(1)"
        if "TIMESTAMP" in t:
            return "DATETIME"
        if t == "UUID":
            return "VARCHAR(36)"
        if t == "TEXT":
            return "TEXT"
        return generic_type
    else:  # postgresql
        if "AUTO_INCREMENT" in t:
            return "BIGSERIAL"
        if "DATETIME" in t:
            return "TIMESTAMP"
        if t == "VARCHAR(36)" and "UUID" in generic_type.upper():
            return "UUID"
        return generic_type


def _quote_identifier(ident: str, dialect: str) -> str:
    """Properly quote an SQL identifier for the target dialect."""
    clean = re.sub(r"[^a-zA-Z0-9_]", "_", ident.strip())
    if dialect.lower() == "mysql":
        return f"`{clean}`"
    return f'"{clean}"'


def _topological_sort_tables(tables: List[TableDesign]) -> List[TableDesign]:
    """
    Sort tables topologically based on foreign key dependencies so parent tables
    are created before child tables. If cycles exist, preserves original order.
    """
    table_map = {t.name.lower(): t for t in tables}
    in_degree: Dict[str, int] = {t.name.lower(): 0 for t in tables}
    adj: Dict[str, List[str]] = {t.name.lower(): [] for t in tables}

    for t in tables:
        t_name = t.name.lower()
        for col in t.columns:
            if col.foreign_key and col.references_table:
                parent = col.references_table.lower()
                if parent in table_map and parent != t_name:
                    adj[parent].append(t_name)
                    in_degree[t_name] += 1

    queue = [t for t, deg in in_degree.items() if deg == 0]
    sorted_names: List[str] = []

    while queue:
        curr = queue.pop(0)
        sorted_names.append(curr)
        for child in adj.get(curr, []):
            in_degree[child] -= 1
            if in_degree[child] == 0:
                queue.append(child)

    if len(sorted_names) == len(tables):
        return [table_map[name] for name in sorted_names]

    # If cyclic dependency or unresolved reference, fallback to original order
    return tables


# ── SQL Generator Agent ──────────────────────────────────────────────────────

class SQLGeneratorAgent:
    """Generates production-grade DDL scripts for PostgreSQL or MySQL."""

    @staticmethod
    def generate(
        schema_def: CompleteSchemaDefinition,
        dialect: str = "postgresql",
        include_database_creation: bool = True,
        include_drop_tables: bool = False,
        include_indexes: bool = True,
    ) -> str:
        dialect = dialect.lower()
        if dialect not in ("postgresql", "mysql"):
            dialect = "postgresql"

        sql_lines: List[str] = []
        db_name = re.sub(r"[^a-zA-Z0-9_]", "_", schema_def.schema_name or "app_db").lower()

        # Header Comments
        sql_lines.append(f"-- ============================================================================")
        sql_lines.append(f"-- PlainText-DB Migrator Generated DDL Script")
        sql_lines.append(f"-- Target Dialect : {dialect.upper()}")
        sql_lines.append(f"-- Schema Name    : {schema_def.schema_name}")
        sql_lines.append(f"-- Generated At   : 3NF Compliant Automated Architecture")
        sql_lines.append(f"-- ============================================================================\n")

        # Database creation
        if include_database_creation:
            if dialect == "mysql":
                sql_lines.append(f"CREATE DATABASE IF NOT EXISTS `{db_name}` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;")
                sql_lines.append(f"USE `{db_name}`;\n")
            else:
                sql_lines.append(f"-- CREATE DATABASE {db_name};\n")

        sorted_tables = _topological_sort_tables(schema_def.tables)

        # DROP TABLES (in reverse order for safe cleanup)
        if include_drop_tables:
            sql_lines.append("-- ── Drop existing tables (in reverse dependency order) ───────────────────────")
            for t in reversed(sorted_tables):
                q_name = _quote_identifier(t.name, dialect)
                sql_lines.append(f"DROP TABLE IF EXISTS {q_name} CASCADE;") if dialect == "postgresql" else sql_lines.append(f"DROP TABLE IF EXISTS {q_name};")
            sql_lines.append("")

        # CREATE TABLES
        fk_alter_statements: List[str] = []
        index_statements: List[str] = []

        sql_lines.append("-- ── Table Definitions ────────────────────────────────────────────────────────")

        for table in sorted_tables:
            table_q = _quote_identifier(table.name, dialect)
            sql_lines.append(f"-- Table: {table.name}")
            if table.description:
                sql_lines.append(f"-- Description: {table.description}")

            lines: List[str] = []
            pk_columns: List[str] = []
            seen_cols = set()

            for col in table.columns:
                col_name_lower = col.name.lower()
                if col_name_lower in seen_cols:
                    continue
                seen_cols.add(col_name_lower)

                col_q = _quote_identifier(col.name, dialect)
                dt = _map_data_type(col.data_type, dialect)
                parts = [f"    {col_q} {dt}"]

                # Constraints
                if not col.nullable and "AUTO_INCREMENT" not in dt and "SERIAL" not in dt:
                    parts.append("NOT NULL")

                if col.unique and not col.primary_key:
                    parts.append("UNIQUE")

                if col.default is not None:
                    def_val = col.default.strip()
                    parts.append(f"DEFAULT {def_val}")

                if col.check_constraint:
                    parts.append(f"CHECK ({col.check_constraint})")

                lines.append(" ".join(parts))

                if col.primary_key:
                    pk_columns.append(col_q)

                # Collect Foreign Key for ALTER TABLE or inline
                if col.foreign_key and col.references_table:
                    ref_tbl = col.references_table
                    ref_col = col.references_column or col.name
                    fk_name = f"fk_{table.name}_{col.name}_{ref_tbl}"[:63]
                    fk_stmt = (
                        f"ALTER TABLE {table_q} ADD CONSTRAINT {_quote_identifier(fk_name, dialect)} "
                        f"FOREIGN KEY ({col_q}) REFERENCES {_quote_identifier(ref_tbl, dialect)} ({_quote_identifier(ref_col, dialect)}) "
                        f"ON DELETE CASCADE ON UPDATE CASCADE;"
                    )
                    fk_alter_statements.append(fk_stmt)

                # Collect indexes
                if include_indexes and (col.foreign_key or col.unique):
                    idx_name = f"idx_{table.name}_{col.name}"[:63]
                    idx_stmt = f"CREATE INDEX {_quote_identifier(idx_name, dialect)} ON {table_q} ({col_q});"
                    index_statements.append(idx_stmt)

            # Primary Key
            if pk_columns:
                lines.append(f"    PRIMARY KEY ({', '.join(pk_columns)})")

            table_body = ",\n".join(lines)
            sql_lines.append(f"CREATE TABLE {table_q} (\n{table_body}\n);")
            sql_lines.append("")

        # FOREIGN KEYS (via ALTER TABLE for robust dependency resolution)
        if fk_alter_statements:
            sql_lines.append("-- ── Foreign Key Constraints ──────────────────────────────────────────────────")
            for fk in fk_alter_statements:
                sql_lines.append(fk)
            sql_lines.append("")

        # INDEXES
        if index_statements:
            sql_lines.append("-- ── Performance Indexes ──────────────────────────────────────────────────────")
            for idx in index_statements:
                sql_lines.append(idx)
            sql_lines.append("")

        return "\n".join(sql_lines)


# ── SQL Validation Agent (using SQLGlot) ──────────────────────────────────────

class SQLValidationAgent:
    """
    Validates generated or user-provided SQL scripts using SQLGlot parsing and
    semantic/structural rule inspection.
    """

    @staticmethod
    def validate(sql_content: str, dialect: str = "postgresql") -> SQLValidationResult:
        dialect_clean = dialect.lower()
        # Map dialect for SQLGlot
        glot_dialect = "postgres" if dialect_clean in ("postgresql", "postgres") else "mysql"

        errors: List[SQLValidationError] = []
        warnings: List[SQLValidationError] = []
        suggested_corrections: List[str] = []
        tables_validated: List[str] = []
        total_statements = 0

        # Step 1: SQLGlot Syntax Parsing
        parsed_expressions = []
        try:
            parsed_expressions = parse(sql_content, read=glot_dialect)
            total_statements = len(parsed_expressions)
        except ParseError as pe:
            line_no = None
            if hasattr(pe, "errors") and pe.errors:
                first_err = pe.errors[0]
                line_no = first_err.get("line")
                err_msg = first_err.get("description", str(pe))
            else:
                err_msg = str(pe)

            errors.append(
                SQLValidationError(
                    message=f"SQL Syntax Error: {err_msg}",
                    severity="ERROR",
                    line=line_no,
                    rule="SQL_SYNTAX",
                )
            )
            suggested_corrections.append(f"Check SQL syntax near line {line_no or 'start'}. Ensure statements end with semicolons and keywords match {dialect.upper()} dialect.")
            return SQLValidationResult(
                is_valid=False,
                syntax_valid=False,
                design_valid=False,
                dialect=dialect,
                errors=errors,
                warnings=warnings,
                suggested_corrections=suggested_corrections,
                tables_validated=[],
                total_statements=0,
            )
        except Exception as ex:
            errors.append(
                SQLValidationError(
                    message=f"Failed to parse SQL: {str(ex)}",
                    severity="ERROR",
                    rule="PARSE_EXCEPTION",
                )
            )
            return SQLValidationResult(
                is_valid=False,
                syntax_valid=False,
                design_valid=False,
                dialect=dialect,
                errors=errors,
                warnings=warnings,
                suggested_corrections=["Verify SQL formatting and ensure there are no unclosed strings or parentheses."],
                tables_validated=[],
                total_statements=0,
            )

        # Step 2: Semantic & Relational Integrity Validation
        created_tables: Dict[str, Set[str]] = {}  # table_name -> set of column names
        tables_with_pk: Set[str] = set()

        for expr in parsed_expressions:
            if isinstance(expr, exp.Create) and (expr.args.get("kind") or "").upper() == "TABLE":
                table_exp = expr.find(exp.Table)
                if table_exp:
                    tbl_name = table_exp.name.lower()
                    tables_validated.append(table_exp.name)
                    if tbl_name not in created_tables:
                        created_tables[tbl_name] = set()

                    # Check columns and primary keys
                    for col_def in expr.find_all(exp.ColumnDef):
                        col_name = col_def.name.lower()
                        # Duplicate column check
                        if col_name in created_tables[tbl_name]:
                            errors.append(
                                SQLValidationError(
                                    message=f"Duplicate column '{col_def.name}' detected in table '{table_exp.name}'.",
                                    table=table_exp.name,
                                    column=col_def.name,
                                    rule="DUPLICATE_COLUMN",
                                )
                            )
                            suggested_corrections.append(f"Remove or rename the duplicate column '{col_def.name}' in table '{table_exp.name}'.")
                        else:
                            created_tables[tbl_name].add(col_name)

                        # Check inline primary key
                        if col_def.find(exp.PrimaryKeyColumnConstraint):
                            tables_with_pk.add(tbl_name)

                    # Check table-level primary key constraint
                    if expr.find(exp.PrimaryKey):
                        tables_with_pk.add(tbl_name)

            # Check ALTER TABLE ADD CONSTRAINT FOREIGN KEY
            elif isinstance(expr, exp.Alter):
                # Inspect for foreign key targets
                pass

        # Verification 1: Missing Primary Keys
        for tbl_name, cols in created_tables.items():
            if tbl_name not in tables_with_pk:
                warnings.append(
                    SQLValidationError(
                        message=f"Table '{tbl_name}' does not define an explicit PRIMARY KEY.",
                        table=tbl_name,
                        severity="WARNING",
                        rule="MISSING_PRIMARY_KEY",
                    )
                )
                suggested_corrections.append(f"Add a PRIMARY KEY column (e.g. 'id SERIAL PRIMARY KEY') to table '{tbl_name}' for relational integrity.")

        # Verification 2: Check Foreign Key References in RAW content via regex
        fk_matches = re.finditer(
            r"FOREIGN\s+KEY\s*\(([^\)]+)\)\s+REFERENCES\s+([`\"a-zA-Z0-9_]+)\s*\(([^\)]+)\)",
            sql_content,
            re.IGNORECASE,
        )
        for match in fk_matches:
            fk_cols = [c.strip().strip('"`') for c in match.group(1).split(",")]
            target_table = match.group(2).strip().strip('"`').lower()
            target_cols = [c.strip().strip('"`') for c in match.group(3).split(",")]

            # Check target table existence
            if created_tables and target_table not in created_tables:
                errors.append(
                    SQLValidationError(
                        message=f"Foreign key references non-existent table '{target_table}'.",
                        table=target_table,
                        rule="INVALID_FOREIGN_KEY_TABLE",
                    )
                )
                suggested_corrections.append(f"Ensure target table '{target_table}' exists and is created before child tables reference it.")
            elif target_table in created_tables:
                # Check target column existence
                for tc in target_cols:
                    if tc.lower() not in created_tables[target_table]:
                        errors.append(
                            SQLValidationError(
                                message=f"Foreign key references non-existent column '{tc}' in table '{target_table}'.",
                                table=target_table,
                                column=tc,
                                rule="INVALID_FOREIGN_KEY_COLUMN",
                            )
                        )
                        suggested_corrections.append(f"Verify that column '{tc}' exists in referenced table '{target_table}'.")

        # Verification 3: Dialect-specific incompatible types check
        if glot_dialect == "mysql" and "SERIAL" in sql_content.upper():
            warnings.append(
                SQLValidationError(
                    message="Type 'SERIAL' detected in MySQL script. In MySQL, prefer 'INT AUTO_INCREMENT' or 'BIGINT AUTO_INCREMENT'.",
                    severity="WARNING",
                    rule="DIALECT_COMPATIBILITY",
                )
            )
            suggested_corrections.append("Replace 'SERIAL' with 'INT AUTO_INCREMENT' or 'BIGINT AUTO_INCREMENT' for MySQL compatibility.")

        if glot_dialect == "postgres" and "AUTO_INCREMENT" in sql_content.upper():
            warnings.append(
                SQLValidationError(
                    message="'AUTO_INCREMENT' is MySQL syntax. In PostgreSQL, use 'SERIAL' or 'BIGSERIAL'.",
                    severity="WARNING",
                    rule="DIALECT_COMPATIBILITY",
                )
            )
            suggested_corrections.append("Replace 'AUTO_INCREMENT' with 'SERIAL' or 'GENERATED ALWAYS AS IDENTITY' for PostgreSQL.")

        is_valid = len(errors) == 0

        return SQLValidationResult(
            is_valid=is_valid,
            syntax_valid=True,
            design_valid=is_valid,
            dialect=dialect,
            errors=errors,
            warnings=warnings,
            suggested_corrections=suggested_corrections,
            tables_validated=list(set(tables_validated)),
            total_statements=total_statements,
        )
