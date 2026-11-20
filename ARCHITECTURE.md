# Architecture Specification: PlainText-to-DB Schema Migrator

## 1. System Overview

**PlainText-to-DB Schema Migrator** is an agentic AI-powered platform that converts unstructured natural language database requirements into normalized relational schemas (1NF–3NF), synthesizes dialect-specific DDL for PostgreSQL and MySQL, validates syntax and structural integrity via AST inspection, and automates schema migration and reversible rollback scripting with mandatory human approval gates.

```
User Plain English Requirements
          │
          ▼
┌────────────────────────────────────────────────────────┐
│     Autonomous Multi-Agent Pipeline (LangGraph)        │
│                                                        │
│  [1. Requirement Analyzer Agent]                       │
│       │ (Entities, Attributes, Types, Relationships)   │
│       ▼                                                │
│  [2. Schema Designer Agent] ◄──────────────────────┐   │
│       │ (3NF Normalization, Junction Tables, ER)   │   │
│       ▼                                            │   │
│  [3. SQL Generator Agent]                          │   │
│       │ (Topologically Sorted DDL)                 │   │
│       ▼                                            │   │
│  [4. SQL Validation Agent (SQLGlot)] ──────────────┘   │
│       │ (AST Syntax, Types, PKs, FK targets)           │
│       │                                (If AST error)  │
│       ▼                                                │
│  [5. Review & Risk Sentinel Agent]                     │
│       │ (Architecture Audit, Diff, Risk Classifier)   │
│       ▼                                                │
│  [6. Migration Generator Agent]                        │
│       │ (Forward DDL & Reversible Rollback SQL)        │
│       ▼                                                │
│  [7. Human Approval Gate]                              │
└────────────────────────────────────────────────────────┘
          │
          ▼
   [AWAITING_HUMAN_APPROVAL]
          │
  Human Review Decision (Approve / Reject)
          │
          ▼
Execution & Version Control Record (PostgreSQL / MySQL)
```

---

## 2. Technology Stack & Key Libraries

### Frontend
- **Framework**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS + Lucide React Icons
- **Data Fetching**: Axios HTTP client with JWT interceptors
- **Diagramming & Previews**: Mermaid.js for interactive ER diagrams, Prism.js for syntax-highlighted SQL preview and editing

### Backend
- **Framework**: Python 3.12 + FastAPI (Async & Sync endpoints)
- **Validation**: Pydantic v2 (Strict type checking, schema definitions)
- **ORM & Database**: SQLAlchemy 2.0 (Asyncpg + Psycopg2)
- **Migration & Introspection**: SQLAlchemy Inspector + Alembic
- **SQL AST Engine**: SQLGlot for syntax validation, AST parsing, dialect conversion, and semantic error checking

### AI & Agent Orchestration
- **Agent Framework**: LangGraph StateGraph (`StateGraph`, `END`, conditional routing)
- **LLM Connectivity**: OpenRouter API (`openai/gpt-4o-mini` configurable via `.env`)
- **Offline / Resilient Fallback**: High-fidelity rule-based heuristic parsing engines for zero-downtime development and offline environments

---

## 3. The 7 Engineering Phases

| Phase | Milestone | Core Capabilities |
|-------|-----------|-------------------|
| **Phase 1** | Application Foundation & Auth | JWT auth, bcrypt password hashing, roles (ADMIN, DEVELOPER), project CRUD |
| **Phase 2** | Requirement Analyzer | Natural language entity, attribute, cardinality, constraint, and business rule extraction |
| **Phase 3** | Schema Designer & ER Visualizer | 3NF normalization, foreign key resolution, junction table creation, interactive Mermaid ER diagram |
| **Phase 4** | SQL Generator & Validator | Dialect-aware DDL (PostgreSQL & MySQL), topological sorting, SQLGlot AST validation |
| **Phase 5** | Database Migration & Versioning | Schema comparison engine, risk classifier (SAFE to DESTRUCTIVE), reversible rollback DDL, audit history |
| **Phase 6** | LangGraph Multi-Agent Workflow | 6 specialized agents, self-correction routing loops, and human-in-the-loop approval gate |
| **Phase 7** | System Hardening & Dockerization | Multi-stage containerization, non-root execution, healthchecks, API protection, full documentation |

---

## 4. Multi-Agent Architecture & LangGraph State Machine

### 4.1 State Definition (`AgentState`)
The agent workflow coordinates through a unified TypedDict state containing:
- `workflow_id`, `project_id`, `dialect`, `requirements_text`
- `analyzed_requirements`: Entities, attributes, types, constraints
- `designed_schema`: Normalized tables, columns, indexes, foreign keys
- `mermaid_er`: Visual entity-relationship diagram code
- `generated_sql`: Complete PostgreSQL or MySQL DDL
- `validation_result`: Syntax validity, errors, warnings, dialect compatibility
- `review_report`: Architecture score, findings, risk level
- `diff_report`: Added/dropped tables, added/dropped/modified columns
- `migration_sql` & `rollback_sql`: Forward evolution and inverse rollback scripts
- `steps_history`: Time-stamped audit entries for each agent's execution

### 4.2 Specialized Agent Roles
1. **Requirement Analyzer Agent**:
   Translates raw unstructured sentences into formal entities, attributes, data types, and cardinalities.
2. **Schema Designer Agent**:
   Enforces First, Second, and Third Normal Forms. Detects duplicate attributes, eliminates transitive dependencies, and generates bridge junction tables for many-to-many relationships.
3. **SQL Generator Agent**:
   Performs Kahn's topological sort on table dependency graphs to guarantee parent tables are created before child referencing tables. Emits constraints, indexes, and dialect nuances.
4. **Validation Agent**:
   Parses DDL with SQLGlot into abstract syntax trees. Inspects every AST node for dialect correctness, missing primary keys, invalid foreign key targets, and duplicate column names.
5. **Review Agent**:
   Audits architectural quality (PK completeness, indexing density, column naming conventions). Compares proposed schema against baseline versions to identify and flag potential data loss.
6. **Migration Agent**:
   Synthesizes target DDL modifications (`ALTER TABLE ADD COLUMN`, `DROP COLUMN`, `ADD CONSTRAINT`) and automatically computes inverse rollback statements in reverse dependency order.
7. **Human Approval Sentinel Gate**:
   Stops autonomous execution and enters `AWAITING_HUMAN_APPROVAL`. Guards against uncontrolled production execution.

---

## 5. Security & Safety Model

1. **Zero Credential Exposure**:
   - The frontend never receives `OPENROUTER_API_KEY` or raw database connection credentials.
   - Database connection strings stored in `database_connections` are encrypted/serialized server-side.
2. **Destructive Operation Protection**:
   - Dropping tables or columns is classified as `DESTRUCTIVE`.
   - Migration APIs reject execution of destructive operations unless `force_destructive=true` is explicitly provided by the user.
3. **Container Hardening**:
   - Backend container runs as an unprivileged non-root user (`appuser`, UID 1000).
   - Multi-stage Docker builds strip build dependencies, compiler tools, and temporary files from final images.
   - Built-in container health checks monitor service responsiveness.
