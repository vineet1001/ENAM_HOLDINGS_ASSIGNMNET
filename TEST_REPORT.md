# FINN Automated Test Execution Report

**Date of Execution:** 2026-10-28  
**Environment:** Python 3.13.15, pytest-9.2.0, pytest-asyncio-1.4.1, Windows AMD64  
**Test Suite Path:** `backend/tests/`

---

## 1. Summary of Test Results

| Test Module | Total Tests | Passed | Failed | Execution Time |
|---|---|---|---|---|
| `test_financial_calc.py` | 12 | 12 | 0 | 0.05s |
| `test_classifier.py` | 7 | 7 | 0 | 0.04s |
| `test_api.py` | 9 | 9 | 0 | 0.88s |
| **Total** | **28** | **28** | **0** | **0.97s** |

---

## 2. Detailed Test Cases Executed

### A. Deterministic Financial Math (`test_financial_calc.py`)
* `test_pct_change_positive`: Verifies +20.0% return calculation on positive numbers. [PASSED]
* `test_pct_change_negative`: Verifies -20.0% decline calculation. [PASSED]
* `test_pct_change_zero_denominator`: Ensures zero denominator returns `None` rather than raising `ZeroDivisionError`. [PASSED]
* `test_pct_change_none_values`: Verifies safe handling of missing `None` inputs. [PASSED]
* `test_pct_change_negative_base`: Verifies loss-to-profit transition: `((50 - (-100)) / |-100|) * 100 = 150%`. [PASSED]
* `test_margin`: Confirms EBITDA margin = `(EBITDA / Revenue) * 100` and validates zero revenue guard. [PASSED]
* `test_volume_multiple`: Validates volume spike multiple relative to historical average. [PASSED]
* `test_free_cash_flow`: Verifies `Operating Cash Flow - Capex` with positive and negative input representations. [PASSED]
* `test_debt_to_equity`: Validates debt-to-equity ratio calculation. [PASSED]
* `test_cash_conversion`: Validates accounting profit to operating cash conversion ratio. [PASSED]
* `test_net_debt`: Validates total debt net of cash and cash equivalents. [PASSED]
* `test_safe_round`: Verifies rounding precision and `None` propagation. [PASSED]

### B. Announcement Classification & Materiality (`test_classifier.py`)
* `test_classify_results`: Keyword detection for quarterly and board meeting result announcements. [PASSED]
* `test_classify_merger_acquisition`: Regex detection for acquisitions and corporate restructuring (`M&A`). [PASSED]
* `test_classify_management_change`: Detection of executive and CFO appointments. [PASSED]
* `test_classify_dividend`: Detection of dividend declarations and record date filings. [PASSED]
* `test_classify_unclassified`: Correct fallback categorization for routine administrative notices. [PASSED]
* `test_materiality_score_high_for_results`: Verifies high priority weight (>0.70) assigned to quarterly results. [PASSED]
* `test_materiality_score_lower_for_unclassified`: Verifies lower score (<0.40) and bounded recency decay. [PASSED]

### C. End-to-End API Integration (`test_api.py`)
* `test_health_check`: Validates `/api/health` diagnostics, demo flag, and database connection. [PASSED]
* `test_get_portfolio`: Verifies retrieval of all 18 portfolio companies with latest prices and sectors. [PASSED]
* `test_search_companies`: Verifies company search by ticker and name with portfolio membership status. [PASSED]
* `test_quarterly_financials_comparison`: Verifies Revenue, EBITDA, PBT, and PAT extraction with QoQ % and YoY % tables. [PASSED]
* `test_announcements_inbox`: Verifies announcement feed with pagination and filters. [PASSED]
* `test_daily_digest`: Verifies generation of prioritized daily digest with important vs routine segregation. [PASSED]
* `test_alert_rules_and_evaluation`: Verifies alert rule creation, execution, and deduplication logic. [PASSED]
* `test_management_change_enrichment`: Verifies verified professional biography enrichment for executive appointments. [PASSED]
* `test_company_research`: Verifies pull-side research engine with narrative-vs-numbers guidance tracking and citations. [PASSED]

---

## 3. Frontend Verification

* **Command:** `npm.cmd run build`
* **Output:** Compiled successfully with Next.js 14.2.35.
* **Routes Validated:**
  * `/` (Static pre-rendered)
  * `/portfolio` (Static pre-rendered)
  * `/inbox` (Static pre-rendered)
  * `/alerts` (Static pre-rendered)
  * `/research` (Static pre-rendered with Suspense boundary)
  * `/sources` (Static pre-rendered)
  * `/settings` (Static pre-rendered)
* **TypeScript & Linting:** 0 errors.
