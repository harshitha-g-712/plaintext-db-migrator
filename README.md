# PlainText-to-DB Schema Migrator

> **Agentic AI-Powered Natural Language to Database Schema Generation and Migration Platform**

Transform plain English requirements into validated database schemas, interactive ER diagrams, dialect-specific DDL scripts, and safe database migration workflows with reversible rollbacks — coordinated autonomously by a specialized multi-agent LangGraph pipeline with human-in-the-loop safety boundaries.

---

## ✨ System Features & Phase Status

| Phase | Milestone | Description | Status |
|:---:|:---|:---|:---:|
| **1** | **Application Foundation & Auth** | JWT auth, bcrypt password hashing, roles (ADMIN/DEVELOPER), project management | ✅ Complete |
| **2** | **Natural Language Requirement Analyzer** | Entity, attribute, constraint, and cardinality extraction via OpenRouter AI + heuristic parser | ✅ Complete |
| **3** | **AI-Powered Schema Designer** | 3NF normalization, junction tables, and interactive Mermaid ER diagrams | ✅ Complete |
| **4** | **SQL Generator & AST Validator** | Dialect-aware DDL (PostgreSQL/MySQL), topological sorting, SQLGlot AST validation | ✅ Complete |
| **5** | **Database Migration & Version Control** | Schema diff comparison, risk level classification (SAFE to DESTRUCTIVE), reversible rollback DDL | ✅ Complete |
| **6** | **LangGraph Multi-Agent Orchestration** | 6 specialized agents, self-correction routing loops, and human-in-the-loop approval gate | ✅ Complete |
| **7** | **Production Readiness & Hardening** | Multi-stage Docker, non-root containers, healthchecks, full test coverage, documentation | ✅ Complete |

---

## 🛠 Technology Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, React Router, Axios, Lucide Icons, Mermaid.js, Prism.js
- **Backend**: Python 3.12, FastAPI, SQLAlchemy 2.0 (Asyncpg + Psycopg2), Pydantic v2
- **Agent Framework**: LangGraph StateGraph (State management, conditional edges, human checkpointing)
- **SQL AST Engine**: SQLGlot (AST parsing, dialect validation, relational semantic checks)
- **Database**: PostgreSQL 16 (app data and target), MySQL 8 supported as target
- **AI Connectivity**: OpenRouter API (`OPENROUTER_MODEL` configurable in `.env`), with resilient local fallback
- **Containerization**: Docker, Docker Compose, Multi-stage builds, Unprivileged `appuser`

---

## 🤖 The Multi-Agent Workflow

```
[Plain English Requirements]
             │
             ▼
[1. Requirement Analyzer Agent] ──► Extracts Entities, Attributes & Cardinality
             │
             ▼
[2. Schema Designer Agent] ───────► Normalizes to 3NF, Creates Junction Tables, Generates ER Code
             │
             ▼
[3. SQL Generator Agent] ─────────► Synthesizes Topologically Sorted DDL
             │
             ▼
[4. SQL Validation Agent] ────────► SQLGlot AST Syntax & Relational Check
       │                   ▲
       │ (If AST Invalid)  │ (Self-Correction Loop)
       └───────────────────┘
       │ (If AST Valid)
       ▼
[5. Review & Risk Sentinel Agent] ─► Evaluates Quality & Assesses Migration Risk Level
             │
             ▼
[6. Migration Generator Agent] ───► Emits Forward Evolution DDL & Reversible Rollback SQL
             │
             ▼
[7. Human Approval Gate] ─────────► Pauses at AWAITING_HUMAN_APPROVAL until approved by user
             │
             ▼
     [Database Migration Applied & Version History Recorded]
```

---

## 📊 Entity Relationship (ER) Diagrams

### 1. Platform System Data Model (Core Database)
The following ER diagram represents the internal database schema powering the PlainText-to-DB Migrator:

```mermaid
erDiagram
    users ||--o{ projects : owns
    users ||--o{ agent_workflow_executions : triggers
    projects ||--o{ database_connections : configures
    projects ||--o{ requirements : analyzes
    projects ||--o{ schemas : designs
    projects ||--o{ migrations : executes
    projects ||--o{ agent_workflow_executions : orchestrates
    migrations ||--o{ migration_history : tracks
    schemas ||--o{ migrations : "source / target"

    users {
        guid id PK
        string name
        string email UK
        string password_hash
        enum role "ADMIN | DEVELOPER"
        boolean is_active
        datetime created_at
        datetime updated_at
    }

    projects {
        guid id PK
        guid user_id FK
        string project_name
        text description
        datetime created_at
        datetime updated_at
    }

    database_connections {
        guid id PK
        guid project_id FK
        string connection_name
        enum database_type "postgresql | mysql"
        text connection_configuration
        datetime created_at
    }

    requirements {
        guid id PK
        guid project_id FK
        text original_text
        json analyzed_data
        datetime created_at
        datetime updated_at
    }

    schemas {
        guid id PK
        guid project_id FK
        string schema_name
        json schema_definition
        string database_dialect
        int version
        text mermaid_er
        datetime created_at
        datetime updated_at
    }

    migrations {
        guid id PK
        guid project_id FK
        guid source_schema_id FK
        guid target_schema_id FK
        string database_dialect
        text migration_sql
        text rollback_sql
        enum status "PENDING | APPROVED | EXECUTED | REJECTED | ROLLED_BACK"
        enum risk_level "SAFE | LOW | MEDIUM | HIGH | DESTRUCTIVE"
        json detected_diff
        datetime created_at
        datetime executed_at
    }

    migration_history {
        guid id PK
        guid migration_id FK
        int version
        string execution_status
        string executed_by
        datetime execution_timestamp
        text error_message
    }

    agent_workflow_executions {
        guid id PK
        guid project_id FK
        guid user_id FK
        enum status "PENDING | RUNNING | AWAITING_HUMAN_APPROVAL | APPROVED | REJECTED | COMPLETED | FAILED"
        string current_step
        string dialect
        text requirements_text
        json workflow_state
        json steps_history
        boolean human_approval_required
        boolean is_approved
        string approved_by
        text approval_notes
        datetime created_at
        datetime updated_at
        datetime completed_at
    }
```

### 2. Example AI-Generated Application ER Diagram (E-Commerce)
When a user provides natural language requirements, the **Schema Designer Agent** synthesizes a normalized 3NF ER diagram rendered interactively in the web application:

```mermaid
erDiagram
    CUSTOMERS ||--o{ ORDERS : places
    CATEGORIES ||--o{ PRODUCTS : categorizes
    PRODUCTS ||--o{ ORDER_ITEMS : contains
    ORDERS ||--o{ ORDER_ITEMS : includes
    ORDERS ||--|| PAYMENTS : settled_by

    CUSTOMERS {
        uuid id PK
        string full_name
        string email UK
        string phone
        timestamp created_at
    }

    CATEGORIES {
        uuid id PK
        string name UK
        text description
    }

    PRODUCTS {
        uuid id PK
        uuid category_id FK
        string product_name
        decimal price
        int stock_quantity
    }

    ORDERS {
        uuid id PK
        uuid customer_id FK
        string status
        decimal total_amount
        timestamp order_date
    }

    ORDER_ITEMS {
        uuid id PK
        uuid order_id FK
        uuid product_id FK
        int quantity
        decimal unit_price
    }

    PAYMENTS {
        uuid id PK
        uuid order_id FK
        string payment_method
        string transaction_reference UK
        decimal amount
        string payment_status
    }
```

---

## 🚀 Quick Start

For full installation and configuration steps, see [SETUP.md](./SETUP.md). For detailed architectural specs, see [ARCHITECTURE.md](./ARCHITECTURE.md).

### Run with Docker Compose (Recommended)

```powershell
# Copy environment configuration
copy .env.example .env

# Start all services with one command
docker compose up --build
```

- **Frontend App**: [http://localhost:5173](http://localhost:5173)
- **Backend API**: [http://localhost:8000](http://localhost:8000)
- **Swagger Documentation**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **Health Check**: [http://localhost:8000/health](http://localhost:8000/health)

### Run Locally (Without Docker)

```powershell
# 1. Backend
cd backend
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 2. Frontend (in a separate terminal)
cd frontend
npm install
npm run dev
```

---

## 🧪 Testing & Verification

Run the full automated test suite covering all phases:

```powershell
cd backend
python -m pytest tests/test_phase2.py tests/test_phase3.py tests/test_phase4.py tests/test_phase5.py tests/test_phase6.py -v
```

Run frontend production build verification:

```powershell
cd frontend
npm run build
```

---

## 📁 Repository Structure

```
plaintext-db-migrator/
├── frontend/                  # React 18 + Vite + TypeScript + Tailwind
│   ├── src/
│   │   ├── components/        # Button, Card, Input, SQLEditor, MermaidRenderer, Navbar
│   │   ├── pages/             # Dashboard, Projects, Requirements, SchemaDesignerTab,
│   │   │                      # SQLGeneratorTab, MigrationTab, AgentWorkflowTab
│   │   ├── services/          # auth, project, requirement, schema, sql, migration, agent
│   │   └── types/             # Pydantic-mirrored TypeScript domain interfaces
│   ├── Dockerfile             # Multi-stage static build with Nginx on port 5173
│   └── nginx.conf             # Production proxy and SPA routing
├── backend/                   # FastAPI + LangGraph + SQLGlot + SQLAlchemy
│   ├── app/
│   │   ├── api/v1/            # auth, projects, requirements, schemas, sql, migrations, agents
│   │   ├── auth/              # JWT issuance, verification, role-based guard
│   │   ├── database/          # Async session engine & model base
│   │   ├── models/            # SQLAlchemy models (User, Project, Schema, Migration, History, Workflow)
│   │   ├── schemas/           # Pydantic v2 schemas
│   │   ├── services/          # ai_analyzer, schema_designer, sql_agent, migration_engine, agent_workflow
│   │   └── main.py            # FastAPI entry point, CORS, and healthcheck
│   ├── tests/                 # Unit tests (Phases 2 through 6)
│   ├── requirements.txt       # Hardened Python dependencies
│   └── Dockerfile             # Multi-stage unprivileged (non-root) container
├── docker-compose.yml         # Full-stack composition (postgres, backend, frontend)
├── .env.example               # Environment variables template
├── ARCHITECTURE.md            # Comprehensive system and agent architecture document
├── SETUP.md                   # Complete local and containerized setup guide
└── README.md                  # Project overview and user documentation
```
