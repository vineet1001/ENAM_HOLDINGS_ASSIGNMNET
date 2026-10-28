# Submission Covering Note & Review Checklist

**To:** assessment@enam.com  
**Subject:** ENAM - IIT screening - 2027  
**Candidate:** AI Engineer Evaluation  
**Product:** FINN — Institutional Financial Investment Intelligence Agent  

---

## 1. Executive Summary

FINN is a full-stack, mobile-first intelligence layer built for public-market equity investment teams. It reconciles high-volume exchange filings, market price action, and corporate earnings disclosures into actionable primary intelligence.

The application is implemented in the workspace as a runnable, end-to-end system:
* **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind CSS + Lucide Icons.
* **Backend:** Python 3.13 + FastAPI + SQLAlchemy 2.0 + SQLite (with clean path to PostgreSQL).
* **Storage:** 16 relational models storing companies, prices, filings, alert rules, financial periods, facts, and primary citations.
* **Determinism:** 100% pure Python arithmetic for all margins, QoQ/YoY changes, volume multiples, and alert triggers.

---

## 2. Core Workflows Implemented & Verified

| Workflow | Challenge Requirement | Implementation Details |
|---|---|---|
| **Workflow 1: Daily Intelligence** | Home screen portfolio surveillance & digest | Prioritized announcement digest across 24h, 3d, 7d windows; transparent materiality scoring ($0.50 \times \text{Category} + 0.20 \times \text{Conf} + 0.30 \times \text{Recency}$); collapsed routine announcements. |
| **Workflow 2: Quarterly Results** | P&L comparison table with QoQ & YoY | Revenue, EBITDA, PBT, PAT extracted and displayed alongside immediately preceding quarter and year-ago quarter; EBITDA margin calculated; consistent consolidated vs standalone basis enforced. |
| **Workflow 3: Triggered Alerts** | Configurable rules & deduplicated events | Supports Type A (price moves >3%), Type B (volume spikes >2x 20-day average), and Type C (filing category subscriptions); manual "Evaluate alerts" action; deduplication keys prevent re-triggering. |
| **Workflow 4: Management Change** | Executive transition enrichment | Incoming/outgoing executive detection; verified professional background cards detailing career history, prior roles, credentials, and source links. |
| **Workflow 5: Company Research** | On-demand pull workbench for any ticker | Supports all 18 portfolio stocks + 5 ad-hoc research tickers (`ADANIPORTS`, `TRENT`, `BEL`, `DMART`, `ZOMATO`); 8 specialized analytical views. |
| **Workflow 6: Narrative vs Numbers** | Guidance vs delivery tracking | Structured table comparing management promises against subsequently reported outcomes over matching quarters (`achieved`, `missed`, `exceeded`, `not_assessable`). |
| **Workflow 7: Mobile Experience** | Responsive viewport usability | Restrained financial UI; compact tables; bottom navigation bar for mobile one-thumb interaction; desktop sidebar. |
| **Workflow 8: Resilience** | Graceful degradation without API keys | Fully demonstrable and runnable offline with synthetic demo dataset; transparent offline and stale data labels; zero reliance on paid vector databases. |

---

## 3. Important Architectural Decisions & Trade-Offs

1. **Deterministic Calculations vs LLM Arithmetic:**
   * In financial analysis, numeric hallucination is unacceptable. All financial ratios, percentage calculations (including negative denominator cases), and alert thresholds are executed in deterministic Python.
2. **Primary-Source Discipline:**
   * Pull-side investment research is strictly restricted to primary company disclosures (Annual Reports, Quarterly Filings, and Concall Transcripts). Secondary broker notes, financial blogs, and ungrounded model knowledge are excluded.
3. **Zero Paid Vector DB Requirement:**
   * A structured SQLite storage schema manages document chunks, section headings, and page boundaries, delivering rapid keyword and metadata-filtered retrieval without requiring cloud vector databases.
4. **Transparent Data Availability:**
   * When market data or primary documents are absent, the system displays an explicit missing/stale status rather than fabricating estimates.

---

## 4. What Was Deliberately Excluded (Scope Discipline)

* **Stock Price Predictions / Target Prices:** FINN does not attempt to predict future stock prices or generate speculative investment buy/sell calls.
* **Complex Multi-Agent Framework Overhead:** Instead of heavyweight third-party multi-agent wrappers (e.g., AutoGen, CrewAI), FINN uses a clean modular architecture with direct service boundaries.

---

## 5. What Would Be Built Next

1. **Automated PDF Tabular Parsing with OCR:** Enhancing the ingestion engine with table-transformer models for complex scanned Indian statutory filing formats.
2. **PostgreSQL + pgvector Migration:** Transitioning from SQLite to PostgreSQL with vector indexing for hybrid lexical-semantic semantic search across 10-year annual report archives.
3. **Direct Exchange Webhooks:** Connecting to real-time SEBI/NSE feed APIs for sub-minute announcement processing.

---

## 6. Pre-Submission Verification Checklist

- [x] Backend database initialized and seeded with 23 companies (18 demo portfolio + 5 research universe).
- [x] All 28 automated tests passing (`python -m pytest backend/tests -v`).
- [x] Frontend successfully built (`npm run build` completed with 0 errors).
- [x] Single-command runner created (`python run_finn.py` / `start.bat`).
- [x] Docker Compose and Dockerfiles created and verified.
- [x] No committed API keys or secrets in repository.
- [x] README.md, DEPLOYMENT.md, ARCHITECTURE.md, and TEST_REPORT.md finalized.
