"""Tests for real fundamentals and document-grounded research. Nothing here touches the network."""
from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.core import config
from app.main import app
from app.services import documents as docs
from app.services import filing_ai, fundamentals, research_engine, screener


def table(periods, rows, raw_pdfs=None):
    return {"periods": periods, "rows": rows, "raw_pdfs": raw_pdfs or []}


QUARTERS = ["Sep 2025", "Dec 2025", "Mar 2026", "Jun 2026", "Sep 2026"]
YEARS = ["Mar 2021", "Mar 2022", "Mar 2023", "Mar 2024", "Mar 2025", "Mar 2026", "TTM"]

COMPANY = {
    "symbol": "ACME", "basis": "consolidated", "url": "https://www.screener.in/company/ACME/consolidated/",
    "about": "Acme makes widgets.",
    "top_ratios": {"Market Cap": 5000.0, "Stock P/E": 20.0, "ROCE": 18.0, "ROE": 15.0},
    "annual_reports": [
        {"title": "Annual Report 2025", "year": 2025, "url": "https://x/ar25.pdf"},
        {"title": "Annual Report 2026", "year": 2026, "url": "https://x/ar26.pdf"},
    ],
    "concalls": [
        {"label": "Oct 2026", "date": "2026-10-01", "transcript_url": None, "presentation_url": "https://x/p.pdf"},
        {"label": "Jul 2026", "date": "2026-07-01", "transcript_url": "https://x/t1.pdf", "presentation_url": None},
        {"label": "Apr 2026", "date": "2026-04-01", "transcript_url": "https://x/t2.pdf", "presentation_url": None},
    ],
    "tables": {
        "quarters": table(QUARTERS, {
            "Sales": [100.0, 110.0, 120.0, 125.0, 130.0],
            "Operating Profit": [20.0, 22.0, 24.0, 25.0, 26.0],
            "OPM %": [20.0, 20.0, 20.0, 20.0, 20.0],
            "Interest": [1.0, 1.0, 1.0, 1.0, 1.0],
            "Profit before tax": [15.0, 16.0, 18.0, 19.0, 20.0],
            "Net Profit": [10.0, 11.0, 13.0, 14.0, 15.0],
        }, ["u", None, None, None, "https://www.screener.in/company/source/quarter/1/9/2026/"]),
        "annual": table(YEARS, {
            "Sales": [200.0, 250.0, 300.0, 340.0, 400.0, 480.0, 500.0],
            "Operating Profit": [40.0, 50.0, 60.0, 60.0, 70.0, 90.0, 95.0],
            "Interest": [2.0, 2.0, 3.0, 3.0, 4.0, 5.0, 5.0],
            "Profit before tax": [30.0, 40.0, 50.0, 50.0, 60.0, 80.0, 82.0],
            "Net Profit": [20.0, 30.0, 40.0, 40.0, 45.0, 60.0, 62.0],
        }),
        "balance": table(["Mar 2024", "Mar 2025", "Mar 2026", "Sep 2026"], {
            "Equity Capital": [10.0, 10.0, 10.0, 10.0],
            "Reserves": [90.0, 110.0, 140.0, 150.0],
            "Borrowings": [50.0, 60.0, 80.0, 80.0],
            "Other Liabilities": [20.0, 20.0, 20.0, 20.0],
            "Total Assets": [170.0, 200.0, 250.0, 260.0],
            "Fixed Assets": [60.0, 70.0, 80.0, 85.0],
            "CWIP": [5.0, 5.0, 5.0, 5.0],
            "Investments": [5.0, 5.0, 5.0, 5.0],
            "Other Assets": [100.0, 120.0, 160.0, 165.0],
        }),
        "cash": table(["Mar 2021", "Mar 2022", "Mar 2023", "Mar 2024", "Mar 2025", "Mar 2026"], {
            "Cash from Operating Activity": [18.0, 28.0, 38.0, 42.0, 40.0, 60.0],
            "Cash from Investing Activity": [-5.0, -5.0, -5.0, -5.0, -5.0, -5.0],
            "Cash from Financing Activity": [-5.0, -5.0, -5.0, -5.0, -5.0, -5.0],
            "Net Cash Flow": [8.0, 18.0, 28.0, 32.0, 30.0, 50.0],
            "Free Cash Flow": [10.0, 20.0, -5.0, 30.0, 30.0, 45.0],
        }),
        "ratios": table(["Mar 2023", "Mar 2024", "Mar 2025", "Mar 2026"], {
            "Debtor Days": [40.0, 42.0, 45.0, 50.0],
            "Cash Conversion Cycle": [60.0, 62.0, 66.0, 75.0],
            "ROCE %": [20.0, 19.0, 18.0, 17.0],
        }),
    },
}

BANK = {
    **COMPANY,
    "tables": {
        **COMPANY["tables"],
        "quarters": table(QUARTERS, {
            "Revenue": [100.0, 110.0, 120.0, 125.0, 130.0],
            "Financing Profit": [-5.0, -6.0, -7.0, -4.0, -5.0],
            "Financing Margin %": [-5.0, -5.0, -6.0, -3.0, -4.0],
            "Profit before tax": [30.0, 31.0, 32.0, 33.0, 34.0],
            "Net Profit": [20.0, 21.0, 22.0, 23.0, 24.0],
        }),
        "annual": table(YEARS, {
            "Revenue": [200.0, 250.0, 300.0, 340.0, 400.0, 480.0, 500.0],
            "Financing Profit": [10.0, 5.0, 2.0, -5.0, -20.0, -30.0, -32.0],
            "Profit before tax": [30.0, 40.0, 50.0, 50.0, 60.0, 80.0, 82.0],
            "Net Profit": [20.0, 30.0, 40.0, 40.0, 45.0, 60.0, 62.0],
        }),
    },
}


# ---------- Screener page parsing ----------

PAGE = """
<div class="company-profile"><div class="about">Makes widgets.</div></div>
<ul id="top-ratios"><li><span class="name"> Market Cap </span><span class="number">9,05,137</span></li>
<li><span class="name">ROCE</span><span class="number">63.0</span></li></ul>
<section id="quarters"><table><thead><tr><th></th><th>Jun 2026</th><th>Sep 2026</th></tr></thead><tbody>
<tr><td>Sales&nbsp;+</td><td>1,000</td><td>1,100</td></tr>
<tr><td>OPM %</td><td>20%</td><td></td></tr>
<tr><td>Raw PDF</td><td><a href="/company/source/quarter/1/6/2026/">x</a></td><td></td></tr>
</tbody></table></section>
<section id="documents">
<div class="annual-reports"><a href="https://b/ar.pdf">Financial Year 2026 from bse</a></div>
<div class="concalls"><ul>
<li><div>Oct 2026</div><a href="https://b/t.pdf">Transcript</a><button>AI Summary</button><a href="https://b/p.pdf">PPT</a></li>
<li><div>Jul 2026</div><a href="https://b/p2.pdf">PPT</a></li>
</ul></div></section>
"""


def test_parse_page_reads_tables_ratios_and_documents():
    parsed = screener.parse_page(PAGE)
    assert parsed["about"] == "Makes widgets."
    assert parsed["top_ratios"]["Market Cap"] == 905137.0
    quarters = parsed["tables"]["quarters"]
    assert quarters["periods"] == ["Jun 2026", "Sep 2026"]
    assert quarters["rows"]["Sales"] == [1000.0, 1100.0]
    assert quarters["rows"]["OPM %"] == [20.0, None]
    assert quarters["raw_pdfs"][0] == "https://www.screener.in/company/source/quarter/1/6/2026/"
    assert parsed["annual_reports"][0]["year"] == 2026
    assert parsed["concalls"][0]["transcript_url"] == "https://b/t.pdf"
    assert parsed["concalls"][0]["date"] == "2026-10-01"
    assert parsed["concalls"][1]["transcript_url"] is None


def test_parse_page_copes_with_missing_sections():
    parsed = screener.parse_page("<html></html>")
    assert parsed["tables"]["annual"]["rows"] == {}
    assert parsed["concalls"] == []


# ---------- Calculations ----------

def test_quarterly_comparison_uses_the_right_quarters():
    result = fundamentals.quarterly_comparison(COMPANY, "ACME", "Acme")
    assert (result["current_period"], result["previous_period"], result["year_ago_period"]) == ("Sep 2026", "Jun 2026", "Sep 2025")
    revenue = result["metrics"][0]
    assert revenue["qoq_pct"] == pytest.approx(4.0)
    assert revenue["yoy_pct"] == pytest.approx(30.0)
    assert [m["metric"] for m in result["metrics"]] == ["REVENUE", "EBITDA", "PBT", "PAT"]
    assert result["ebitda_margin_current"] == pytest.approx(20.0)
    assert result["is_demo"] is False


def test_bank_reports_financing_profit_not_ebitda():
    result = fundamentals.quarterly_comparison(BANK, "BANK", "Bank")
    assert result["metrics"][1]["metric"] == "Financing Profit"
    assert "financing profit" in result["ebitda_note"]


def test_bank_trajectory_has_no_meaningless_margin_signal():
    trend = fundamentals.trajectory(BANK)
    assert not any("Margin moved" in s["text"] for s in trend["signals"])
    assert not any(row["metric"] == "EBITDA" for row in trend["growth"])


def test_trajectory_growth_and_signals():
    trend = fundamentals.trajectory(COMPANY)
    assert [row["period"] for row in trend["trajectory"]][-1] == "Mar 2026"  # TTM isn't a full year.
    revenue = next(row for row in trend["growth"] if row["metric"] == "Revenue")
    assert revenue["cagr_3y"] == pytest.approx(((480 / 300) ** (1 / 3) - 1) * 100, abs=0.1)
    assert revenue["cagr_10y"] is None  # Only six years of data.
    assert any("ROCE moved -3.0" in s["text"] for s in trend["signals"])


def test_cagr_refuses_a_loss_at_either_end():
    assert fundamentals._cagr([-5.0, 1.0, 2.0, 10.0], 3) is None
    assert fundamentals._cagr([5.0, 1.0, 2.0, -10.0], 3) is None


def test_balance_sheet_ratios_line_up_by_year():
    sheet = fundamentals.balance_sheet(COMPANY)
    assert sheet["years"][0] == "Sep 2026"  # Newest first.
    debt_equity = next(r for r in sheet["ratio_table"] if r["metric"] == "Debt / equity")["values"]
    assert debt_equity[1] == pytest.approx(0.53)  # Mar 2026: 80 / 150
    debt_ebitda = next(r for r in sheet["ratio_table"] if r["metric"] == "Debt / EBITDA")["values"]
    assert debt_ebitda[0] is None  # The half-year column has no annual EBITDA to compare with.
    assert debt_ebitda[1] == pytest.approx(0.89)  # 80 / 90
    assert any("lengthened from 60 to 75" in o for o in sheet["observations"])


def test_cash_quality_verdicts():
    good = fundamentals.cash_quality(COMPANY)
    assert good["verdict"]["level"] == "strong"
    assert good["cumulative"]["conversion_pct"] == round((28 + 38 + 42 + 40 + 60) / (30 + 40 + 40 + 45 + 60) * 100)
    weak = {**COMPANY, "tables": {**COMPANY["tables"], "cash": table(
        ["Mar 2024", "Mar 2025", "Mar 2026"], {"Cash from Operating Activity": [10.0, 10.0, 10.0]},
    )}}
    assert fundamentals.cash_quality(weak)["verdict"]["level"] == "weak"
    assert fundamentals.cash_quality(BANK)["verdict"]["level"] == "not_applicable"


def test_negative_growth_reads_as_shrinking():
    shrinking = {**COMPANY, "tables": {**COMPANY["tables"], "annual": table(YEARS, {
        "Sales": [500.0, 480.0, 460.0, 440.0, 420.0, 400.0, 390.0],
        "Net Profit": [20.0, 30.0, 40.0, 40.0, 45.0, 60.0, 62.0],
        "Operating Profit": [40.0, 50.0, 60.0, 60.0, 70.0, 90.0, 95.0],
    })}}
    claims = [p["claim"] for p in fundamentals.numbers_only_bull_bear(shrinking)["bear_case"]]
    assert any(c.startswith("Revenue shrank") for c in claims)
    assert not any("grew -" in c for c in claims)


# ---------- Documents and search ----------

def test_wanted_documents_takes_newest_report_and_uses_presentations_when_a_call_has_no_transcript():
    wanted = docs.wanted_documents(COMPANY)
    assert [w["url"] for w in wanted] == ["https://x/ar26.pdf", "https://x/p.pdf", "https://x/t1.pdf", "https://x/t2.pdf"]
    assert wanted[1]["type"] == "investor_presentation"
    wanted = [w for w in wanted if w["type"] != "investor_presentation"]
    assert wanted[0]["period"] == "FY26"
    assert wanted[1]["date"] == date(2026, 7, 1)


class FakeDocument:
    def __init__(self, id, pages, kind="concall_transcript", title="Call", period="Jul 2026"):
        self.id, self.document_type, self.title, self.financial_period = id, kind, title, period
        self.status, self.source_url = "processed", f"https://x/{id}.pdf"
        docs._page_cache[id] = pages


def test_search_ranks_relevant_pages_and_names_them():
    document = FakeDocument(9001, [
        "Our cafeteria menu changed this year and people liked the lunch options very much indeed.",
        "Operating margin guidance for next year remains in the 20 to 22 percent band, management said on the call.",
        "We also opened an office in a new city during the year and hired more staff for it there.",
    ])
    results = docs.search([document], "margin guidance")
    assert results[0]["page"] == 2
    assert results[0]["url"] == "https://x/9001.pdf#page=2"


def test_search_filters_by_type_and_ignores_empty_queries():
    document = FakeDocument(9002, ["Annual report text about revenue from operations and other things here."], kind="annual_report")
    assert docs.search([document], "revenue", types=("concall_transcript",)) == []
    assert docs.search([document], "the and of") == []


def test_quote_check_tolerates_line_breaks_but_not_invention():
    pages = ["Intro.\nWe expect margins to\nimprove to 22% next year, said the CFO."]
    assert docs.quote_is_real("We expect margins to improve to 22% next year", pages) == 1
    assert docs.quote_is_real("We expect margins to improve to 25% next year", pages) is None
    assert docs.quote_is_real("short", pages) is None


def test_guidance_sentences_need_a_number_and_forward_language():
    document = FakeDocument(9003, [
        "We expect revenue growth of 12% in the next fiscal year based on the current order book. "
        "Last year was a good year for all of our employees and the wider company in general. "
        "Our headcount was 5,000 at the end of the quarter and it has stayed flat for a while."
    ])
    found = docs.guidance_sentences([document])
    assert len(found) == 1
    assert "12%" in found[0]["quote"]


# ---------- Checking the model's answers ----------

def test_sources_can_only_be_ones_that_were_supplied():
    _, labelled = research_engine.format_sources([
        {"title": "AR", "type": "annual_report", "period": "FY26", "page": 3, "text": "abc", "url": "u"},
    ])
    assert research_engine.resolve_source("S1", labelled)["page"] == 3
    assert research_engine.resolve_source("[S1]", labelled)["page"] == 3
    assert research_engine.resolve_source("S9", labelled) is None
    assert research_engine.resolve_source("numbers", labelled) is None


def test_invented_number_is_flagged():
    known = filing_ai.source_numbers("Revenue 1,000 crore")
    assert research_engine.checked("Revenue was 1,000 crore", known)["numbers_matched"] is True
    flagged = research_engine.checked("Revenue was 7,777 crore", known)
    assert flagged["numbers_matched"] is False
    assert flagged["unmatched"] == ["7,777"]


# ---------- Through the API ----------

@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def acme(monkeypatch):
    monkeypatch.setattr(screener, "get_company_data", lambda ticker, yahoo=None: COMPANY)
    monkeypatch.setattr(config, "LLM_API_KEY", "")


@pytest.mark.parametrize("view,key", [
    ("financial_snapshot", "latest_quarter"), ("trajectory", "growth"),
    ("balance_sheet", "table"), ("cash_quality", "verdict"),
])
def test_numeric_views_work_with_no_key(client, acme, view, key):
    data = client.post("/api/companies/TCS/research", json={"research_type": view}).json()
    assert data["data"][key]
    assert data["data"]["source"] == fundamentals.SOURCE_NOTE


@pytest.mark.parametrize("view", ["business_snapshot", "narrative_vs_numbers", "guidance", "bull_bear"])
def test_document_views_never_fabricate_with_no_key_or_documents(client, acme, view):
    res = client.post("/api/companies/TCS/research", json={"research_type": view})
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["ai_enabled"] is False
    assert not data.get("analysis")
    assert not data.get("items")


def test_financials_endpoint_prefers_real_numbers(client, acme):
    data = client.get("/api/companies/TCS/financials").json()
    assert data["current_period"] == "Sep 2026"
    assert data["is_demo"] is False


def test_financials_falls_back_to_labelled_sample_when_screener_is_down(client, monkeypatch):
    def down(*_):
        raise screener.LiveDataUnavailable("timed out")

    monkeypatch.setattr(screener, "get_company_data", down)
    assert client.get("/api/companies/INFY/financials").json()["is_demo"] is True


def test_seeded_documents_are_hidden_unless_asked_for(client):
    assert all(not d["is_demo"] for d in client.get("/api/companies/INFY/documents").json()["documents"])
    assert any(d["is_demo"] for d in client.get("/api/companies/INFY/documents?include_demo=true").json()["documents"])
