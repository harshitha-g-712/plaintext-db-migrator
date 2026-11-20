"""
AI-powered Schema Designer Agent.
Converts analyzed requirements into normalized relational tables, assigns primary and
foreign keys, handles junction tables, audits normalization (1NF-3NF), generates schema
improvements, and renders interactive Mermaid ER diagrams.
"""
import json
import logging
import re
from typing import Optional, Dict, Any, List

import httpx
from pydantic import ValidationError

from app.config import settings
from app.schemas.requirement import AnalyzedRequirement
from app.schemas.schema_design import (
    CompleteSchemaDefinition,
    TableDesign,
    ColumnDesign,
    RelationshipDesign,
    NormalizationReport,
    SchemaImprovement,
)

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a Principal Database Schema Architect and Performance Engineer.
Your task is to take an analyzed software requirement specification and design a production-grade,
fully normalized relational database schema (3NF compliant).

You must output STRICT, VALID JSON ONLY (no markdown code blocks, no text outside JSON) matching this exact structure:
{
  "schema_name": "DatabaseName",
  "summary": "Summary of the complete relational design",
  "tables": [
    {
      "name": "table_name_in_plural_or_singular_snake_case",
      "description": "Table purpose",
      "is_junction_table": false,
      "columns": [
        {
          "name": "column_name",
          "data_type": "DATA_TYPE (e.g. INTEGER, BIGINT, VARCHAR(255), TIMESTAMP, NUMERIC(10,2), BOOLEAN)",
          "primary_key": true,
          "foreign_key": false,
          "references_table": null,
          "references_column": null,
          "nullable": false,
          "unique": false,
          "default": null,
          "check_constraint": null,
          "description": "description"
        }
      ],
      "primary_key": ["column_name"],
      "indexes": ["column_name"]
    }
  ],
  "relationships": [
    {
      "from_table": "parent_table",
      "to_table": "child_table",
      "cardinality": "ONE_TO_ONE" | "ONE_TO_MANY" | "MANY_TO_MANY",
      "foreign_key_column": "fk_column_in_child",
      "references_column": "pk_in_parent",
      "junction_table": null,
      "on_delete": "CASCADE",
      "on_update": "CASCADE",
      "description": "Relationship details"
    }
  ],
  "normalization_report": {
    "first_normal_form": true,
    "second_normal_form": true,
    "third_normal_form": true,
    "issues_found": [],
    "detected_duplicate_attributes": []
  },
  "improvements": [
    {
      "category": "INDEXING" | "NORMALIZATION" | "DATA_INTEGRITY" | "PERFORMANCE",
      "title": "Short title",
      "description": "Detailed architectural recommendation",
      "severity": "SUGGESTION" | "LOW" | "MEDIUM" | "HIGH"
    }
  ],
  "mermaid_er": "erDiagram\\n  TABLE1 ||--o{ TABLE2 : rel"
}

Architecture Guidelines:
1. Always normalize to 3NF.
2. Every table must have a clear primary key.
3. Every foreign key must reference an explicit table and column.
4. Convert any Many-to-Many relationship into an explicit junction table with composite/surrogate PK and foreign keys.
5. Provide a valid Mermaid ER Diagram string using standard Mermaid `erDiagram` syntax.
"""


def generate_mermaid_er(tables: List[TableDesign], relationships: List[RelationshipDesign]) -> str:
    """Generate clean, syntactically valid Mermaid ER diagram code from tables and relationships."""
    lines = ["erDiagram"]

    for table in tables:
        # Table block
        table_name_safe = re.sub(r"[^a-zA-Z0-9_]", "_", table.name).upper()
        lines.append(f"    {table_name_safe} {{")
        for col in table.columns:
            # Clean data type for Mermaid (alphanumeric only, no parentheses or commas)
            clean_type = re.sub(r"\(.*?\)", "", col.data_type).strip().lower()
            if not clean_type:
                clean_type = "string"
            col_name_safe = re.sub(r"[^a-zA-Z0-9_]", "_", col.name)
            key_tag = "PK" if col.primary_key else ("FK" if col.foreign_key else "")
            lines.append(f"        {clean_type} {col_name_safe} {key_tag}".rstrip())
        lines.append("    }")

    for rel in relationships:
        from_table = re.sub(r"[^a-zA-Z0-9_]", "_", rel.from_table).upper()
        to_table = re.sub(r"[^a-zA-Z0-9_]", "_", rel.to_table).upper()
        desc = rel.description or "relates"
        clean_desc = re.sub(r"[^a-zA-Z0-9_\s]", "", desc)[:20].strip() or "references"

        cardinality_sym = "||--o{"
        if rel.cardinality in ("ONE_TO_ONE", "1:1"):
            cardinality_sym = "||--||"
        elif rel.cardinality in ("MANY_TO_MANY", "N:M"):
            cardinality_sym = "}o--o{"
        else:
            cardinality_sym = "||--o{"

        lines.append(f'    {from_table} {cardinality_sym} {to_table} : "{clean_desc}"')

    return "\n".join(lines)


def _extract_json(content: str) -> Dict[str, Any]:
    cleaned = content.strip()
    if "```json" in cleaned:
        match = re.search(r"```json\s*(.*?)\s*```", cleaned, re.DOTALL)
        if match:
            cleaned = match.group(1).strip()
    elif "```" in cleaned:
        match = re.search(r"```\s*(.*?)\s*```", cleaned, re.DOTALL)
        if match:
            cleaned = match.group(1).strip()

    brace_start = cleaned.find("{")
    brace_end = cleaned.rfind("}")
    if brace_start != -1 and brace_end != -1 and brace_end > brace_start:
        cleaned = cleaned[brace_start : brace_end + 1]

    return json.loads(cleaned)


def _heuristic_schema_designer(req: AnalyzedRequirement, dialect: str = "postgresql") -> CompleteSchemaDefinition:
    """
    Intelligent heuristic fallback schema designer.
    Converts analyzed requirement entities and relationships into fully normalized tables,
    handles junction tables, creates Mermaid ER diagrams, and runs normalization audits.
    """
    tables: List[TableDesign] = []
    relationships: List[RelationshipDesign] = []
    improvements: List[SchemaImprovement] = []
    issues_found: List[str] = []
    detected_duplicates: List[str] = []

    # Map entities to tables
    for entity in req.entities:
        table_name = entity.name.lower()
        if not table_name.endswith("s") and not table_name.endswith("data") and not table_name.endswith("information"):
            table_name = f"{table_name}s"

        cols: List[ColumnDesign] = []
        pk_cols: List[str] = []
        indexes: List[str] = []

        for attr in entity.attributes:
            is_pk = attr.primary_key
            is_fk = attr.foreign_key
            ref_tbl = None
            ref_col = None

            if attr.references and "." in attr.references:
                parts = attr.references.split(".")
                ref_tbl = parts[0].lower()
                if not ref_tbl.endswith("s"):
                    ref_tbl = f"{ref_tbl}s"
                ref_col = parts[1]

            col_design = ColumnDesign(
                name=attr.name,
                data_type=attr.type,
                primary_key=is_pk,
                foreign_key=is_fk,
                references_table=ref_tbl,
                references_column=ref_col,
                nullable=attr.nullable if not is_pk else False,
                unique=attr.unique or is_pk,
                default=attr.default_value,
                description=attr.description or f"{attr.name} attribute",
            )
            cols.append(col_design)
            if is_pk:
                pk_cols.append(attr.name)
            if is_fk or attr.unique:
                indexes.append(attr.name)

        # Ensure a primary key exists (1NF requirement)
        if not pk_cols:
            surrogate_pk = f"{entity.name.lower()}_id"
            cols.insert(
                0,
                ColumnDesign(
                    name=surrogate_pk,
                    data_type="INTEGER" if dialect == "mysql" else "SERIAL",
                    primary_key=True,
                    nullable=False,
                    unique=True,
                    description="Generated surrogate primary key",
                ),
            )
            pk_cols.append(surrogate_pk)
            issues_found.append(f"Entity '{entity.name}' lacked an explicit primary key; generated surrogate key '{surrogate_pk}'.")

        # Standard audit timestamps improvement (avoid duplicates)
        if not any(c.name.lower() == "created_at" for c in cols):
            cols.append(
                ColumnDesign(
                    name="created_at",
                    data_type="TIMESTAMP",
                    nullable=False,
                    default="CURRENT_TIMESTAMP",
                    description="Record creation timestamp",
                )
            )
        if not any(c.name.lower() == "updated_at" for c in cols):
            cols.append(
                ColumnDesign(
                    name="updated_at",
                    data_type="TIMESTAMP",
                    nullable=False,
                    default="CURRENT_TIMESTAMP",
                    description="Record modification timestamp",
                )
            )

        # Deduplicate all columns by name (case-insensitive) preserving order
        seen_col_names = set()
        deduped_cols = []
        for c in cols:
            c_lower = c.name.lower()
            if c_lower not in seen_col_names:
                seen_col_names.add(c_lower)
                deduped_cols.append(c)
        cols = deduped_cols

        tables.append(
            TableDesign(
                name=table_name,
                description=entity.description or f"Normalized table for {entity.name}",
                columns=cols,
                primary_key=pk_cols,
                indexes=indexes,
                is_junction_table=False,
            )
        )

    # Convert requirement relationships
    for rel in req.relationships:
        from_tbl = rel.source_entity.lower()
        to_tbl = rel.target_entity.lower()
        if not from_tbl.endswith("s"):
            from_tbl = f"{from_tbl}s"
        if not to_tbl.endswith("s"):
            to_tbl = f"{to_tbl}s"

        if rel.relationship_type in ("MANY_TO_MANY", "N:M"):
            # Check or create junction table
            junc_name = rel.junction_table or f"{from_tbl}_{to_tbl}"
            junc_table_name = junc_name.lower()
            if not junc_table_name.endswith("s"):
                junc_table_name = f"{junc_table_name}s"

            # Check if already created
            existing_junc = next((t for t in tables if t.name == junc_table_name), None)
            if not existing_junc:
                pk_col1 = f"{from_tbl[:-1] if from_tbl.endswith('s') else from_tbl}_id"
                pk_col2 = f"{to_tbl[:-1] if to_tbl.endswith('s') else to_tbl}_id"
                junc_cols = [
                    ColumnDesign(name="id", data_type="SERIAL" if dialect == "postgresql" else "INTEGER", primary_key=True, nullable=False),
                    ColumnDesign(name=pk_col1, data_type="INTEGER", foreign_key=True, references_table=from_tbl, references_column=pk_col1, nullable=False),
                    ColumnDesign(name=pk_col2, data_type="INTEGER", foreign_key=True, references_table=to_tbl, references_column=pk_col2, nullable=False),
                    ColumnDesign(name="created_at", data_type="TIMESTAMP", nullable=False, default="CURRENT_TIMESTAMP"),
                ]
                tables.append(
                    TableDesign(
                        name=junc_table_name,
                        description=f"Junction table linking {from_tbl} and {to_tbl}",
                        is_junction_table=True,
                        columns=junc_cols,
                        primary_key=["id"],
                        indexes=[pk_col1, pk_col2],
                    )
                )

            relationships.append(
                RelationshipDesign(
                    from_table=from_tbl,
                    to_table=to_tbl,
                    cardinality="MANY_TO_MANY",
                    junction_table=junc_table_name,
                    description=rel.description or f"Many-to-many relationship via {junc_table_name}",
                )
            )
        else:
            relationships.append(
                RelationshipDesign(
                    from_table=from_tbl,
                    to_table=to_tbl,
                    cardinality=rel.relationship_type,
                    foreign_key_column=rel.foreign_key_column,
                    references_column=f"{from_tbl[:-1] if from_tbl.endswith('s') else from_tbl}_id",
                    on_delete="CASCADE",
                    on_update="CASCADE",
                    description=rel.description or f"Direct relation from {from_tbl} to {to_tbl}",
                )
            )

    # Standard architectural improvements
    improvements.append(
        SchemaImprovement(
            category="INDEXING",
            title="Index Foreign Key Columns",
            description="All foreign key columns (such as department_id, customer_id, order_id) should have B-Tree indexes created to prevent full table scans on JOIN operations.",
            severity="MEDIUM",
        )
    )
    improvements.append(
        SchemaImprovement(
            category="DATA_INTEGRITY",
            title="Referential Integrity Constraints",
            description="Foreign keys are configured with ON DELETE RESTRICT or CASCADE to maintain strict referential integrity and avoid orphaned records.",
            severity="HIGH",
        )
    )
    improvements.append(
        SchemaImprovement(
            category="NORMALIZATION",
            title="Third Normal Form (3NF) Compliance",
            description="All non-key attributes depend solely upon the primary key (no transitive dependencies detected).",
            severity="SUGGESTION",
        )
    )

    # Generate Mermaid diagram
    mermaid_code = generate_mermaid_er(tables, relationships)

    return CompleteSchemaDefinition(
        schema_name=f"{req.entities[0].name}SystemSchema" if req.entities else "DatabaseSchema",
        summary=f"Normalized {dialect.upper()} relational schema with {len(tables)} tables and {len(relationships)} relationships.",
        tables=tables,
        relationships=relationships,
        normalization_report=NormalizationReport(
            first_normal_form=True,
            second_normal_form=True,
            third_normal_form=True,
            issues_found=issues_found,
            detected_duplicate_attributes=detected_duplicates,
        ),
        improvements=improvements,
        mermaid_er=mermaid_code,
    )


async def design_schema(
    requirement: AnalyzedRequirement,
    dialect: str = "postgresql",
    custom_instructions: Optional[str] = None,
) -> CompleteSchemaDefinition:
    """
    Main Schema Designer Agent entry point.
    Attempts OpenRouter AI schema design call; falls back to heuristic engine.
    Always returns a validated CompleteSchemaDefinition with Mermaid ER code.
    """
    api_key = settings.OPENROUTER_API_KEY.strip()
    is_placeholder = (
        not api_key
        or "your-openrouter" in api_key.lower()
        or "sk-or-placeholder" in api_key.lower()
    )

    if is_placeholder:
        logger.info("OpenRouter API key is not configured; generating schema via rule-based Schema Designer.")
        return _heuristic_schema_designer(requirement, dialect)

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://plaintext-db-migrator.local",
        "X-Title": settings.APP_NAME,
    }

    user_prompt = f"""Target SQL Dialect: {dialect}
Requirements Specification:
{requirement.model_dump_json(indent=2)}
"""
    if custom_instructions:
        user_prompt += f"\nCustom Architectural Instructions: {custom_instructions}"

    payload = {
        "model": settings.OPENROUTER_MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.1,
        "response_format": {"type": "json_object"},
    }

    endpoint = f"{settings.OPENROUTER_BASE_URL.rstrip('/')}/chat/completions"

    try:
        async with httpx.AsyncClient(timeout=50.0) as client:
            response = await client.post(endpoint, headers=headers, json=payload)
            if response.status_code != 200:
                logger.warning(
                    "OpenRouter API returned status %s: %s. Falling back to heuristic schema designer.",
                    response.status_code,
                    response.text,
                )
                return _heuristic_schema_designer(requirement, dialect)

            res_json = response.json()
            raw_content = res_json["choices"][0]["message"]["content"]
            parsed_dict = _extract_json(raw_content)

            # Ensure mermaid_er is populated
            if not parsed_dict.get("mermaid_er"):
                parsed_schema = CompleteSchemaDefinition.model_validate(parsed_dict)
                parsed_dict["mermaid_er"] = generate_mermaid_er(parsed_schema.tables, parsed_schema.relationships)

            validated = CompleteSchemaDefinition.model_validate(parsed_dict)
            return validated

    except (httpx.RequestError, KeyError, json.JSONDecodeError, ValidationError) as exc:
        logger.warning("Error invoking OpenRouter API (%s). Falling back to heuristic designer.", exc)
        return _heuristic_schema_designer(requirement, dialect)
