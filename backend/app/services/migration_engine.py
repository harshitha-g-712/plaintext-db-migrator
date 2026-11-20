"""
Phase 5: Database Migration & Schema Version Control Engine.
Provides schema diff comparison, data loss risk calculation, migration SQL generation,
rollback SQL generation, and live database introspection.
"""
import logging
import re
from typing import Optional, List, Dict, Tuple, Set, Any
from uuid import UUID

from sqlalchemy import create_engine, inspect

from app.schemas.schema_design import (
    CompleteSchemaDefinition,
    TableDesign,
    ColumnDesign,
    RelationshipDesign,
)
from app.schemas.migration import SchemaDiffItem, SchemaDiffReport
from app.services.sql_agent import SQLGeneratorAgent, _map_data_type, _quote_identifier

logger = logging.getLogger(__name__)


# ── Schema Comparison Engine ──────────────────────────────────────────────────

class SchemaComparisonEngine:
    """Detects differences between existing and proposed schemas and evaluates risk."""

    @staticmethod
    def compare(
        existing_schema: Optional[CompleteSchemaDefinition],
        proposed_schema: CompleteSchemaDefinition,
        dialect: str = "postgresql",
    ) -> SchemaDiffReport:
        differences: List[SchemaDiffItem] = []
        data_loss_warnings: List[str] = []
        tables_added: List[str] = []
        tables_dropped: List[str] = []
        columns_added: List[str] = []
        columns_dropped: List[str] = []
        columns_modified: List[str] = []

        is_destructive = False
        has_high_risk = False
        has_medium_risk = False

        # If starting fresh from an empty database
        if not existing_schema or not existing_schema.tables:
            for t in proposed_schema.tables:
                tables_added.append(t.name)
                differences.append(
                    SchemaDiffItem(
                        change_type="TABLE_ADDED",
                        table_name=t.name,
                        details=f"New table '{t.name}' will be created with {len(t.columns)} columns.",
                        is_destructive=False,
                    )
                )
            return SchemaDiffReport(
                has_changes=len(tables_added) > 0,
                risk_level="SAFE",
                data_loss_warnings=[],
                differences=differences,
                tables_added=tables_added,
                tables_dropped=[],
                columns_added=[],
                columns_dropped=[],
                columns_modified=[],
            )

        existing_table_map = {t.name.lower(): t for t in existing_schema.tables}
        proposed_table_map = {t.name.lower(): t for t in proposed_schema.tables}

        # 1. Check for New Tables
        for name, prop_t in proposed_table_map.items():
            if name not in existing_table_map:
                tables_added.append(prop_t.name)
                differences.append(
                    SchemaDiffItem(
                        change_type="TABLE_ADDED",
                        table_name=prop_t.name,
                        details=f"New table '{prop_t.name}' will be created.",
                        is_destructive=False,
                    )
                )

        # 2. Check for Dropped Tables (DESTRUCTIVE!)
        for name, exist_t in existing_table_map.items():
            if name not in proposed_table_map:
                tables_dropped.append(exist_t.name)
                is_destructive = True
                warning = f"DESTRUCTIVE ACTION: Table '{exist_t.name}' is removed in the proposed schema. ALL DATA IN THIS TABLE WILL BE PERMANENTLY DESTROYED upon migration."
                data_loss_warnings.append(warning)
                differences.append(
                    SchemaDiffItem(
                        change_type="TABLE_DROPPED",
                        table_name=exist_t.name,
                        details=f"Table '{exist_t.name}' will be dropped.",
                        is_destructive=True,
                    )
                )

        # 3. Check for Column Changes in Common Tables
        for name, prop_t in proposed_table_map.items():
            if name in existing_table_map:
                exist_t = existing_table_map[name]
                exist_col_map = {c.name.lower(): c for c in exist_t.columns}
                prop_col_map = {c.name.lower(): c for c in prop_t.columns}

                # Columns Added
                for c_name, p_col in prop_col_map.items():
                    if c_name not in exist_col_map:
                        columns_added.append(f"{prop_t.name}.{p_col.name}")
                        is_not_null_without_def = (not p_col.nullable) and (p_col.default is None) and (not p_col.primary_key)
                        if is_not_null_without_def:
                            has_medium_risk = True
                            data_loss_warnings.append(
                                f"Notice: Column '{p_col.name}' in table '{prop_t.name}' is NOT NULL without a default. Existing rows may cause migration failure unless a default or backfill is provided."
                            )

                        differences.append(
                            SchemaDiffItem(
                                change_type="COLUMN_ADDED",
                                table_name=prop_t.name,
                                column_name=p_col.name,
                                details=f"Add column '{p_col.name}' ({p_col.data_type}) to table '{prop_t.name}'.",
                                is_destructive=False,
                                new_value=p_col.data_type,
                            )
                        )

                # Columns Dropped (DESTRUCTIVE!)
                for c_name, e_col in exist_col_map.items():
                    if c_name not in prop_col_map:
                        columns_dropped.append(f"{exist_t.name}.{e_col.name}")
                        is_destructive = True
                        data_loss_warnings.append(
                            f"DESTRUCTIVE ACTION: Column '{e_col.name}' in table '{exist_t.name}' will be dropped. Column data will be permanently lost."
                        )
                        differences.append(
                            SchemaDiffItem(
                                change_type="COLUMN_DROPPED",
                                table_name=exist_t.name,
                                column_name=e_col.name,
                                details=f"Drop column '{e_col.name}' from table '{exist_t.name}'.",
                                is_destructive=True,
                                old_value=e_col.data_type,
                            )
                        )

                # Columns Modified (Type or Nullability changed)
                for c_name, p_col in prop_col_map.items():
                    if c_name in exist_col_map:
                        e_col = exist_col_map[c_name]
                        e_type_clean = re.sub(r"\s+", "", e_col.data_type.upper())
                        p_type_clean = re.sub(r"\s+", "", p_col.data_type.upper())

                        if e_type_clean != p_type_clean or e_col.nullable != p_col.nullable:
                            columns_modified.append(f"{prop_t.name}.{p_col.name}")
                            has_medium_risk = True
                            differences.append(
                                SchemaDiffItem(
                                    change_type="COLUMN_MODIFIED",
                                    table_name=prop_t.name,
                                    column_name=p_col.name,
                                    details=f"Modify column '{p_col.name}': type {e_col.data_type} -> {p_col.data_type}, nullable {e_col.nullable} -> {p_col.nullable}.",
                                    is_destructive=False,
                                    old_value=e_col.data_type,
                                    new_value=p_col.data_type,
                                )
                            )

        # Compute Risk Level
        has_changes = (
            len(tables_added) > 0
            or len(tables_dropped) > 0
            or len(columns_added) > 0
            or len(columns_dropped) > 0
            or len(columns_modified) > 0
        )

        if not has_changes:
            risk_level = "SAFE"
        elif is_destructive:
            risk_level = "DESTRUCTIVE"
        elif has_high_risk:
            risk_level = "HIGH"
        elif has_medium_risk:
            risk_level = "MEDIUM"
        else:
            risk_level = "LOW" if len(columns_added) > 0 else "SAFE"

        return SchemaDiffReport(
            has_changes=has_changes,
            risk_level=risk_level,
            data_loss_warnings=data_loss_warnings,
            differences=differences,
            tables_added=tables_added,
            tables_dropped=tables_dropped,
            columns_added=columns_added,
            columns_dropped=columns_dropped,
            columns_modified=columns_modified,
        )


# ── Migration Generator Agent ────────────────────────────────────────────────

class MigrationGeneratorAgent:
    """Generates forward migration scripts and reversible rollback scripts."""

    @staticmethod
    def generate(
        diff: SchemaDiffReport,
        existing_schema: Optional[CompleteSchemaDefinition],
        proposed_schema: CompleteSchemaDefinition,
        dialect: str = "postgresql",
    ) -> Tuple[str, str]:
        dialect = dialect.lower()
        mig_lines: List[str] = []
        roll_lines: List[str] = []

        # Forward Migration Header
        mig_lines.append("-- ============================================================================")
        mig_lines.append(f"-- PlainText-DB Migration Script (Target: {dialect.upper()})")
        mig_lines.append(f"-- Risk Level    : {diff.risk_level}")
        mig_lines.append(f"-- Changes       : {len(diff.differences)} detected difference(s)")
        if diff.data_loss_warnings:
            mig_lines.append("-- WARNINGS      :")
            for w in diff.data_loss_warnings:
                mig_lines.append(f"--   ⚠️  {w}")
        mig_lines.append("-- ============================================================================\n")

        # Rollback Script Header
        roll_lines.append("-- ============================================================================")
        roll_lines.append(f"-- PlainText-DB Rollback Script (Target: {dialect.upper()})")
        roll_lines.append(f"-- Reverts Migration Risk Level: {diff.risk_level}")
        roll_lines.append("-- NOTE: Dropped columns cannot be restored with previous data via rollback alone.")
        roll_lines.append("-- ============================================================================\n")

        if dialect == "postgresql":
            mig_lines.append("BEGIN;\n")
            roll_lines.append("BEGIN;\n")

        # Case 1: Fresh Database Setup
        if not existing_schema or not existing_schema.tables:
            full_sql = SQLGeneratorAgent.generate(
                schema_def=proposed_schema,
                dialect=dialect,
                include_database_creation=False,
                include_indexes=True,
            )
            mig_lines.append(full_sql)

            # Rollback drops all tables in reverse order
            roll_lines.append("-- Revert initial setup by dropping all created tables")
            for t in reversed(proposed_schema.tables):
                q_t = _quote_identifier(t.name, dialect)
                roll_lines.append(f"DROP TABLE IF EXISTS {q_t} CASCADE;") if dialect == "postgresql" else roll_lines.append(f"DROP TABLE IF EXISTS {q_t};")

            if dialect == "postgresql":
                mig_lines.append("\nCOMMIT;")
                roll_lines.append("\nCOMMIT;")

            return "\n".join(mig_lines), "\n".join(roll_lines)

        # Case 2: Incremental Migration
        existing_table_map = {t.name.lower(): t for t in existing_schema.tables}
        proposed_table_map = {t.name.lower(): t for t in proposed_schema.tables}

        # 1. Newly Added Tables
        for t_name in diff.tables_added:
            prop_t = proposed_table_map[t_name.lower()]
            q_t = _quote_identifier(prop_t.name, dialect)
            mig_lines.append(f"-- 1. Create table: {prop_t.name}")

            cols_def = []
            pk_cols = []
            for col in prop_t.columns:
                q_c = _quote_identifier(col.name, dialect)
                dt = _map_data_type(col.data_type, dialect)
                col_stmt = f"    {q_c} {dt}"
                if not col.nullable and "AUTO_INCREMENT" not in dt and "SERIAL" not in dt:
                    col_stmt += " NOT NULL"
                if col.unique and not col.primary_key:
                    col_stmt += " UNIQUE"
                if col.default is not None:
                    col_stmt += f" DEFAULT {col.default}"
                cols_def.append(col_stmt)
                if col.primary_key:
                    pk_cols.append(q_c)

            if pk_cols:
                cols_def.append(f"    PRIMARY KEY ({', '.join(pk_cols)})")

            mig_lines.append(f"CREATE TABLE {q_t} (\n" + ",\n".join(cols_def) + "\n);\n")

            # Rollback drops this added table
            roll_lines.append(f"DROP TABLE IF EXISTS {q_t} CASCADE;") if dialect == "postgresql" else roll_lines.append(f"DROP TABLE IF EXISTS {q_t};")

        # 2. Added Columns
        for item in diff.differences:
            if item.change_type == "COLUMN_ADDED":
                prop_t = proposed_table_map[item.table_name.lower()]
                p_col = next(c for c in prop_t.columns if c.name.lower() == item.column_name.lower())
                q_t = _quote_identifier(item.table_name, dialect)
                q_c = _quote_identifier(item.column_name, dialect)
                dt = _map_data_type(p_col.data_type, dialect)

                add_col_stmt = f"ALTER TABLE {q_t} ADD COLUMN {q_c} {dt}"
                if p_col.default is not None:
                    add_col_stmt += f" DEFAULT {p_col.default}"
                if not p_col.nullable and p_col.default is not None:
                    add_col_stmt += " NOT NULL"
                add_col_stmt += ";"
                mig_lines.append(add_col_stmt)

                # Rollback drops added column
                roll_lines.append(f"ALTER TABLE {q_t} DROP COLUMN IF EXISTS {q_c};")

        # 3. Modified Columns
        for item in diff.differences:
            if item.change_type == "COLUMN_MODIFIED":
                prop_t = proposed_table_map[item.table_name.lower()]
                exist_t = existing_table_map[item.table_name.lower()]
                p_col = next(c for c in prop_t.columns if c.name.lower() == item.column_name.lower())
                e_col = next(c for c in exist_t.columns if c.name.lower() == item.column_name.lower())

                q_t = _quote_identifier(item.table_name, dialect)
                q_c = _quote_identifier(item.column_name, dialect)
                p_dt = _map_data_type(p_col.data_type, dialect)
                e_dt = _map_data_type(e_col.data_type, dialect)

                if dialect == "postgresql":
                    mig_lines.append(f"ALTER TABLE {q_t} ALTER COLUMN {q_c} TYPE {p_dt};")
                    roll_lines.append(f"ALTER TABLE {q_t} ALTER COLUMN {q_c} TYPE {e_dt};")
                else:  # MySQL
                    mig_lines.append(f"ALTER TABLE {q_t} MODIFY COLUMN {q_c} {p_dt};")
                    roll_lines.append(f"ALTER TABLE {q_t} MODIFY COLUMN {q_c} {e_dt};")

        # 4. Dropped Columns (DESTRUCTIVE!)
        for item in diff.differences:
            if item.change_type == "COLUMN_DROPPED":
                exist_t = existing_table_map[item.table_name.lower()]
                e_col = next(c for c in exist_t.columns if c.name.lower() == item.column_name.lower())
                q_t = _quote_identifier(item.table_name, dialect)
                q_c = _quote_identifier(item.column_name, dialect)
                e_dt = _map_data_type(e_col.data_type, dialect)

                mig_lines.append(f"-- WARNING: Destructive column drop")
                mig_lines.append(f"ALTER TABLE {q_t} DROP COLUMN IF EXISTS {q_c};")

                # Rollback restores column definition (data cannot be recovered)
                roll_lines.append(f"-- Restoring dropped column '{item.column_name}' (data loss cannot be reversed by rollback alone)")
                roll_lines.append(f"ALTER TABLE {q_t} ADD COLUMN {q_c} {e_dt};")

        # 5. Dropped Tables (DESTRUCTIVE!)
        for t_name in diff.tables_dropped:
            exist_t = existing_table_map[t_name.lower()]
            q_t = _quote_identifier(exist_t.name, dialect)
            mig_lines.append(f"-- WARNING: Destructive table drop")
            mig_lines.append(f"DROP TABLE IF EXISTS {q_t} CASCADE;") if dialect == "postgresql" else mig_lines.append(f"DROP TABLE IF EXISTS {q_t};")

            # Rollback recreates table
            cols_def = []
            for col in exist_t.columns:
                q_c = _quote_identifier(col.name, dialect)
                dt = _map_data_type(col.data_type, dialect)
                cols_def.append(f"    {q_c} {dt}")
            roll_lines.append(f"-- Recreating dropped table '{exist_t.name}' (data cannot be recovered)")
            roll_lines.append(f"CREATE TABLE {q_t} (\n" + ",\n".join(cols_def) + "\n);")

        if dialect == "postgresql":
            mig_lines.append("\nCOMMIT;")
            roll_lines.append("\nCOMMIT;")

        return "\n".join(mig_lines), "\n".join(roll_lines)


# ── Database Introspection Engine ────────────────────────────────────────────

class DatabaseIntrospectionEngine:
    """Introspects existing live database structure and extracts a CompleteSchemaDefinition."""

    @staticmethod
    def introspect_from_connection_string(conn_str: str, dialect: str = "postgresql") -> CompleteSchemaDefinition:
        """Connects to live DB and inspects schema metadata."""
        engine = create_engine(conn_str)
        inspector = inspect(engine)

        tables: List[TableDesign] = []
        relationships: List[RelationshipDesign] = []

        table_names = inspector.get_table_names()
        for t_name in table_names:
            pk_constraint = inspector.get_pk_constraint(t_name)
            pk_cols = pk_constraint.get("constrained_columns", [])

            foreign_keys = inspector.get_foreign_keys(t_name)
            indexes = inspector.get_indexes(t_name)

            col_designs: List[ColumnDesign] = []
            for col in inspector.get_columns(t_name):
                c_name = col["name"]
                is_pk = c_name in pk_cols

                # Check foreign key
                fk_match = next((fk for fk in foreign_keys if c_name in fk.get("constrained_columns", [])), None)
                ref_tbl = fk_match.get("referred_table") if fk_match else None
                ref_col = fk_match.get("referred_columns", [None])[0] if fk_match else None

                col_designs.append(
                    ColumnDesign(
                        name=c_name,
                        data_type=str(col["type"]),
                        primary_key=is_pk,
                        foreign_key=fk_match is not None,
                        references_table=ref_tbl,
                        references_column=ref_col,
                        nullable=col.get("nullable", True),
                        default=str(col.get("default")) if col.get("default") is not None else None,
                    )
                )

                if fk_match and ref_tbl:
                    relationships.append(
                        RelationshipDesign(
                            from_table=ref_tbl,
                            to_table=t_name,
                            cardinality="ONE_TO_MANY",
                            foreign_key_column=c_name,
                            references_column=ref_col,
                        )
                    )

            tables.append(
                TableDesign(
                    name=t_name,
                    columns=col_designs,
                    primary_key=pk_cols,
                    indexes=[idx.get("name", "") for idx in indexes],
                    is_junction_table="junction" in t_name or "_" in t_name and len(foreign_keys) >= 2,
                )
            )

        return CompleteSchemaDefinition(
            schema_name="IntrospectedDatabase",
            summary=f"Introspected live {dialect.upper()} database with {len(tables)} tables.",
            tables=tables,
            relationships=relationships,
            mermaid_er="",
        )
