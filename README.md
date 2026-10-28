# FINN: Financial Investment Intelligence Agent
> **ENAM Holdings AI Engineer Build Challenge | IIT Screening 2027**

FINN is an institutional-grade, mobile-first financial investment intelligence agent designed for Indian public-markets investment teams. It processes market prices, corporate filings, financial results, earnings-call transcripts, and management commentary to surface what matters, explain why it matters, and provide primary-source grounded evidence.

---

## 1. Product Modes

### A. Push Intelligence (Proactive Surveillance)
* **Daily Intelligence Digest:** 24h, 3-day, and 7-day windows grouping exchange filings by company and materiality score. Collapses routine procedural announcements while highlighting material developments.
* **Configurable Triggered Alerts:**
  * **Type A (Price Movements):** Configurable thresholds (default 3%) evaluating daily price moves.
  * **Type B (Unusual Trading Volume):** Multiples of moving averages (e.g., 2.0x 20-day volume).
  * **Type C (Material Filings):** Subscriptions to key corporate action categories.
  * **Deduplication Engine:** Deterministic SQLite dedup keys prevent duplicate notifications.
* **Quarterly Results Analysis:** Automatic parsing of reported Revenue, EBITDA, PBT, and PAT with QoQ and YoY absolute & percentage comparisons and margin calculations.
* **Management Change Enrichment:** Immediate identification of executive role transitions, enriched with verified professional career histories and credentials.

### B. Pull Intelligence (Primary-Source Research Workbench)
* **Generalizes to Any NSE Ticker:** Complete analytical support for both the 18-stock demo portfolio and ad-hoc research tickers (e.g., `ADANIPORTS`, `TRENT`, `BEL`, `DMART`, `ZOMATO`).
* **8 Dedicated Research Views:**
  1. **Business Snapshot:** Segment mix, operational descriptions, and revenue exposure.
  2. **Financial Snapshot:** Key metrics, EBITDA margins, reporting basis.
  3. **Multi-Year Trajectory:** Historical trend analysis across available reporting periods.
  4. **Balance Sheet:** Debt, cash, net debt, and capital structure.
  5. **Cash Quality:** Operating cash flow, capex, free cash flow, and accounting-to-cash conversion.
  6. **Narrative vs Numbers:** Management promises vs actual reported delivery across quarters (achieved, missed, exceeded, or not assessable).
  7. **Guidance Tracker:** Forward targets categorized by quantitative metric, target band, and period.
  8. **Bull vs Bear Synthesis:** Balanced evidence-grounded cases citing primary documents with explicit analytical caveats.
* **Natural Language Copilot:** Freeform analytical inquiries with provenance citations.

---

## 2. Architecture & Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| **Frontend** | Next.js 14 (App Router), TypeScript, Tailwind CSS, Lucide Icons | Mobile-first responsive workstation, high-contrast financial aesthetic, zero extraneous marketing bloat |
| **Backend** | Python 3.13 / FastAPI, Pydantic v2 | High-throughput async REST API with validated request/response schemas |
| **ORM & Storage** | SQLAlchemy 2.0, SQLite (aiosqlite + sync NullPool) | Zero paid vector database requirement; reproducible migrations and idempotent seeding |
| **Market Data** | Yahoo Finance adapter (`yfinance`) with NSE `.NS` mapping | EOD OHLCV data with caching, freshness labels, and transparent offline fallbacks |
| **Calculations** | Pure deterministic Python (`financial_calc.py`) | Arithmetic and thresholds evaluated strictly in code—never entrusted to LLM hallucinations |
| **Classification** | Hybrid Keyword + Metadata + LLM Pipeline | High-confidence matching across 17 exchange announcement categories with materiality scoring |

---

## 3. Quick Start (Single Command)

### Prerequisites
* Python 3.10+ (tested on Python 3.13)
* Node.js 18+ (tested on Node v24)
* Git

### Launch Application
```bash
# Clone and enter workspace
git clone <repo-url>
cd "Enam Holdings"

# Install backend dependencies
pip install -r backend/requirements.txt

# Install frontend dependencies
cd frontend && npm install && npm run build && cd ..

# Launch both servers in one command
python run_finn.py
```

* **Frontend:** [http://localhost:3000](http://localhost:3000)
* **API Documentation (Swagger):** [http://localhost:8000/docs](http://localhost:8000/docs)
* **Health Endpoint:** [http://localhost:8000/api/health](http://localhost:8000/api/health)

---

## 4. Running Automated Tests

A comprehensive suite of 28 unit and integration tests verifies deterministic financial math, 17-category filing classification, duplicate alert prevention, and API contracts.

```bash
python -m pytest backend/tests -v
```

**Results:** `28 passed in 0.97s`

---

## 5. Directory Structure

```
├── backend/
│   ├── app/
│   │   ├── api/             # REST endpoints (portfolio, announcements, alerts, financials, research)
│   │   ├── core/            # Database engine, NullPool lifecycle, configuration
│   │   ├── demo_data/       # Idempotent 23-company reproducible seeder
│   │   ├── models/          # 16 SQLAlchemy ORM models with cascade deletes & unique constraints
│   │   ├── schemas/         # Pydantic validation schemas
│   │   └── services/        # Deterministic math, alert engine, classification & scoring
│   ├── tests/               # 28 pytest test suites
│   ├── run_seed.py          # Standalone seed runner
│   └── requirements.txt     # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── app/             # Next.js App Router pages (/, /portfolio, /inbox, /alerts, /research, /sources, /settings)
│   │   ├── components/      # Navigation, Header, QuarterlyModal, ExecutiveModal, AlertModal, CitationDrawer
│   │   ├── lib/             # Typed API client
│   │   └── types/           # TypeScript interfaces matching backend models
│   ├── package.json
│   └── tailwind.config.js
├── docker-compose.yml       # Production container orchestration
├── Dockerfile.backend
├── Dockerfile.frontend
├── run_finn.py              # Root launcher script
├── start.bat                # Windows launch script
└── pytest.ini               # Pytest configuration
```

---

## 6. Primary-Source Provenance & Analytical Safeguards

* **Zero Secondary News Contamination:** Pull-side research strictly parses annual reports, earnings call transcripts, and quarterly results filings.
* **Deterministic Calculations:** QoQ/YoY percentage changes handle negative denominators consistently: `((Current - Previous) / |Previous|) * 100`.
* **Consolidated vs Standalone Safeguard:** Never compares consolidated figures with standalone figures without explicit labeling.
* **Transparent Stale Data:** Outdated prices or offline ingestion states are explicitly labeled rather than silently substituted with synthetic data.

