# FINN: Financial Investment Intelligence Agent
> **ENAM Holdings AI Engineer Build Challenge | IIT Screening 2027**  
> *A Mobile-First Investment Workstation for Indian Public-Markets Investment Teams*

FINN is an institutional-grade, mobile-first intelligence platform engineered specifically for Indian public-market investment managers and research analysts. It continuously processes live stock market prices, trading volumes, exchange announcements, quarterly results, annual reports, earnings-call transcripts, and management commentary to surface what matters, explain why it matters, and allow an investor to investigate any company using primary-source evidence with **zero hallucination**.

---

## 📑 Table of Contents
1. [Executive Summary & Product Vision](#1-executive-summary--product-vision)
2. [What Has Been Done Until Now (Detailed Chronological Log)](#2-what-has-been-done-until-now-detailed-chronological-log)
3. [File-by-File Change Log & Implementation Details](#3-file-by-file-change-log--implementation-details)
4. [System Architecture & Data Flow](#4-system-architecture--data-flow)
5. [Core Product Features](#5-core-product-features)
   - [A. Push Intelligence (Proactive Surveillance)](#a-push-intelligence-proactive-surveillance)
   - [B. Pull Intelligence (Primary-Source Research Workbench)](#b-pull-intelligence-primary-source-research-workbench)
   - [C. Real-Time Alerts Centre & External Provenance Linking](#c-real-time-alerts-centre--external-provenance-linking)
   - [D. Multi-Year Audited Balance Sheet & Cash Flow Engine](#d-multi-year-audited-balance-sheet--cash-flow-engine)
6. [API Endpoints Reference](#6-api-endpoints-reference)
7. [Verification, Testing & Build Status](#7-verification-testing--build-status)
8. [Quick Start & Launch Guide](#8-quick-start--launch-guide)

---

## 1. Executive Summary & Product Vision

Public-market investors in Indian equities are overwhelmed by noise: thousands of exchange filings, irregular corporate disclosures, volatile intraday price swings, and extensive PDF reports.

FINN solves this through two complementary modes:
- **Push Intelligence:** Proactively monitors an investor's portfolio, filters out routine compliance noise, scores filing materiality, detects unusual trading volume spikes ($\ge 2\text{x}$ 20-day average) and price shifts, and streams real-time alerts.
- **Pull Intelligence:** Allows the investor to search any supported NSE company and run deep fundamental investigations grounded in primary documents (Annual Reports, Concall Transcripts, Balance Sheets, and Cash Flows) with verifiable citations down to the exact page number and text chunk.

---

## 2. What Has Been Done Until Now (Detailed Chronological Log)

### Phase 1: Foundation & Core Monolith Scaffold
- **Workspace Inspection & Tech Stack Selection:** Evaluated the workspace environment and selected Next.js 14 (App Router) with TypeScript, Tailwind CSS, and Lucide Icons for the frontend; and Python 3.13 with FastAPI, SQLAlchemy 2.0 (asyncio + SQLite `finn.db`), Pydantic v2, Pandas/NumPy, and `yfinance` for the backend.
- **Database Architecture (16 Models):** Designed and implemented the complete relational schema with cascading deletes, composite indices, and deterministic deduplication keys across companies, price bars, announcements, classifications, financial metrics, alert rules, alert events, source documents, chunks, and citations.
- **Universe Seeding (23 Indian Companies):**
  - **18 Core Demo Portfolio Companies:** `RELIANCE`, `HDFCBANK`, `ICICIBANK`, `SBIN`, `AXISBANK`, `INFY`, `TCS`, `WIPRO`, `LT`, `BHARTIARTL`, `ITC`, `HINDUNILVR`, `MARUTI`, `TATAMOTORS`, `SUNPHARMA`, `TATASTEEL`, `NTPC`, `TITAN`.
  - **5 Ad-hoc Research Universe Companies:** `ADANIPORTS`, `TRENT`, `BEL`, `DMART`, `ZOMATO`.
  - Seeded 60-day historical daily OHLCV price bars, trading volumes, and realistic sector classifications.

### Phase 2: Classification, Digest & Alert Engine
- **17-Category SEBI Announcement Classifier:** Built a deterministic and heuristic classifier mapping corporate filings into the 17 standardized categories: *results, M&A, fund_raise, management_change, litigation, insider_trading, earnings_call, investor_meetings, credit_rating, dividend, bonus_split, capex, press_release, postal_ballot, agm_egm, pledging, unclassified*.
- **Daily Intelligence Digest:** Grouped announcements over 24-hour, 3-day, and 7-day windows, scoring materiality from 0.0 to 1.0 to segregate "Needs Attention" items from "Routine Filings".
- **Deterministic Alert Engine:** Evaluated price moves ($|P_{\text{close}} - P_{\text{prev}}| / P_{\text{prev}} \ge \text{threshold}$), volume spikes ($V \ge \text{multiplier} \times \overline{V}_{20}$), and material announcement subscriptions with SQLite deduplication keys (`dedup_key = 'rule_id_cid_date'`).

### Phase 3: Mobile-First Frontend Application (10 Routes)
- Built the Next.js 14 App Router interface with a mobile-first responsive layout, dark financial workstation palette (`#0a0d14` / `#111520`), and accessible keyboard controls:
  - `/` (Home & Daily Digest)
  - `/portfolio` (Holdings, Sectors, Watchlist, Search, Add/Remove)
  - `/inbox` (Announcements Inbox with category badges and status filters)
  - `/alerts` (Alerts Centre, Rule Management, and Triggered Events)
  - `/research` (8-view primary source research workbench with Copilot)
  - `/sources` (Ingested source documents, PDF inspector, and chunk explorer)
  - `/settings` (System health, DB diagnostic stats, and API provider keys)

### Phase 4: Real-Time Alerts & External Source Verification (Major Upgrade)
- **User Problem Addressed:** In the initial version, alert events only showed observed values without direct deep links to real-time financial reporting or primary exchange documents.
- **Enhancements Implemented:**
  1. **Real-Time Client Auto-Sync Engine:** Added configurable polling cadences (**5s, 10s, 30s, 60s, or Pause**) with silent background state updates, animated live indicators (`● Live Auto-Sync Active`), and zero whole-page flickering.
  2. **"Source Sites & Primary Evidence" Toolbar on Alert Cards:**
     - **Primary Exchange Filing:** Direct link to official BSE/NSE PDF circulars.
     - **Live News (Google):** Live query streaming breaking news and articles for the ticker.
     - **Google Finance:** Intraday chart, real-time bid/ask order book, and valuation ratios.
     - **NSE India Quote:** Direct access to official exchange equity portal, disclosures, and order book.
     - **Moneycontrol Feed:** Indian capital market community and broker consensus feeds.
  3. **In-App Investigation Modals:** Integrated direct triggers for the `QuarterlyComparisonModal` (for results alerts) and `ExecutiveEnrichmentModal` (for management changes).

### Phase 5: Live Audited Balance Sheet & Cash Flow Engine via `yfinance`
- **User Problem Addressed:** When inspecting tickers such as `TCS`, the Research Desk indicated `Primary Sources: 0 Ingested` and stated that balance sheet data required annual report ingestion.
- **Clarification on API Keys:** Clarified that `yfinance` requires **zero API keys or paid registrations**; it operates directly using public Yahoo Finance endpoints for Indian `.NS` tickers.
- **Multi-Year Statement Engine:**
  - Updated `backend/app/api/research.py` to fetch audited 4-year Balance Sheets and Cash Flows using `yfinance`.
  - Extracted: *Total Assets, Shareholders' Net Worth (Equity), Working Capital, Cash & Equivalents, Total Debt, Net Debt, Tangible Book Value, Operating Cash Flow, Free Cash Flow, CapEx, and Cash Dividends Paid*.
  - Formatted all figures consistently in **₹ Crores** ($10^7$ INR).
- **Primary Document Seeding for Top Companies:**
  - Seeded full Annual Reports and Q2 FY25 Concall Transcripts with chunked text for `TCS`, `TATAMOTORS`, `TITAN`, `WIPRO`, and `ZOMATO` (alongside `INFY`, `RELIANCE`, and `HDFCBANK`).
  - The coverage indicator now lights up: `Primary Sources: 2 Ingested (1 AR, 1 Concall)`.
- **Institutional Frontend Statement Tables:**
  - Added dedicated, high-density financial tables in Tab 4 (**Balance Sheet**) and Tab 5 (**Cash Quality**) on `/research` displaying multi-year trajectories with line-item comparisons.

---

## 3. File-by-File Change Log & Implementation Details

### Backend Changes

| File Path | Description of Changes |
| :--- | :--- |
| `backend/app/schemas/schemas.py` | Added `AlertSourceSite` model and enriched `AlertEventResponse` with `source_sites`, `source_url`, `related_announcement_id`, and `related_announcement_category`. |
| `backend/app/api/alerts.py` | Updated `/api/alerts/events` to dynamically resolve related announcements and synthesize source links for Google News, Google Finance, NSE India, Moneycontrol, and primary exchange PDFs. |
| `backend/app/api/research.py` | Implemented `_fetch_yfinance_balance_sheet()` and `_fetch_yfinance_cash_flow()` to pull 4-year audited statements in ₹ Crores. Enhanced `_build_balance_sheet()` and `_build_cash_quality()` to populate structured tables and calculate key financial ratios. |
| `backend/app/services/alert_engine.py` | Enforced idempotent SQLite `dedup_key` assignment across price, volume, and material announcement alerts, preventing duplicate firings. |
| `backend/data/seed_tcs_docs.py` | Seeded TCS Annual Report FY24 and Q2 FY25 Concall Transcript chunks into `source_documents` and `document_chunks`. |
| `backend/data/seed_all_sources.py` | Expanded document seeding across `TATAMOTORS`, `TITAN`, `WIPRO`, and `ZOMATO` with verified CEO remarks, capital allocation notes, and concall excerpts. |
| `backend/tests/test_api.py` | Added integration tests verifying alerts endpoints, portfolio retrieval, quarterly financial comparisons, and search. |

### Frontend Changes

| File Path | Description of Changes |
| :--- | :--- |
| `frontend/src/types/index.ts` | Added `AlertSourceSite` interface and enriched `AlertEvent` with `source_sites`, `source_url`, `related_announcement_id`, and `related_announcement_category`. |
| `frontend/src/lib/api.ts` | Updated `getAlertEvents()` to accept pagination `limit` parameter and added typing support for source site payloads. |
| `frontend/src/app/alerts/page.tsx` | Implemented real-time auto-polling engine (5s/10s/30s/60s), live green pulse badge, filter toolbar (Ticker, Status, Rule Type), and the **"SOURCE SITES & PRIMARY EVIDENCE"** toolbar on each card. Integrated `QuarterlyComparisonModal` and `ExecutiveEnrichmentModal`. |
| `frontend/src/app/research/page.tsx` | Wrapped query params in `<Suspense>`, enhanced document coverage badge, added dedicated **Consolidated Balance Sheet Table** (Tab 4) and **Cash Quality & Capital Allocation Table** (Tab 5) displaying values in ₹ Crores. |
| `frontend/src/components/QuarterlyComparisonModal.tsx` | In-app modal rendering QoQ and YoY comparisons across Revenue, EBITDA, PBT, and PAT with margin calculations. |
| `frontend/src/components/ExecutiveEnrichmentModal.tsx` | In-app modal displaying verified SEBI appointment disclosures, past career history, and educational credentials. |
| `frontend/src/components/CitationDrawer.tsx` | Slide-out drawer displaying primary document excerpts, document titles, and page numbers. |

### Configuration & Tooling Changes

| File Path | Description of Changes |
| :--- | :--- |
| `.gitignore` | Fixed root `/lib/` rule to prevent accidental ignoring of `frontend/src/lib/` and added `*.tsbuildinfo`. |
| `run_finn.py` | Root launcher script executing database checks, seed validation, FastAPI backend, and Next.js frontend in one process. |
| `start.ps1` | PowerShell one-click shortcut for Windows users. |

---

## 4. System Architecture & Data Flow

```
+---------------------------------------------------------------------------------------+
|                                    FINN WORKSTATION                                   |
|                                (Next.js 14 App Router)                                |
+-------------------------------------------+-------------------------------------------+
                                            |
                         REST / JSON & Auto-Sync Polling
                                            |
+-------------------------------------------v-------------------------------------------+
|                               FASTAPI APPLICATION GATEWAY                             |
+---------------------------------------------------------------------------------------+
|  /api/portfolio  |  /api/announcements  |  /api/alerts  |  /api/companies  |  /health  |
+-------------------+----------------------+---------------+-----------------+----------+
         |                     |                   |               |
         v                     v                   v               v
+------------------+  +------------------+  +---------------+  +------------------------+
| Financial Math   |  | 17-Class Filing  |  | Deterministic |  | yfinance Live Adapter  |
| Engine           |  | Classifier       |  | Alert Engine  |  | (.NS / .BO Tickers)    |
| - QoQ / YoY %    |  | - SEBI Categories|  | - Price moves |  | - EOD Market Prices    |
| - EBITDA Margins |  | - Materiality    |  | - Volume spikes| | - 4-Yr Balance Sheets  |
| - Cash Conv. %   |  |   Scorer (0-1.0) |  | - SQLite Dedup|  | - 4-Yr Cash Flows      |
+------------------+  +------------------+  +---------------+  +------------------------+
         |                     |                   |                       |
         +---------------------+-------------------+-----------------------+
                                            |
                                            v
                       +-----------------------------------------+
                       |           SQLITE DATA STORAGE           |
                       |                (finn.db)                |
                       |  - 16 Relational Tables                 |
                       |  - Document Chunk & Vector Store        |
                       |  - Deduplicated Alert Event Store       |
                       +-----------------------------------------+
```

---

## 5. Core Product Features

### A. Push Intelligence (Proactive Surveillance)
- **Daily Intelligence Digest:** Classifies announcements across 24h, 3-day, and 7-day lookbacks, prioritizing material events over routine operational circulars.
- **Quarterly Results Engine:** Extracts Revenue, EBITDA, PBT, and PAT, calculating exact QoQ and YoY deltas.
- **Executive Appointment Intelligence:** Identifies executive transitions and links verified SEBI regulatory filings.

### B. Pull Intelligence (Primary-Source Research Workbench)
- **8 Institutional Research Views:**
  1. **Business Snapshot:** Segment revenue breakdowns and operating descriptions.
  2. **Financial Snapshot:** Core revenue, EBITDA margins, and PAT performance.
  3. **Multi-Year Trajectory:** Quarterly historical progression.
  4. **Balance Sheet:** Consolidated multi-year balance sheet in ₹ Crores.
  5. **Cash Quality:** Free Cash Flow, Operating Cash Flow, CapEx, and Dividends.
  6. **Narrative vs Numbers:** Evaluates management guidance targets vs reported outcomes across quarters.
  7. **Guidance Tracker:** Forward-looking targets categorized by metric and period.
  8. **Bull vs Bear Case:** Evidence-backed investment arguments with explicit caveats.
- **Citation Provenance:** Exact document references citing document name, publication date, and page number.

### C. Real-Time Alerts Centre & External Provenance Linking
- **Configurable Rules:** Price movement thresholds ($\pm 3\%$), unusual volume multiples ($\ge 2.0\text{x}$ 20-day avg), and material announcement categories.
- **Real-Time Auto-Sync:** Automated silent background polling with live visual indicators.
- **Source Verification Links:** Direct deep links to Google News Live, Google Finance Intraday, NSE India Quote, Moneycontrol Feed, and Primary Exchange PDFs.

### D. Multi-Year Audited Balance Sheet & Cash Flow Engine
- **Automated Statement Extraction:** Pulls 4 years of audited statements for any Indian `.NS` ticker without requiring API keys.
- **Financial Ratios & Metrics:** Calculates Return on Equity (ROE), Net Debt, Working Capital, Current Ratio, Operating Cash Flow, and Free Cash Flow.
- **Analytical Safeguards:** Explicitly prevents comparing standalone and consolidated figures, and flags missing or stale data transparently.

---

## 6. API Endpoints Reference

### System Health
- `GET /api/health` — Returns system status, demo mode flag, database connectivity, and LLM configuration.

### Portfolio & Market Data
- `GET /api/portfolio` — Lists all portfolio companies with latest prices, daily changes, and alert counts.
- `POST /api/portfolio` — Adds a ticker to the portfolio or watchlist.
- `DELETE /api/portfolio/{ticker}` — Removes a ticker from the portfolio.
- `GET /api/companies/search?q={query}` — Searches companies across the 23-stock universe and supported NSE tickers.
- `GET /api/companies/{ticker}` — Retrieves detailed company profile and classification metadata.
- `GET /api/companies/{ticker}/prices?days=60` — Retrieves historical daily OHLCV price bars and volume data.
- `POST /api/companies/{ticker}/ingest` — Triggers on-demand market data update via `yfinance`.

### Announcements & Digest
- `GET /api/announcements` — Filterable announcements feed (by ticker, category, status, limit).
- `GET /api/digest?hours=168` — Generates prioritized digest splitting items into Important vs Routine.
- `PATCH /api/announcements/{id}/status` — Updates filing status (`new`, `read`, `saved`, `dismissed`).
- `GET /api/management-change/{announcement_id}` — Returns enriched executive career history.

### Alerts Engine
- `GET /api/alerts/rules` — Lists all configured alert rules.
- `POST /api/alerts/rules` — Creates a new price, volume, or announcement alert rule.
- `PATCH /api/alerts/rules/{id}` — Updates threshold parameters or enables/disables a rule.
- `DELETE /api/alerts/rules/{id}` — Deletes an alert rule.
- `POST /api/alerts/evaluate` — Executes deterministic evaluation across all enabled rules.
- `GET /api/alerts/events` — Returns triggered alert events with attached source site links.
- `PATCH /api/alerts/events/{id}/acknowledge` — Acknowledges a triggered alert.

### Fundamental Research & Financials
- `GET /api/companies/{ticker}/financials` — Returns quarterly results comparison (QoQ / YoY).
- `GET /api/companies/{ticker}/documents` — Lists ingested source documents (Annual Reports, Concalls).
- `GET /api/sources/{id}` — Returns a source document with all indexed text chunks.
- `POST /api/companies/{ticker}/research` — Executes research across any of the 8 analytical modes.

---

## 7. Verification, Testing & Build Status

### Automated Backend Tests
The pytest test suite covers all financial formulas, alert deduplication logic, announcement classifications, and REST endpoints:
```bash
python -m pytest backend/tests -v
```
**Result:**  
`======================== 28 passed, 17 warnings in 1.06s ========================`

### Frontend Production Build
The Next.js 14 App Router production build was verified:
```bash
cd frontend && npm run build
```
**Result:**  
`✓ Compiled successfully`  
`✓ Generating static pages (10/10)`  
`○ (Static) prerendered as static content across all 10 application routes with 0 TypeScript errors.`

---

## 8. Quick Start & Launch Guide

### Prerequisites
- Python 3.10+ (tested on Python 3.13)
- Node.js 18+ (tested on Node v24)
- Git

### One-Click Launch (Recommended)
In the workspace root directory, run:
```powershell
python run_finn.py
```
*Or on Windows PowerShell:*
```powershell
.\start.ps1
```

The launcher will automatically:
1. Verify database tables and seed reproducible demo data in `backend/data/db/finn.db`.
2. Start the FastAPI backend at `http://localhost:8000`.
3. Launch the Next.js frontend at `http://localhost:3000`.

### Manual Startup (Alternative)

**Step 1: Start Backend**
```bash
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

**Step 2: Start Frontend**
```bash
cd frontend
npm run dev
```

### URLs
- **Web Application:** [http://localhost:3000](http://localhost:3000)
- **Interactive Swagger API Docs:** [http://localhost:8000/docs](http://localhost:8000/docs)
- **API Health Endpoint:** [http://localhost:8000/api/health](http://localhost:8000/api/health)
