# FINN: System Architecture & Design Rationale

## 1. High-Level Architecture

FINN operates as a modular monolith organized into two distinct operational flows:
1. **Push Pipeline (Surveillance & Alerting):** Proactively ingests, classifies, filters, and notifies investors of material changes.
2. **Pull Pipeline (Primary-Source Research Desk):** Discovers, parses, extracts, and cites primary evidence on demand for any supported ticker.

```
       [ Investor Web / Mobile Workstation ]
                      │
           (Next.js 14 App Router)
                      │  REST / JSON
                      ▼
             [ FastAPI Backend ]
       ┌──────────────┴──────────────┐
       ▼                             ▼
[ Push Pipeline ]             [ Pull Pipeline ]
• MarketDataService           • DocumentDiscoveryService
• FilingClassifier            • Text Chunking & Indexing
• MaterialityRanker           • GuidanceTracker
• AlertEngine                 • NarrativeVsNumbersEngine
• ExecutiveEnricher           • Primary Citation Generator
       └──────────────┬──────────────┘
                      ▼
     [ Persistent Storage & Deterministic Math ]
     • 16 SQLAlchemy Models (SQLite / PostgreSQL)
     • Pure Python Financial Calculations
```

---

## 2. Core Service Components

### A. MarketDataService (`yfinance` Adapter)
* Retrieves daily Open, High, Low, Close, Adjusted Close, and Volume for NSE securities mapped with `.NS`.
* Computes daily percentage price movements and 20-day moving average volumes.
* Retains previously cached observations during rate limits or holidays, explicitly labeling data freshness rather than injecting fake prices.

### B. AnnouncementClassifier & MaterialityRanker (`classifier.py`)
* Implements a hybrid classification architecture supporting 17 standardized categories:
  `results`, `M&A`, `fund_raise`, `management_change`, `litigation`, `insider_trading`, `earnings_call`, `investor_meetings`, `credit_rating`, `dividend`, `bonus_split`, `capex`, `press_release`, `postal_ballot`, `agm_egm`, `pledging`, `unclassified`.
* Scores materiality transparently using a 3-part weighting equation:
  $$\text{Score} = (0.50 \times \text{Category Weight}) + (0.20 \times \text{Confidence}) + (0.30 \times \text{Recency Decay})$$
* Recency decay is bounded to ensure that historical high-impact items (e.g. M&A or Results) are never eclipsed simply because routine paperwork is more recent.

### C. AlertEngine (`alert_engine.py`)
* Evaluates price, volume, and announcement rules deterministically.
* Employs deterministic deduplication keys (`price_{rule_id}_{company_id}_{date}`, `volume_{rule_id}_{company_id}_{date}`, `announcement_{rule_id}_{ann_id}`) with unique constraints to ensure that repeated evaluation runs never trigger redundant notifications.

### D. FinancialMetricsService (`financial_calc.py`)
* Pure deterministic Python implementation.
* Standardized QoQ and YoY formulas with safeguards against zero or negative denominators:
  $$\text{Change \%} = \frac{\text{Current} - \text{Previous}}{|\text{Previous}|} \times 100$$
* Enforces consistency between consolidated and standalone accounting bases.

### E. Research Copilot & Guidance Tracker
* Aligns management guidance statements with reported financial outcomes over matching fiscal periods.
* Assigns verified statuses: `achieved`, `missed`, `exceeded`, or `not_assessable`.
* Attaches exact document citations and page references to every factual finding.

---

## 3. Database Schema Design (16 Entities)

* `companies`: NSE ticker, company name, sector, industry, Yahoo symbol, market cap tier.
* `portfolio_memberships`: Mapping of companies to user portfolios and watchlist flags.
* `price_bars`: EOD OHLCV observations with source and demo flags.
* `announcements`: Corporate filings metadata, original links, filing dates, priority scores.
* `announcement_classifications`: Category, confidence score, extraction method, evidence snippets.
* `alert_rules`: User-defined thresholds for price %, volume multiples, and filing categories.
* `alert_events`: Logged trigger events with observed vs threshold values and unique dedup keys.
* `financial_periods`: Fiscal year, quarter, start/end dates, reporting basis (consolidated/standalone).
* `financial_metrics`: Revenue, EBITDA, PBT, PAT, debt, cash, operating cash flow, capex.
* `guidance_statements`: Quantified forward promises extracted from concalls, target periods, and actual delivery.
* `source_documents`: Annual reports, quarterly filings, and concall transcripts.
* `document_chunks`: Indexed text passages, table rows, section headings, and page offsets.
* `extracted_facts`: Structured key-value facts with extraction confidence.
* `citations`: Direct links linking analytical claims to primary document passages.
* `research_sessions`: User research queries and workflow state.
* `research_answers`: Structured research syntheses, observations, caveats, and citations.

---

## 4. Key Architectural Trade-Offs

1. **Deterministic Code vs LLM for Financial Math:**
   * *Decision:* All arithmetic, margin calculations, and alert triggers are written in pure Python.
   * *Rationale:* LLMs frequently suffer from token arithmetic inaccuracies and rounding drift. In institutional finance, calculation correctness must be 100% reproducible.
2. **Self-Contained SQLite vs Vector DB Cluster:**
   * *Decision:* Used local structured SQLite storage with document chunks and section indexing.
   * *Rationale:* Ensures zero cost, immediate offline execution, reproducible seeding, and avoids complex external vector cluster dependencies during screening evaluation.
3. **Primary-Source Discipline:**
   * *Decision:* Secondary news articles, blog posts, and broker opinions are excluded from pull-mode analysis.
   * *Rationale:* Investment teams require defensible, auditable primary evidence directly from company disclosures.

