"""Price scenarios, portfolio optimisation, OCR, quote matching and the other limitation fixes. No network."""
import io
import math
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient
from pypdf import PdfWriter

from app.main import app
from app.services import documents as docs
from app.services import filing_ai, live_data, ocr, portfolio_optimizer, price_scenarios, screener


def random_walk(volatility=0.3, days=1500, seed=1, drift=0.0, start=100.0):
    rng = np.random.default_rng(seed)
    steps = rng.normal(drift / 252, volatility / math.sqrt(252), days)
    index = pd.bdate_range(end=datetime(2026, 10, 30), periods=days)
    return pd.Series(start * np.exp(np.cumsum(steps)), index=index)


# ---------- Volatility ----------

def test_volatility_is_recovered_from_prices():
    assert price_scenarios.annual_volatility(random_walk(0.3)) == pytest.approx(0.3, abs=0.04)


def test_range_is_symmetric_in_percentage_terms():
    low, high = price_scenarios.price_range(100, 0.3, 63, 1.0)
    assert math.log(high / 100) == pytest.approx(-math.log(low / 100))
    assert high > 100 > low


def test_backtest_finds_ranges_held_about_as_often_as_promised():
    held = price_scenarios.backtest_ranges(random_walk(0.25, 2500), 21)
    assert 55 <= held["inside_68"] <= 80
    assert 88 <= held["inside_95"] <= 99


def test_short_history_has_no_backtest():
    assert price_scenarios.backtest_ranges(random_walk(days=300), 63) is None


# ---------- Moving averages and momentum ----------

def test_rsi_reads_overbought_and_oversold():
    rising = pd.Series(np.linspace(100, 200, 100))
    falling = pd.Series(np.linspace(200, 100, 100))
    assert price_scenarios.rsi(rising).iloc[-1] > 95
    assert price_scenarios.rsi(falling).iloc[-1] < 5


def test_golden_cross_is_found_with_its_date():
    index = pd.bdate_range(end=datetime(2026, 10, 30), periods=400)
    values = np.concatenate([np.linspace(200, 100, 250), np.linspace(100, 220, 150)])
    view = price_scenarios.technicals(pd.Series(values, index=index))
    cross = [s for s in view["signals"] if "crossed above" in s["text"]]
    assert cross and "golden" in cross[0]["text"]
    assert len(view["series"]) == price_scenarios.CHART_SESSIONS


# ---------- P/E band ----------

def annual_table(eps, periods):
    return {"tables": {
        "annual": {"periods": periods, "rows": {"EPS in Rs": eps, "Sales": [1.0] * len(eps)}, "raw_pdfs": []},
        "quarters": {"periods": [], "rows": {}, "raw_pdfs": []},
        "balance": {"periods": [], "rows": {}, "raw_pdfs": []},
        "cash": {"periods": [], "rows": {}, "raw_pdfs": []},
        "ratios": {"periods": [], "rows": {}, "raw_pdfs": []},
    }, "top_ratios": {}}


def flat_prices(value=200.0):
    return pd.Series(value, index=pd.bdate_range("2018-01-01", "2026-10-30"))


def test_pe_band_uses_year_end_prices_and_trailing_earnings():
    data = annual_table([10, 8, 10, 20, 25, 20], ["Mar 2022", "Mar 2023", "Mar 2024", "Mar 2025", "Mar 2026", "TTM"])
    band = price_scenarios.pe_band(data, flat_prices())
    assert band["available"]
    assert band["low"]["pe"] == 8.0 and band["high"]["pe"] == 25.0
    assert band["median"]["price"] == pytest.approx(band["median"]["pe"] * 20)
    assert band["current_pe"] == 10.0


def test_pe_band_drops_a_year_distorted_by_an_unadjusted_split():
    data = annual_table([10, 10, 10, 1, 10, 10], ["Mar 2022", "Mar 2023", "Mar 2024", "Mar 2025", "Mar 2026", "TTM"])
    band = price_scenarios.pe_band(data, flat_prices())
    assert band["dropped"] == ["Mar 2025"]


def test_pe_band_is_withheld_for_a_loss_maker():
    data = annual_table([10, 10, 10, -5], ["Mar 2024", "Mar 2025", "Mar 2026", "TTM"])
    assert not price_scenarios.pe_band(data, flat_prices())["available"]


# ---------- Reverse DCF ----------

def test_reverse_dcf_recovers_the_growth_it_was_built_with():
    value = price_scenarios.dcf_value(100, 0.08, 0.12, 0.05)
    assert price_scenarios.implied_growth(value, 100, 0.12, 0.05)["growth"] == pytest.approx(8.0, abs=0.1)


def test_reverse_dcf_says_when_growth_is_off_the_scale():
    assert price_scenarios.implied_growth(1e12, 100, 0.12, 0.05) == {"growth": None, "bound": "above"}


def test_reverse_dcf_needs_positive_cash_flow():
    data = annual_table([1, 1, 1], ["Mar 2024", "Mar 2025", "Mar 2026"])
    data["top_ratios"] = {"Market Cap": 1000.0}
    data["tables"]["cash"] = {"periods": ["Mar 2024", "Mar 2025", "Mar 2026"], "rows": {"Free Cash Flow": [-5.0, -3.0, 1.0]}, "raw_pdfs": []}
    assert not price_scenarios.reverse_dcf(data)["available"]


# ---------- Portfolio optimisation ----------

def test_weights_are_projected_inside_the_cap():
    weights = portfolio_optimizer.project_capped_simplex(np.array([5.0, 1.0, 0.2, -3.0]), 0.4)
    assert weights.sum() == pytest.approx(1.0)
    assert weights.max() <= 0.4 + 1e-9 and weights.min() >= 0


def two_stocks(seed=3):
    calm = random_walk(0.15, 1000, seed=seed, drift=0.10)
    wild = random_walk(0.45, 1000, seed=seed + 1, drift=0.10)
    return pd.DataFrame({"CALM": calm, "WILD": wild})


def test_lowest_risk_leans_on_the_calmer_stock():
    result = portfolio_optimizer.optimise(two_stocks(), "min_variance", 1.0, 0.065)
    weights = result["suggested"]["weights"]
    assert weights["CALM"] > 80
    assert sum(weights.values()) == pytest.approx(100.0)


def test_cap_is_respected():
    result = portfolio_optimizer.optimise(two_stocks(), "min_variance", 0.6, 0.065)
    assert max(result["suggested"]["weights"].values()) <= 60.0 + 0.1


def test_max_sharpe_beats_equal_weights_on_its_own_measure():
    result = portfolio_optimizer.optimise(two_stocks(), "max_sharpe", 1.0, 0.065, {"CALM": 50, "WILD": 50})
    assert result["suggested"]["sharpe"] >= result["equal"]["sharpe"] - 1e-6
    assert result["current"]["risk_pct"] == result["equal"]["risk_pct"]


def test_too_little_history_is_refused():
    with pytest.raises(portfolio_optimizer.OptimisationError):
        portfolio_optimizer.optimise(two_stocks().tail(100), "max_sharpe", 1.0, 0.065)


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


def test_optimise_endpoint_leaves_out_a_recent_listing(client, monkeypatch):
    frame = pd.DataFrame({
        "TCS.NS": random_walk(0.2, 1200, seed=5, drift=0.1),
        "INFY.NS": random_walk(0.3, 1200, seed=6, drift=0.1),
    })
    recent = random_walk(0.3, 1200, seed=7)
    recent.iloc[:900] = np.nan
    frame["ANDHRAPET.BO"] = recent
    monkeypatch.setattr(live_data, "get_history", lambda symbols: (frame, 1.0, False))
    res = client.post("/api/portfolios/optimise", json={
        "holdings": [{"ticker": "TCS", "weight": 50}, {"ticker": "INFY", "weight": 30}, {"ticker": "ANDHRAPET", "weight": 20}],
        "objective": "min_variance", "max_weight": 100,
    })
    assert res.status_code == 200, res.text
    body = res.json()
    assert set(body["suggested"]["weights"]) == {"TCS", "INFY"}
    assert body["left_out"][0]["ticker"] == "ANDHRAPET"


def test_price_scenarios_view_works_without_reported_numbers(client, monkeypatch):
    frame = pd.DataFrame({"TCS.NS": random_walk(0.25, 1200, seed=8)})
    monkeypatch.setattr(live_data, "get_history", lambda symbols: (frame, 1.0, False))
    res = client.post("/api/companies/TCS/research", json={"research_type": "price_scenarios"}).json()
    assert res["data"]["available"]
    assert [r["horizon"] for r in res["data"]["volatility"]["ranges"]] == ["1M", "3M", "1Y"]
    assert not res["data"]["pe_band"]["available"]
    assert "a day" in res["summary"]


# ---------- OCR ----------

def blank_pdf(pages=1):
    writer = PdfWriter()
    for _ in range(pages):
        writer.add_blank_page(width=200, height=200)
    buffer = io.BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


def test_a_short_scan_is_read_by_ocr(monkeypatch):
    monkeypatch.setattr(ocr, "available", lambda: True)
    monkeypatch.setattr(ocr, "read_scanned_pdf", lambda data, max_pages: ["Revenue from operations 1,234 crore " * 10])
    pages, total, by_ocr = filing_ai.extract_pdf(blank_pdf())
    assert by_ocr and total == 1 and "1,234" in pages[0]


def test_a_long_scan_is_not_read_by_ocr(monkeypatch):
    monkeypatch.setattr(ocr, "available", lambda: True)
    with pytest.raises(filing_ai.DocumentUnreadable, match="too long to read by OCR"):
        filing_ai.extract_pdf(blank_pdf(ocr.MAX_OCR_PAGES + 1))


def test_word_boxes_become_lines_in_reading_order():
    boxes = [
        ([[300, 12], [400, 12], [400, 30], [300, 30]], "73,188", 0.9),
        ([[10, 10], [120, 10], [120, 30], [10, 30]], "Revenue", 0.9),
        ([[10, 50], [120, 50], [120, 70], [10, 70]], "Net profit", 0.9),
        ([[10, 90], [120, 90], [120, 110], [10, 110]], "smudge", 0.1),
    ]
    assert ocr.lines_from_boxes(boxes) == "Revenue 73,188\nNet profit"


# ---------- Results rows read from one line ----------

def test_results_row_figures_must_sit_together():
    pages = ["Revenue from operations 73,188 72,275 65,799\nNet profit 13,500 13,000 12,000\nOther 72,000"]
    known = filing_ai.source_numbers(pages[0])
    answer = {"periods": {"current": "a", "previous": "b", "year_ago": "c"}, "unit": "", "basis": "", "rows": [
        {"metric": "Revenue", "current": "73,188", "previous": "72,275", "year_ago": "65,799", "page": 1},
        {"metric": "PAT", "current": "13,500", "previous": "72,275", "year_ago": "65,799", "page": 1},
    ]}
    rows = {r["metric"]: r for r in filing_ai.build_results_table(answer, known, pages)["rows"]}
    assert rows["Revenue"]["printed_together"] is True
    assert rows["PAT"]["printed_together"] is False


# ---------- Quotes ----------

TRANSCRIPT = ["Thank you. So, we expect our EBITDA margin to be in the range of 21% to 23% for the full year, going forward. Next question."]


def test_a_lightly_tidied_quote_is_accepted_in_the_documents_own_words():
    page, words = docs.find_quote("We expect the EBITDA margin to be in the range of 21% to 23% for the full year going forward.", TRANSCRIPT)
    assert page == 1
    assert words.startswith("So, we expect")


def test_a_different_sentence_is_still_rejected():
    assert docs.find_quote("We expect our EBITDA margin to be in the range of 25% to 27% next year, and higher after.", TRANSCRIPT) is None


# ---------- Search ----------

def test_related_words_find_the_page_that_uses_them():
    class Doc:
        id, document_type, title, financial_period = 9301, "annual_report", "AR", "FY26"
        status, source_url = "processed", "https://x/9301.pdf"

    docs._page_cache[9301] = [
        "Our borrowings fell during the year as long-term loans were repaid out of operating cash flows.",
        "The company opened new stores across several cities and expanded its product range for customers.",
    ]
    found = docs.search([Doc()], "debt")
    assert found and found[0]["page"] == 1


# ---------- Stored prices after a split ----------

def test_restated_prices_do_not_raise_a_false_alert(client, monkeypatch):
    dates = pd.date_range(end=datetime.utcnow().date() + timedelta(days=400), periods=25, freq="D")
    monkeypatch.setattr(live_data, "get_filings", lambda holdings: ({"filings": [], "failed": []}, 1.0, False))
    volumes = lambda s: (pd.DataFrame({x: [100.0] * 25 for x in s}, index=dates), 1.0, False)  # noqa: E731
    monkeypatch.setattr(live_data, "get_volumes", volumes)

    # Before a 1:1 bonus, then Yahoo restates history at half the price, and today trades at that level.
    before = lambda s: (pd.DataFrame({x: [200.0] * 24 for x in s}, index=dates[:-1]), 1.0, False)  # noqa: E731
    after = lambda s: (pd.DataFrame({x: [100.0] * 25 for x in s}, index=dates), 1.0, False)  # noqa: E731
    monkeypatch.setattr(live_data, "get_closes", before)
    client.post("/api/alerts/sync")
    monkeypatch.setattr(live_data, "get_closes", after)
    client.post("/api/alerts/sync")
    events = client.get("/api/alerts/events?rule_type=price_movement&limit=200").json()["events"]
    assert not [e for e in events if str(dates[-1].date()) in e["observed_value"]]
