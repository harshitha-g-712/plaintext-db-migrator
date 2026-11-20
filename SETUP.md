# SETUP.md — Complete Installation & Operational Guide

## Prerequisites

| Tool | Recommended Version | Verification Command |
|------|--------------------|----------------------|
| **Python** | 3.11 or 3.12 | `python --version` |
| **Node.js** | 18, 20, or 22 | `node --version` |
| **npm** | 9+ | `npm --version` |
| **Docker** (Optional) | 24+ with Compose v2 | `docker compose version` |
| **PostgreSQL** (Optional for local) | 14+ | `psql --version` |

---

## 1. Quick Start with Docker Compose (Recommended)

The simplest and cleanest way to launch the entire multi-container stack:

```powershell
cd c:\text-database\plaintext-db-migrator

# 1. Create your environment configuration file
copy .env.example .env

# 2. Build and start all services (PostgreSQL, FastAPI Backend, React Frontend)
docker compose up --build
```

### Deployed Services:
- **Frontend Web UI**: [http://localhost:5173](http://localhost:5173)
- **Backend REST API**: [http://localhost:8000](http://localhost:8000)
- **Interactive Swagger Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **API Health Check**: [http://localhost:8000/health](http://localhost:8000/health)
- **PostgreSQL Database**: `localhost:5432` (db: `plaintext_db_migrator`, user: `postgres`)

---

## 2. Local Development Setup (Without Docker)

### Step 2.1: Database Setup
Make sure PostgreSQL is running on your machine:
```sql
CREATE DATABASE plaintext_db_migrator;
```

### Step 2.2: Backend Setup
```powershell
cd c:\text-database\plaintext-db-migrator\backend

# Install dependencies
python -m pip install -r requirements.txt

# Run the development server
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Step 2.3: Frontend Setup
```powershell
cd c:\text-database\plaintext-db-migrator\frontend

# Install dependencies
npm install

# Start Vite dev server
npm run dev
```

---

## 3. Running Automated Tests

Run the full regression test suite covering all 7 phases:

```powershell
cd c:\text-database\plaintext-db-migrator\backend
python -m pytest tests/test_phase2.py tests/test_phase3.py tests/test_phase4.py tests/test_phase5.py tests/test_phase6.py -v
```

To run a production typecheck and frontend build:

```powershell
cd c:\text-database\plaintext-db-migrator\frontend
npm run build
```

---

## 4. Environment Variables Configuration (`.env`)

| Variable | Description | Example / Default |
|----------|-------------|-------------------|
| `DATABASE_URL` | SQLAlchemy async connection string | `postgresql+asyncpg://postgres:yourpassword@localhost:5432/plaintext_db_migrator` |
| `JWT_SECRET` | Secret key used to sign authentication tokens | `your-super-secret-jwt-key` |
| `JWT_ALGORITHM` | JWT signing algorithm | `HS256` |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | Access token lifespan | `60` |
| `OPENROUTER_API_KEY` | OpenRouter API Key (uses heuristic fallback if omitted) | `sk-or-...` |
| `OPENROUTER_MODEL` | Model ID for LLM queries | `openai/gpt-4o-mini` |
| `OPENROUTER_BASE_URL` | OpenRouter Base URL | `https://openrouter.ai/api/v1` |
| `BACKEND_CORS_ORIGINS` | JSON list of permitted CORS frontend origins | `["http://localhost:5173","http://localhost:3000"]` |
