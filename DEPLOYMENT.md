# FINN Deployment Guide

This document describes how to deploy FINN in local development, containerized environments, and cloud infrastructure.

---

## 1. Local Development Setup

### System Requirements
* Python 3.10+
* Node.js 18+ (Node 20+ recommended)
* 2 GB RAM minimum

### Step-by-Step Installation

```bash
# 1. Environment configuration
cp .env.example .env

# 2. Python Virtual Environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r backend/requirements.txt

# 3. Database Initialization & Seeding
python backend/run_seed.py

# 4. Frontend Build
cd frontend
npm install
npm run build
cd ..

# 5. Start Servers
python run_finn.py
```

---

## 2. Docker & Containerized Deployment

FINN provides multi-stage container definitions and a Docker Compose orchestrator.

### Launch with Docker Compose
```bash
docker-compose up --build
```

The stack exposes:
* **Frontend:** `http://localhost:3000`
* **FastAPI Backend:** `http://localhost:8000`
* **Persistent SQLite Volume:** `./backend/data` mapped to `/app/data` inside container

### Verifying Service Health
```bash
curl -f http://localhost:8000/api/health
```

Expected response:
```json
{
  "status": "ok",
  "version": "1.0.0",
  "demo_mode": true,
  "llm_configured": false,
  "database": "connected",
  "timestamp": "2026-10-28T16:50:00Z"
}
```

---

## 3. Production Persistence & Migration to PostgreSQL

While FINN uses SQLite with asynchronous connection handling for straightforward local development, all models use standard SQLAlchemy 2.0 ORM conventions.

To migrate to PostgreSQL:
1. Update `DATABASE_URL` in `.env`:
   ```env
   DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/finn
   SYNC_DATABASE_URL=postgresql://user:password@localhost:5432/finn
   ```
2. Install the asyncpg driver:
   ```bash
   pip install asyncpg psycopg2-binary
   ```
3. Run initialization:
   ```bash
   python backend/run_seed.py
   ```
   Tables, foreign keys, cascade deletes, and composite indexes will be created automatically.

---

## 4. Environment Variables Reference

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `sqlite+aiosqlite:///data/db/finn.db` | Async database connection string |
| `SYNC_DATABASE_URL` | `sqlite:///data/db/finn.db` | Sync connection string for table migration |
| `DEMO_MODE` | `true` | Enables deterministic demonstration dataset |
| `YAHOO_FINANCE_ENABLED` | `true` | Allows on-demand EOD market data ingestion |
| `DEFAULT_PRICE_ALERT_THRESHOLD` | `3.0` | Default price move threshold (%) |
| `DEFAULT_VOLUME_MULTIPLIER` | `2.0` | Default unusual volume spike multiplier (x) |
| `API_PORT` | `8000` | Backend port |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000/api` | Backend URL consumed by frontend |
