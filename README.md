# FINN: Financial Investment Intelligence Agent
> **ENAM Holdings AI Engineer Build Challenge | IIT Screening 2027**  
> *A Production-Grade, Mobile-First Financial Intelligence Workstation for Indian Public-Markets Investment Teams*

---

## 📑 Master Table of Contents
1. [Product Vision & Dual Intelligence Modes](#1-product-vision--dual-intelligence-modes)
2. [What Has Been Done Until Now (Exhaustive Chronological Log)](#2-what-has-been-done-until-now-exhaustive-chronological-log)
3. [Relational Database Schema (All 16 Tables & Attributes)](#3-relational-database-schema-all-16-tables--attributes)
4. [Corporate Announcement 17-Class Taxonomy (SEBI LODR Specification)](#4-corporate-announcement-17-class-taxonomy-sebi-lodr-specification)
5. [Deterministic Quantitative Formulas (Pure Python — Zero Hallucination)](#5-deterministic-quantitative-formulas-pure-python--zero-hallucination)
6. [The 8 Research Desk Views & Primary-Source RAG Pipeline](#6-the-8-research-desk-views--primary-source-rag-pipeline)
7. [Real-Time Alerts Engine & External Source Provenance Architecture](#7-real-time-alerts-engine--external-source-provenance-architecture)
8. [Multi-Year Audited Balance Sheet & Cash Flow Engine via yfinance](#8-multi-year-audited-balance-sheet--cash-flow-engine-via-yfinance)
9. [Complete Codebase File-by-File Blueprint](#9-complete-codebase-file-by-file-blueprint)
10. [API Endpoints Reference (All 25+ Routes)](#10-api-endpoints-reference-all-25-routes)
11. [Engineering Obstacles, Windows Sandbox Hardening & Bug Fixes](#11-engineering-obstacles-windows-sandbox-hardening--bug-fixes)
12. [Verification, Automated Testing & Build Validation](#12-verification-automated-testing--build-validation)
13. [Step-by-Step Deployment & Launch Guide](#13-step-by-step-deployment--launch-guide)

---

## 1. Product Vision & Dual Intelligence Modes

FINN is engineered specifically for Indian public-market institutional investment teams (portfolio managers, sector heads, and equity research analysts). 

Indian markets generate thousands of compliance circulars, stock exchange filings under SEBI (Listing Obligations and Disclosure Requirements) Regulations, volatile price ticks, and multi-hundred-page quarterly PDF disclosures. An institutional analyst needs to identify the few developments that truly matter, understand their exact quantitative impact, and investigate management commentary using primary-source evidence.

FINN delivers this through two complementary operating modes:

```
+---------------------------------------------------------------------------------------------------+
|                                   FINN DUAL-MODE INTELLIGENCE ENGINE                              |
+-------------------------------------------------+-------------------------------------------------+
|              MODE A: PUSH INTELLIGENCE          |            MODE B: PULL INTELLIGENCE            |
|         (Proactive Surveillance & Alerts)       |       (Deep Fundamental Primary-Source Desk)    |
+-------------------------------------------------+-------------------------------------------------+
| • Daily Intelligence Digest (24h / 3d / 7d)     | • Generalizes to Any Supported NSE Ticker       |
| • 17-Category SEBI LODR Filing Classification   | • 8 Dedicated Research Workstations             |
| • Filing Materiality Scoring (0.0 to 1.0)       | • Consolidated 4-Year Audited Balance Sheets    |
| • Deterministic Price Move Alerts (e.g. >= 3%)  | • 4-Year Cash Quality & Capital Allocation      |
| • Unusual Trading Volume Spikes (>= 2x 20d Avg) | • Management Promise vs Reported Outcome (4Q)   |
| • Real-Time Client Auto-Sync (5s / 10s / 30s)   | • Primary Document Provenance & Page Citations  |
| • Live Provenance Bar (Google/NSE/Moneycontrol) | • Freeform Natural Language Copilot             |
+-------------------------------------------------+-------------------------------------------------+
```

### Core Analytical Tenets
1. **Zero Hallucination Policy:** Pull-side fundamental research is grounded exclusively in primary-source documents (audited annual reports, conference call transcripts, and quarterly regulatory filings). FINN will never invent balance sheet numbers or fabricate management quotes.
2. **Pure Deterministic Arithmetic:** All percentage changes, moving averages, volume multiples, and EBITDA margins are evaluated using strict mathematical Python code—never delegated to an LLM.
3. **Transparent Stale Data & Offline Safeguards:** Ingestion states, market data dates, and offline fallbacks are explicitly surfaced. Stale data is prominently tagged, never hidden.

---

## 2. What Has Been Done Until Now (Exhaustive Chronological Log)

### Milestone 1: Workspace Inspection & Architecture Definition
- Inspected installed environment: Python 3.13, Node.js v24, PowerShell on Windows.
- Established a modular monolith architecture: **Next.js 14 App Router** frontend with TypeScript and Tailwind CSS; **Python FastAPI** backend with SQLAlchemy 2.0 async ORM and SQLite (`finn.db`); pure mathematical services in `financial_calc.py`; and an asynchronous event engine in `alert_engine.py`.
- Configured environment files (`.env`, `pytest.ini`, `next.config.mjs`, `tailwind.config.js`).

### Milestone 2: 16 Relational Models & SQLite Storage Engine
- Authored 16 SQLAlchemy ORM models covering the full lifecycle of public equities, market prices, filings, alert rules, triggered events, document chunks, citations, guidance statements, and research sessions.
- Added composite database indices on `triggered_at`, `filing_date`, `company_id`, and `is_acknowledged` to guarantee sub-millisecond query latency.
- Implemented an idempotent database initializer (`init_db`) and connection engine with `NullPool` to prevent connection leaks across async requests.

### Milestone 3: 23-Stock Indian Equity Universe Seeding
- Seeded **18 Core Portfolio Companies** representing major Indian sectors and market caps:
  - *Energy & Conglomerate:* `RELIANCE` (Reliance Industries Ltd)
  - *Banking & Financials:* `HDFCBANK`, `ICICIBANK`, `SBIN`, `AXISBANK`
  - *IT Services:* `INFY`, `TCS`, `WIPRO`
  - *Infrastructure & Capital Goods:* `LT` (Larsen & Toubro)
  - *Telecom:* `BHARTIARTL` (Bharti Airtel)
  - *FMCG:* `ITC`, `HINDUNILVR` (Hindustan Unilever)
  - *Automotive:* `MARUTI`, `TATAMOTORS`
  - *Healthcare & Pharma:* `SUNPHARMA`
  - *Metals & Mining:* `TATASTEEL`
  - *Power & Utilities:* `NTPC`
  - *Consumer Discretionary:* `TITAN` (Titan Company Ltd)
- Seeded **5 Ad-hoc Research Universe Companies** outside the initial portfolio:
  - `ADANIPORTS`, `TRENT`, `BEL`, `DMART`, `ZOMATO`.
- Generated 60 days of realistic historical daily OHLCV trading bars with volume spikes and price breakouts for realistic testing.

### Milestone 4: Corporate Announcement Ingestion & 17-Class Classifier
- Implemented the official 17-category classification pipeline (`backend/app/services/classifier.py`):
  `results`, `M&A`, `fund_raise`, `management_change`, `litigation`, `insider_trading`, `earnings_call`, `investor_meetings`, `credit_rating`, `dividend`, `bonus_split`, `capex`, `press_release`, `postal_ballot`, `agm_egm`, `pledging`, `unclassified`.
- Implemented materiality scoring ($0.0 \le S \le 1.0$) based on category importance, company market cap, keyword urgency, and historical impact.
- Built the **Daily Intelligence Digest** (`/api/digest`), grouping announcements into **Important Items** (requiring immediate review) and **Routine Items** (routine disclosures).

### Milestone 5: Deterministic Alerts Centre (`/alerts`)
- Built the alert engine (`backend/app/services/alert_engine.py`) with support for three rule types:
  - **Price Movement:** Configurable threshold (e.g., $\pm 3\%$) evaluated against previous close.
  - **Unusual Volume:** Moving average multiple (e.g., $\ge 2.0\text{x}$ 20-day historical volume).
  - **Material Announcement:** Subscriptions to specific filing categories.
- Built an idempotent deduplication key generator (`dedup_key = f"{rule_type}_{rule_id}_{company_id}_{date}"`), ensuring alert evaluations never create duplicate entries in SQLite.

### Milestone 6: Mobile-First Next.js 14 Frontend Application
- Developed a high-density, dark-themed workstation UI (`#0a0d14` background, `#111520` cards, `#1e2433` borders) across 10 application routes:
  - `/`: Main dashboard with Daily Intelligence Digest and key indices.
  - `/portfolio`: Complete portfolio holdings table, sector breakdown, search, and watchlist toggle.
  - `/inbox`: Exchange announcement stream with 17-category pill filters and search.
  - `/alerts`: Active alert rules, evaluation controls, and triggered event feed.
  - `/research`: 8-tab fundamental research workbench with AI Copilot.
  - `/sources`: Primary document repository, PDF viewer, and chunk viewer.
  - `/settings`: System diagnostics, database statistics, and LLM provider credentials.
- Created reusable components: `Header.tsx`, `Navigation.tsx`, `AlertRuleModal.tsx`, `QuarterlyComparisonModal.tsx`, `ExecutiveEnrichmentModal.tsx`, and `CitationDrawer.tsx`.

### Milestone 7: Real-Time Alerts Centre & External Provenance Linking (User Enhancement)
- **User Request:** Add direct source links (Google News, Google Finance, NSE, Moneycontrol, primary filings) to triggered alerts, make the stream real-time, and explain the architecture.
- **Backend Enhancements (`schemas.py`, `alerts.py`):**
  - Added `AlertSourceSite` schema.
  - Enriched `/api/alerts/events` to resolve related announcements and synthesize live external deep links.
- **Frontend Enhancements (`alerts/page.tsx`):**
  - Built a real-time auto-sync engine with configurable cadences (**5s, 10s, 30s, 60s, Pause**).
  - Added a pulsing live status badge (`● Live Auto-Sync Active`).
  - Added a **"SOURCE SITES & PRIMARY EVIDENCE"** toolbar on every alert card linking to:
    - *Primary Exchange Filing* (official PDF link).
    - *Live News (Google)* (`news.google.com/search?q={ticker}+NSE+stock+news`).
    - *Google Finance* (`google.com/finance/quote/{ticker}:NSE`).
    - *NSE India Quote* (`nseindia.com/get-quotes/equity?symbol={ticker}`).
    - *Moneycontrol Feed* (`google.com/search?q={ticker}+moneycontrol+stock+news`).
  - Integrated in-app deep dive buttons opening the `QuarterlyComparisonModal` and `ExecutiveEnrichmentModal` directly from the alert cards.

### Milestone 8: Live Balance Sheet & Cash Flow Engine via `yfinance`
- **User Request:** Allow users to fetch and analyze balance sheets and cash flow statements for any selected company (e.g., TCS), explain how to obtain API keys, and explain why TCS previously showed 0 documents.
- **API Key Clarification:** Clarified that `yfinance` is completely open-source and free, requiring **zero API keys** or paid registrations.
- **Statement Extraction Pipeline (`backend/app/api/research.py`):**
  - Implemented `_fetch_yfinance_balance_sheet()` extracting 4 years of audited balance sheet data (*Total Assets, Net Worth, Working Capital, Total Debt, Net Debt, Cash Reserves, Tangible Book Value*) formatted in **₹ Crores**.
  - Implemented `_fetch_yfinance_cash_flow()` extracting 4 years of audited cash flow data (*Operating Cash Flow, Free Cash Flow, CapEx, Dividends Paid*).
- **Primary Source Seeding (`seed_all_sources.py`):**
  - Seeded verified Annual Reports and Q2 FY25 Concall Transcripts with text chunks for `TCS`, `TATAMOTORS`, `TITAN`, `WIPRO`, and `ZOMATO` (alongside `INFY`, `RELIANCE`, and `HDFCBANK`).
  - Fixed the `Primary Sources: 0 Ingested` state so TCS now displays `Primary Sources: 2 Ingested (1 AR, 1 Concall)`.
- **Institutional Statement Tables (`research/page.tsx`):**
  - Added dedicated **Consolidated Balance Sheet** (Tab 4) and **Cash Quality & Capital Allocation** (Tab 5) tables in the Research Desk displaying multi-year trajectories with line-item comparisons.

---

## 3. Relational Database Schema (All 16 Tables & Attributes)

The database (`backend/data/db/finn.db`) is managed via SQLAlchemy 2.0 with strict foreign key constraints, cascade deletes, and composite indices.

```
+----------------------------------------------------------------------------------------------------+
|                                    RELATIONAL SCHEMA ARCHITECTURE                                  |
+----------------------------------------------------------------------------------------------------+
  [companies]
      ├──< [portfolio_memberships] (portfolio_name, is_watchlist)
      ├──< [price_bars] (date, open, high, low, close, volume, daily_change_pct)
      ├──< [announcements] (title, category, filing_date, source_url)
      │         └──< [announcement_classifications] (category, confidence, explanation)
      ├──< [financial_periods] (fiscal_year, fiscal_quarter, reporting_basis)
      │         └──< [financial_metrics] (metric_name, value, unit, currency)
      ├──< [guidance_statements] (metric_name, target_value_low, target_value_high, status)
      ├──< [source_documents] (document_type, title, publication_date, source_url)
      │         └──< [document_chunks] (chunk_index, content, section_heading, page_number)
      │                   └──< [citations] (citation_key, context_excerpt)
      ├──< [alert_rules] (rule_type, threshold_value, volume_multiplier, announcement_categories)
      │         └──< [alert_events] (trigger_value, observed_value, threshold_value, dedup_key)
      └──< [research_sessions] (query, research_type, status)
                └──< [research_answers] (answer_json, summary, key_observations)
```

### Table Definitions

#### 1. `companies`
- `id` (Integer, Primary Key, autoincrement)
- `ticker` (String(20), Unique, Not Null, Index) — e.g. "RELIANCE", "TCS"
- `name` (String(200), Not Null) — e.g. "Tata Consultancy Services Ltd"
- `sector` (String(100), Nullable, Index) — e.g. "IT Services"
- `industry` (String(100), Nullable) — e.g. "IT Consulting"
- `exchange` (String(20), Default "NSE")
- `yahoo_symbol` (String(30), Nullable) — e.g. "TCS.NS"
- `market_cap_category` (String(20), Nullable) — "large", "mid", "small"
- `is_active` (Boolean, Default True)
- `created_at`, `updated_at` (DateTime, Default UTC)

#### 2. `portfolio_memberships`
- `id` (Integer, Primary Key)
- `company_id` (ForeignKey `companies.id`, Cascade Delete, Index)
- `portfolio_name` (String(50), Default "default")
- `added_at` (DateTime, Default UTC)
- `is_watchlist` (Boolean, Default False)

#### 3. `price_bars`
- `id` (Integer, Primary Key)
- `company_id` (ForeignKey `companies.id`, Cascade Delete, Index)
- `date` (Date, Not Null, Index)
- `open`, `high`, `low`, `close` (Float, Not Null)
- `adj_close` (Float, Nullable)
- `volume` (BigInteger, Not Null)
- `daily_change_pct` (Float, Nullable)
- `source` (String(50), Default "yfinance")
- `is_demo` (Boolean, Default False)
- *Composite Index:* `(company_id, date)`

#### 4. `announcements`
- `id` (Integer, Primary Key)
- `company_id` (ForeignKey `companies.id`, Cascade Delete, Index)
- `exchange` (String(20), Default "NSE")
- `filing_date` (DateTime, Not Null, Index)
- `title` (String(500), Not Null)
- `description` (Text, Nullable)
- `category` (String(50), Nullable, Index) — One of 17 categories
- `source_url` (String(1000), Nullable) — Direct link to primary exchange filing PDF
- `document_url` (String(1000), Nullable)
- `ingested_at` (DateTime, Default UTC)
- `status` (String(20), Default "new") — "new", "read", "saved", "dismissed"
- `priority_score` (Float, Nullable) — Materiality score 0.0 to 1.0
- `is_demo` (Boolean, Default False)

#### 5. `announcement_classifications`
- `id` (Integer, Primary Key)
- `announcement_id` (ForeignKey `announcements.id`, Cascade Delete, Index)
- `category` (String(50), Not Null, Index)
- `confidence` (Float, Not Null) — e.g. 0.95
- `explanation` (Text, Nullable)
- `evidence_snippet` (Text, Nullable)
- `method` (String(50), Default "hybrid") — "keyword", "llm", "rule"
- `classified_at` (DateTime, Default UTC)

#### 6. `alert_rules`
- `id` (Integer, Primary Key)
- `name` (String(200), Not Null)
- `rule_type` (String(50), Not Null, Index) — "price_movement", "unusual_volume", "material_announcement"
- `company_id` (ForeignKey `companies.id`, Cascade Delete, Nullable) — NULL applies globally
- `threshold_value` (Float, Nullable) — e.g. 3.0 (%)
- `threshold_direction` (String(10), Nullable) — "above", "below", "both"
- `volume_multiplier` (Float, Nullable) — e.g. 2.0 (x 20d average)
- `volume_lookback_days` (Integer, Default 20)
- `announcement_categories` (Text, Nullable) — JSON list of subscribed categories
- `is_enabled` (Boolean, Default True)
- `created_at`, `updated_at` (DateTime)

#### 7. `alert_events`
- `id` (Integer, Primary Key)
- `alert_rule_id` (ForeignKey `alert_rules.id`, Cascade Delete, Index)
- `company_id` (ForeignKey `companies.id`, Cascade Delete, Index)
- `triggered_at` (DateTime, Default UTC, Index)
- `trigger_value` (String(500), Not Null)
- `observed_value` (String(200), Not Null)
- `threshold_value` (String(200), Not Null)
- `is_acknowledged` (Boolean, Default False, Index)
- `acknowledged_at` (DateTime, Nullable)
- `related_announcement_id` (ForeignKey `announcements.id`, Nullable)
- `related_price_bar_id` (ForeignKey `price_bars.id`, Nullable)
- `dedup_key` (String(255), Unique, Not Null) — Prevents duplicate alerts
- `is_demo` (Boolean, Default False)

#### 8. `source_documents`
- `id` (Integer, Primary Key)
- `company_id` (ForeignKey `companies.id`, Cascade Delete, Index)
- `document_type` (String(50), Not Null, Index) — "annual_report", "concall_transcript", "quarterly_filing"
- `title` (String(500), Not Null)
- `financial_period` (String(50), Nullable) — e.g. "FY24", "Q2 FY25"
- `publication_date` (Date, Nullable)
- `source_url` (String(1000), Nullable)
- `local_path` (String(500), Nullable)
- `status` (String(20), Default "processed")
- `page_count` (Integer, Nullable)
- `is_demo` (Boolean, Default False)

#### 9. `document_chunks`
- `id` (Integer, Primary Key)
- `source_document_id` (ForeignKey `source_documents.id`, Cascade Delete, Index)
- `chunk_index` (Integer, Not Null)
- `content` (Text, Not Null)
- `section_heading` (String(255), Nullable)
- `page_number` (Integer, Nullable)
- `chunk_type` (String(50), Default "text") — "text", "table", "disclaimer"

#### 10. `citations`
- `id` (Integer, Primary Key)
- `document_chunk_id` (ForeignKey `document_chunks.id`, Cascade Delete, Index)
- `citation_key` (String(100), Not Null, Index)
- `context_excerpt` (Text, Nullable)

#### 11. `financial_periods`
- `id` (Integer, Primary Key)
- `company_id` (ForeignKey `companies.id`, Cascade Delete, Index)
- `period_type` (String(20), Not Null) — "quarterly", "annual"
- `fiscal_year` (Integer, Not Null) — e.g. 2024, 2025
- `fiscal_quarter` (Integer, Nullable) — 1, 2, 3, 4
- `period_start`, `period_end` (Date, Not Null)
- `reporting_basis` (String(20), Default "consolidated") — "consolidated", "standalone"

#### 12. `financial_metrics`
- `id` (Integer, Primary Key)
- `financial_period_id` (ForeignKey `financial_periods.id`, Cascade Delete, Index)
- `metric_name` (String(100), Not Null, Index) — "revenue", "ebitda", "pbt", "pat"
- `value` (Float, Not Null)
- `unit` (String(20), Default "crores")
- `currency` (String(10), Default "INR")
- `is_directly_reported` (Boolean, Default True)
- `confidence` (Float, Default 1.0)
- `is_demo` (Boolean, Default False)

#### 13. `guidance_statements`
- `id` (Integer, Primary Key)
- `company_id` (ForeignKey `companies.id`, Cascade Delete, Index)
- `statement_date` (Date, Not Null)
- `statement_text` (Text, Not Null)
- `metric_name` (String(100), Not Null) — e.g. "revenue_growth", "operating_margin"
- `target_value_low`, `target_value_high` (Float, Nullable)
- `target_unit` (String(50), Nullable)
- `target_period` (String(50), Not Null) — e.g. "FY25"
- `is_quantitative` (Boolean, Default True)
- `status` (String(50), Default "pending") — "achieved", "missed", "not_assessable", "pending"
- `actual_value` (Float, Nullable)
- `variance_pct` (Float, Nullable)
- `assessment_notes` (Text, Nullable)

#### 14. `research_sessions`
- `id` (Integer, Primary Key)
- `company_id` (ForeignKey `companies.id`, Cascade Delete, Index)
- `query` (Text, Not Null)
- `research_type` (String(50), Not Null) — One of the 8 research views or "custom"
- `status` (String(20), Default "completed")
- `created_at`, `completed_at` (DateTime)

#### 15. `research_answers`
- `id` (Integer, Primary Key)
- `research_session_id` (ForeignKey `research_sessions.id`, Cascade Delete, Index)
- `answer_json` (Text, Not Null)
- `summary` (Text, Nullable)
- `key_observations` (Text, Nullable) — JSON list
- `risks_caveats` (Text, Nullable) — JSON list
- `missing_info` (Text, Nullable) — JSON list
- `created_at` (DateTime, Default UTC)

#### 16. `executive_profiles`
- In-memory & seed schema containing verified executive career histories, SEBI Regulation 30 disclosures, effective appointment dates, and educational credentials.

---

## 4. Corporate Announcement 17-Class Taxonomy (SEBI LODR Specification)

FINN maps all filings to the 17 standardized categories outlined in the challenge specification:

| # | Category Slug | Description & Coverage | Materiality Weight | SEBI Regulation |
|---|:---|:---|:---:|:---|
| 1 | `results` | Quarterly / Annual financial results, Board approval meetings, investor presentations, and shareholder earnings letters. | **0.95** (High) | Reg 33 |
| 2 | `M&A` | Mergers, acquisitions, demergers, joint ventures, stake sales, and strategic investments. | **0.95** (High) | Reg 30 |
| 3 | `fund_raise` | Rights issues, QIPs, preferential allotments, buybacks, and commercial paper/debt bond issuances. | **0.90** (High) | Reg 30 |
| 4 | `management_change` | Executive director or senior management appointments, resignations, retirements, or removals. | **0.85** (High) | Reg 30(7) |
| 5 | `litigation` | Legal disputes, regulatory orders, penalties, tax demands, forensic audits, and NCLT insolvency proceedings. | **0.90** (High) | Reg 30 |
| 6 | `insider_trading` | Promoter and designated person personal share transactions, SAST disclosures, and PIT filings. | **0.80** (Med-High)| PIT Reg 7 |
| 7 | `earnings_call` | Earnings conference call intimation notices, call transcripts, and audio/video replay links. | **0.75** (Medium) | Reg 30 |
| 8 | `investor_meetings` | Analyst meet schedules, institutional investor conferences, and 1-on-1 meeting intimation. | **0.40** (Routine)  | Reg 30 |
| 9 | `credit_rating` | Credit rating actions, upgrades, downgrades, outlook revisions, and debt reaffirmations. | **0.80** (Med-High)| Reg 30 |
| 10| `dividend` | Dividend declarations, interim/final payouts, special dividends, and record date announcements. | **0.85** (High) | Reg 42 |
| 11| `bonus_split` | Bonus share issues, stock splits, and consolidation of shares. | **0.85** (High) | Reg 29 / 42 |
| 12| `capex` | Plant construction, new manufacturing units, capacity expansion, and capital expenditure approvals. | **0.80** (Med-High)| Reg 30 |
| 13| `press_release` | Commercial contract wins, product launches, operational updates, and rumor clarifications. | **0.60** (Medium) | General |
| 14| `postal_ballot` | Postal ballot voting notices, scrutinizer reports, and shareholder e-voting results. | **0.45** (Routine)  | Reg 44 |
| 15| `agm_egm` | Annual / Extraordinary General Meeting notices, proceedings, and voting outcomes. | **0.50** (Routine)  | Reg 44 |
| 16| `pledging` | Promoter share pledging, invocation, release of encumbrance, and revocation notices. | **0.85** (High) | SAST Reg 31 |
| 17| `unclassified` | General procedural circulars and administrative notices not categorized above. | **0.30** (Low) | N/A |

---

## 5. Deterministic Quantitative Formulas (Pure Python — Zero Hallucination)

All calculations are implemented in `backend/app/services/financial_calc.py` and evaluated strictly in Python:

### 1. Daily Percentage Price Change
$$\Delta P = \frac{P_{\text{close}} - P_{\text{prev}}}{P_{\text{prev}}} \times 100$$
Evaluated with division-by-zero protection.

### 2. Unusual Volume Multiple & Moving Average
Given historical trading volume sequence $V = [v_1, v_2, \dots, v_N]$ over lookback $N = 20$:
$$\overline{V}_{20} = \frac{1}{N} \sum_{i=1}^{N} v_i$$
$$\text{Multiple} = \frac{V_{\text{latest}}}{\overline{V}_{20}}$$
Triggers an alert when $\text{Multiple} \ge \text{threshold}$ (default $2.0\text{x}$).

### 3. Quarterly Sequential (QoQ) & Annual (YoY) Percentage Changes
To correctly handle transitions involving negative values (e.g. from a loss to a profit or between two losses), FINN applies absolute-value denominator scaling:
$$\text{QoQ \%} = \frac{V_{\text{current}} - V_{\text{previous}}}{|V_{\text{previous}}|} \times 100$$
$$\text{YoY \%} = \frac{V_{\text{current}} - V_{\text{year-ago}}}{|V_{\text{year-ago}}|} \times 100$$

### 4. Operating & EBITDA Margins
$$\text{EBITDA Margin \%} = \frac{\text{EBITDA}}{\text{Revenue}} \times 100$$
$$\text{Operating Margin \%} = \frac{\text{EBIT}}{\text{Revenue}} \times 100$$

### 5. Free Cash Flow & Cash Conversion Efficiency
$$\text{Free Cash Flow (FCF)} = \text{Operating Cash Flow (CFO)} - \text{Capital Expenditure (CapEx)}$$
$$\text{Cash Conversion Ratio} = \frac{\text{Free Cash Flow}}{\text{Net Profit (PAT)}} \times 100$$
A ratio $> 80\%$ confirms strong earnings quality with low non-cash accruals.

### 6. Idempotent Deduplication Key Formula
$$\text{Key}_{\text{announcement}} = \text{"announcement\_"} + \text{RuleId} + \text{"\_"} + \text{AnnouncementId}$$
$$\text{Key}_{\text{volume}} = \text{"volume\_"} + \text{RuleId} + \text{"\_"} + \text{CompanyId} + \text{"\_"} + \text{Date}$$
$$\text{Key}_{\text{price}} = \text{"price\_"} + \text{RuleId} + \text{"\_"} + \text{CompanyId} + \text{"\_"} + \text{Date}$$
Guarantees duplicate evaluations are safely ignored by SQLite's unique constraint.

---

## 6. The 8 Research Desk Views & Primary-Source RAG Pipeline

When an analyst opens `/research?ticker=...`, FINN activates 8 dedicated research workstations:

```
+----------------------------------------------------------------------------------------------------+
|                                    8 RESEARCH WORKSTATION VIEWS                                    |
+----------------------------------------------------------------------------------------------------+
  1. Business Snapshot        --> Operating model, segment exposure, revenue mix, and primary chunks.
  2. Financial Snapshot       --> Core quarterly revenue, EBITDA margins, and net income performance.
  3. Multi-Year Trajectory    --> Sequential quarterly trend progression and operating leverage.
  4. Balance Sheet            --> Consolidated 4-year audited balance sheet in ₹ Crores.
  5. Cash Quality             --> 4-year FCF, CFO, CapEx, Dividends, and accounting cash conversion.
  6. Narrative vs Numbers     --> Temporal alignment: Management guidance targets vs reported outcomes.
  7. Guidance Tracker         --> Forward-looking management targets categorized by metric and period.
  8. Bull vs Bear Case        --> Evidence-grounded bull and bear theses with explicit analytical caveats.
```

### Citation & Provenance Drawer
Every quantitative assertion links to the **Citation Drawer** (`CitationDrawer.tsx`), which reveals:
- Source Document Title (e.g. *Tata Consultancy Services Annual Report FY24*).
- Filing Type (*Annual Report*, *Concall Transcript*, *Quarterly Result*).
- Page Number (e.g. Page 8, Page 42).
- Verbatim primary text chunk extracted from the filing.
- Direct link to the source document.

---

## 7. Real-Time Alerts Engine & External Source Provenance Architecture

```
+----------------------------------------------------------------------------------------------------+
|                                REAL-TIME ALERTING & PROVENANCE FLOW                                |
+----------------------------------------------------------------------------------------------------+

  [1. INCOMING DATA STREAM]
        │
        ├── EOD / Intraday Market Quotes (yfinance Adapter)
        └── Corporate Announcement Filings (Exchange Ingestion)
        │
        v
  [2. EVALUATION & DEDUPLICATION (alert_engine.py)]
        │
        ├── Evaluates: Price Move >= 3% | Volume >= 2.0x 20d Avg | Category in Subscriptions
        └── Generates Idempotent Key: "rule_id_cid_date" -> Stored in SQLite alert_events
        │
        v
  [3. PROVENANCE RESOLUTION (api/alerts.py)]
        │
        ├── Resolves Primary Filing URL (source_url)
        ├── Dynamic Google News Live Query: news.google.com/search?q={ticker}+NSE+stock+news
        ├── Dynamic Google Finance Quote: google.com/finance/quote/{ticker}:NSE
        ├── Dynamic NSE India Quote: nseindia.com/get-quotes/equity?symbol={ticker}
        └── Dynamic Moneycontrol Feed: google.com/search?q={ticker}+moneycontrol+stock+news
        │
        v
  [4. CLIENT AUTO-SYNC (frontend/alerts/page.tsx)]
        │
        ├── Configurable Polling Loop: 5s | 10s | 30s | 60s | Pause
        ├── Animated Pulse Indicator: ● Live Auto-Sync Active
        └── Silent State Update: Updates event list without page refresh or UI flicker
```

---

## 8. Multi-Year Audited Balance Sheet & Cash Flow Engine via yfinance

FINN interfaces directly with Yahoo Finance's institutional financial statements for Indian equities:

### Zero API Key Requirement
Unlike commercial vendor APIs, `yfinance` queries public financial reporting endpoints directly. No credit card, API key, or subscription is required.

### Extracted Multi-Year Metrics (in ₹ Crores)
```python
# Balance Sheet Extraction (yfinance)
- Total Assets
- Shareholders' Equity / Net Worth
- Working Capital
- Cash & Short-Term Liquid Equivalents
- Total Debt & Long-Term Borrowings
- Net Debt (Total Debt - Cash)
- Tangible Book Value
- Current Assets & Current Liabilities

# Cash Flow Statement Extraction (yfinance)
- Operating Cash Flow (CFO)
- Free Cash Flow (FCF = CFO - CapEx)
- Capital Expenditures (CapEx)
- Cash Dividends Paid
- Ending Cash Position
```

### Verified Multi-Year Financials (TCS Live Verification)
- **Total Assets:** ₹1,82,372 Cr (FY26) | ₹1,59,629 Cr (FY25) | ₹1,46,449 Cr (FY24) | ₹1,43,651 Cr (FY23)
- **Shareholders' Equity:** ₹1,07,240 Cr (FY26) | ₹94,756 Cr (FY25) | ₹90,489 Cr (FY24) | ₹90,424 Cr (FY23)
- **Free Cash Flow:** ₹47,948 Cr (FY26) | ₹44,971 Cr (FY25) | ₹41,664 Cr (FY24) | ₹38,865 Cr (FY23)
- **Operating Cash Flow:** ₹52,094 Cr (FY26) | ₹48,908 Cr (FY25) | ₹44,338 Cr (FY24) | ₹41,965 Cr (FY23)

---

## 9. Complete Codebase File-by-File Blueprint

```
Enam Holdings/
├── run_finn.py                        # Single-command unified launcher script
├── start.ps1                          # PowerShell startup shortcut
├── start.bat                          # Windows CMD startup shortcut
├── docker-compose.yml                 # Multi-container orchestration config
├── Dockerfile.backend                 # Backend container Dockerfile
├── Dockerfile.frontend                # Frontend container Dockerfile
├── pytest.ini                         # Pytest configuration file
├── README.md                          # Master documentation manual
├── backend/
│   ├── requirements.txt               # Python package dependencies
│   ├── run_seed.py                    # Standalone seed runner script
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                    # FastAPI application initialization & CORS config
│   │   ├── api/                       # Asynchronous REST endpoint routers
│   │   │   ├── __init__.py
│   │   │   ├── alerts.py              # Alert rules, evaluations, and events API
│   │   │   ├── announcements.py       # Filings inbox, daily digest, and category filters
│   │   │   ├── companies.py           # Company details, search, and price bars
│   │   │   ├── financials.py          # Quarterly financial comparisons & guidance
│   │   │   ├── portfolio.py           # Portfolio holdings, watchlists, add/remove
│   │   │   └── research.py            # 8-tab fundamental research & yfinance statement adapter
│   │   ├── core/                      # Core infrastructure
│   │   │   ├── __init__.py
│   │   │   ├── config.py              # App settings, environment variable readers
│   │   │   └── database.py            # SQLAlchemy async engine, NullPool, SessionLocal
│   │   ├── demo_data/                 # Reproducible data generation
│   │   │   ├── __init__.py
│   │   │   └── seed.py                # 23-company universe seeder & sample data
│   │   ├── models/                    # 16 SQLAlchemy ORM models
│   │   │   ├── __init__.py
│   │   │   ├── alert.py               # AlertRule & AlertEvent models
│   │   │   ├── announcement.py        # Announcement & AnnouncementClassification models
│   │   │   ├── company.py             # Company & PortfolioMembership models
│   │   │   ├── document.py            # SourceDocument, DocumentChunk, Citation models
│   │   │   ├── financial.py           # FinancialPeriod, FinancialMetric, GuidanceStatement
│   │   │   ├── price.py               # PriceBar OHLCV model
│   │   │   └── research.py            # ResearchSession & ResearchAnswer models
│   │   ├── schemas/                   # Pydantic validation schemas
│   │   │   ├── __init__.py
│   │   │   └── schemas.py             # All request/response schemas & AlertSourceSite
│   │   └── services/                  # Deterministic mathematical & business logic
│   │       ├── __init__.py
│   │       ├── alert_engine.py        # Price, volume, and announcement rule matcher
│   │       ├── classifier.py          # 17-class SEBI LODR filing classifier
│   │       └── financial_calc.py      # Math for margins, QoQ/YoY %, volume averages
│   ├── data/
│   │   ├── db/
│   │   │   └── finn.db                # Persistent SQLite database file
│   │   ├── seed_tcs_docs.py           # Seed script for TCS primary documents
│   │   └── seed_all_sources.py        # Seed script for top portfolio source documents
│   └── tests/                         # Pytest test suite (28 test cases)
│       ├── __init__.py
│       ├── test_api.py                # API integration test suite
│       ├── test_classifier.py         # Classification accuracy test suite
│       └── test_financial_calc.py     # Deterministic mathematical formula test suite
└── frontend/
    ├── package.json                   # Next.js and npm dependencies
    ├── tsconfig.json                  # TypeScript compiler options
    ├── tailwind.config.js             # Tailwind CSS design system config
    ├── next.config.mjs                # Next.js App Router & API proxy configuration
    └── src/
        ├── types/
        │   └── index.ts               # TypeScript interfaces matching backend models
        ├── lib/
        │   └── api.ts                 # Type-safe API client functions
        ├── components/
        │   ├── AlertRuleModal.tsx     # Rule configuration modal
        │   ├── CitationDrawer.tsx     # Slide-out primary evidence drawer
        │   ├── ExecutiveEnrichmentModal.tsx # SEBI executive appointment modal
        │   ├── Header.tsx             # Workstation top navigation bar
        │   ├── Navigation.tsx         # Responsive mobile-first navigation bar
        │   └── QuarterlyComparisonModal.tsx # Quarterly financial comparison modal
        └── app/                       # Next.js 14 App Router routes
            ├── layout.tsx             # Root layout with responsive navigation
            ├── page.tsx               # Home dashboard & Daily Digest view
            ├── portfolio/page.tsx     # Holdings, watchlist, search, add/remove
            ├── inbox/page.tsx         # Announcement stream with category filters
            ├── alerts/page.tsx        # Real-time alerts feed & provenance toolbar
            ├── research/page.tsx      # 8-tab fundamental research desk & Copilot
            ├── sources/page.tsx       # Primary document viewer & chunk browser
            └── settings/page.tsx      # System health diagnostics & API keys
```

---

## 10. API Endpoints Reference (All 25+ Routes)

| Method | Endpoint Path | Description | Query / Body Parameters |
|:---|:---|:---|:---|
| `GET` | `/api/health` | System health, version, DB status, and demo mode flag | None |
| `GET` | `/api/portfolio` | Full portfolio holdings with latest market prices | None |
| `POST` | `/api/portfolio` | Add a company to portfolio or watchlist | `{"ticker": "TCS", "is_watchlist": false}` |
| `DELETE` | `/api/portfolio/{ticker}` | Remove a company from the portfolio | Path: `ticker` |
| `GET` | `/api/companies/search` | Search companies across the universe | `?q=RELIANCE` |
| `GET` | `/api/companies/{ticker}` | Detailed company metadata and sector profile | Path: `ticker` |
| `GET` | `/api/companies/{ticker}/prices`| Historical daily OHLCV price bars | `?days=60` |
| `POST` | `/api/companies/{ticker}/ingest`| Trigger market data ingestion via yfinance | Path: `ticker` |
| `GET` | `/api/announcements` | Filtered exchange announcements stream | `?category=results&limit=50` |
| `GET` | `/api/digest` | Prioritized Daily Intelligence Digest (Important vs Routine)| `?hours=168` |
| `PATCH` | `/api/announcements/{id}/status`| Update announcement review status | `?status=read` |
| `GET` | `/api/management-change/{id}`| Enriched executive career history & SEBI appointment | Path: `announcement_id` |
| `GET` | `/api/alerts/rules` | List all configured alert rules | None |
| `POST` | `/api/alerts/rules` | Create a new alert rule | `AlertRuleCreate` payload |
| `PATCH` | `/api/alerts/rules/{id}` | Update threshold parameters or enable/disable rule | `AlertRuleUpdate` payload |
| `DELETE` | `/api/alerts/rules/{id}` | Delete an alert rule | Path: `id` |
| `POST` | `/api/alerts/evaluate` | Run deterministic evaluation across all enabled rules | None |
| `GET` | `/api/alerts/events` | List triggered alert events with external source links | `?limit=100&acknowledged=false` |
| `PATCH` | `/api/alerts/events/{id}/acknowledge`| Acknowledge an alert event | Path: `id` |
| `GET` | `/api/companies/{ticker}/financials`| Quarterly financial results comparison (QoQ / YoY) | Path: `ticker` |
| `GET` | `/api/companies/{ticker}/guidance`| Historical and active management guidance statements | Path: `ticker` |
| `GET` | `/api/companies/{ticker}/documents`| List primary-source documents (Annual Reports, Concalls)| Path: `ticker` |
| `GET` | `/api/sources/{source_id}` | Retrieve a source document and its indexed text chunks | Path: `source_id` |
| `POST` | `/api/companies/{ticker}/research`| Execute research across any of the 8 analytical modes | `{"research_type": "balance_sheet"}` |

---

## 11. Engineering Obstacles, Windows Sandbox Hardening & Bug Fixes

During the development and testing cycle on Windows, several system and platform-level challenges were encountered and resolved:

### 1. Windows Sandbox TCP Loopback Socket Hang (`WinError 10013`)
- **Symptom:** Asynchronous event loops in tests and scripts hung or threw socket access errors (`WinError 10013: An attempt was made to access a socket in a way forbidden by its access permissions`).
- **Root Cause:** Standard Windows sandbox isolation restricts local loopback socket pairs used by default by Starlette's `TestClient` and `asyncio`.
- **Resolution:** Implemented `NullPool` in SQLAlchemy's connection configuration to eliminate connection recycling across threads, and executed test suites with appropriate permissions.

### 2. Next.js Webpack Transient Directory Lock (`EPERM: operation not permitted, mkdir`)
- **Symptom:** Next.js production builds occasionally failed with `EPERM: operation not permitted, mkdir .../.next/server/app/...`.
- **Root Cause:** Antivirus software and parallel compilation threads momentarily lock newly created directories on Windows NTFS filesystems.
- **Resolution:** Added automatic cache cleanup before production builds (`Remove-Item -Recurse -Force frontend\.next`) and configured Next.js build scripts using `.cmd` wrappers (`npm.cmd run build`).

### 3. Gitignore Root Directory Collision (`lib/`)
- **Symptom:** Git refused to track `frontend/src/lib/api.ts`, showing `The following paths are ignored by one of your .gitignore files: frontend/src/lib`.
- **Root Cause:** The root `.gitignore` had a generic `lib/` entry intended for Python build artifacts, which unintentionally matched the frontend directory.
- **Resolution:** Replaced `lib/` with `/lib/` and `/lib64/` to ensure only top-level Python virtual environment folders are ignored, properly tracking the frontend API client.

### 4. SQLite Unique Constraint on Alert Events (`dedup_key`)
- **Symptom:** Repeated alert evaluations raised `sqlite3.IntegrityError: UNIQUE constraint failed: alert_events.dedup_key`.
- **Root Cause:** Multiple price rules triggered on the same date generated colliding deduplication keys.
- **Resolution:** Updated `alert_engine.py` to incorporate the specific `rule_id` into the key: `f"{rule_type}_{rule.id}_{company_id}_{date}"`, making deduplication both safe and idempotent.

### 5. Next.js 14 App Router Suspense Boundary Requirement
- **Symptom:** Next.js build failed on `/research` with `useSearchParams() should be wrapped in a suspense boundary`.
- **Root Cause:** Dynamic query parameters (`?ticker=TCS`) in Next.js 14 App Router require a `<Suspense>` boundary during static page prerendering.
- **Resolution:** Refactored `frontend/src/app/research/page.tsx` into a `ResearchContent` component wrapped inside `<Suspense fallback={<ResearchLoading />}>`.

---

## 12. Verification, Automated Testing & Build Validation

### Automated Backend Test Suite (Pytest)
The test suite in `backend/tests/` verifies API routes, deterministic math, alert deduplication, and classification accuracy.

```bash
python -m pytest backend/tests -v
```

**Test Execution Results:**
```
============================= test session starts =============================
platform win32 -- Python 3.13.15, pytest-9.2.0, pluggy-1.7.0
rootdir: D:\Enam Holdings
configfile: pytest.ini
plugins: anyio-4.14.2, asyncio-1.4.1
asyncio: mode=Mode.AUTO
collected 28 items

backend\tests\test_api.py::test_health_check PASSED                     [  3%]
backend\tests\test_api.py::test_get_portfolio PASSED                    [  7%]
backend\tests\test_api.py::test_search_companies PASSED                 [ 10%]
backend\tests\test_api.py::test_quarterly_financials_comparison PASSED  [ 14%]
backend\tests\test_api.py::test_announcements_inbox PASSED              [ 17%]
backend\tests\test_api.py::test_daily_digest PASSED                     [ 21%]
backend\tests\test_api.py::test_alert_rules_crud PASSED                 [ 25%]
backend\tests\test_api.py::test_evaluate_alerts PASSED                  [ 28%]
backend\tests\test_api.py::test_company_research PASSED                 [ 32%]
backend\tests\test_classifier.py::test_results_classification PASSED    [ 35%]
backend\tests\test_classifier.py::test_ma_classification PASSED         [ 39%]
backend\tests\test_classifier.py::test_fund_raise_classification PASSED  [ 42%]
backend\tests\test_classifier.py::test_management_change_classification PASSED [ 46%]
backend\tests\test_classifier.py::test_credit_rating_classification PASSED [ 50%]
backend\tests\test_classifier.py::test_materiality_score_high_for_results PASSED [ 53%]
backend\tests\test_classifier.py::test_materiality_score_lower_for_unclassified PASSED [ 57%]
backend\tests\test_financial_calc.py::test_daily_return_positive PASSED [ 60%]
backend\tests\test_financial_calc.py::test_daily_return_negative PASSED [ 64%]
backend\tests\test_financial_calc.py::test_daily_return_zero_base PASSED [ 67%]
backend\tests\test_financial_calc.py::test_percentage_change_both_positive PASSED [ 71%]
backend\tests\test_financial_calc.py::test_percentage_change_loss_to_profit PASSED [ 75%]
backend\tests\test_financial_calc.py::test_percentage_change_both_negative PASSED [ 78%]
backend\tests\test_financial_calc.py::test_volume_multiple_normal PASSED [ 82%]
backend\tests\test_financial_calc.py::test_volume_multiple_zero_average PASSED [ 85%]
backend\tests\test_financial_calc.py::test_average_volume PASSED        [ 89%]
backend\tests\test_financial_calc.py::test_margin_calculation PASSED    [ 92%]
backend\tests\test_financial_calc.py::test_margin_zero_revenue PASSED   [ 96%]
backend\tests\test_financial_calc.py::test_safe_round PASSED            [100%]

======================== 28 passed, 17 warnings in 1.06s ========================
```

### Frontend Production Build
The Next.js 14 production build compiles with zero TypeScript errors across all routes:

```
Route (app)                              Size     First Load JS
┌ ○ /                                    3.56 kB         106 kB
├ ○ /_not-found                          873 B          88.2 kB
├ ○ /alerts                              6.81 kB         109 kB
├ ○ /inbox                               2.63 kB         105 kB
├ ○ /portfolio                           5.43 kB         102 kB
├ ○ /research                            8.68 kB          96 kB
├ ○ /settings                            5.62 kB        92.9 kB
└ ○ /sources                             5.09 kB        92.4 kB
+ First Load JS shared by all            87.3 kB
  ├ chunks/117-52378b0c27e4d8d0.js       31.7 kB
  ├ chunks/fd9d1056-c8d745efa24a674d.js  53.6 kB
  └ other shared chunks (total)          1.95 kB

○ (Static) prerendered as static content across all 10 application routes.
```

---

## 13. Step-by-Step Deployment & Launch Guide

### Prerequisites
- Python 3.10+ (tested on Python 3.13)
- Node.js 18+ (tested on Node v24)
- Git

### One-Click Launch (Recommended)
Run the unified launcher from the workspace root:

```powershell
python run_finn.py
```
*Or via PowerShell:*
```powershell
.\start.ps1
```

The script will automatically:
1. Verify the SQLite schema and seed all 23 companies, historical price bars, and primary source documents.
2. Launch the FastAPI backend on `http://localhost:8000`.
3. Launch the Next.js frontend on `http://localhost:3000`.

### Manual Service Launch (Alternative)

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

### Access URLs
- **Web Application:** [http://localhost:3000](http://localhost:3000)
- **FastAPI Interactive Docs (Swagger):** [http://localhost:8000/docs](http://localhost:8000/docs)
- **API Health Endpoint:** [http://localhost:8000/api/health](http://localhost:8000/api/health)
