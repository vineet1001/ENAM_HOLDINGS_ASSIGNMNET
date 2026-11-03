"""Unit tests for live-data calculations and parsing. No test here touches the network."""
from datetime import datetime

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import live_data


def frame(rows, columns=("AAA", "BBB")):
    dates = pd.date_range("2026-01-01", periods=len(rows), freq="D")
    return pd.DataFrame(rows, index=dates, columns=list(columns), dtype=float)


def test_index_starts_at_100_and_averages_returns():
    index, excluded = live_data.build_portfolio_index(frame([[100, 50], [110, 50], [120, 75]]))
    assert index.iloc[0] == pytest.approx(100.0)
    assert index.iloc[1] == pytest.approx(105.0)  # +10% and flat
    assert index.iloc[2] == pytest.approx(135.0)  # +20% and +50%
    assert excluded == []


def test_index_is_not_skewed_by_share_price_level():
    # A ₹10,000 stock and a ₹10 stock must count equally.
    index, _ = live_data.build_portfolio_index(frame([[10000, 10], [10000, 20]]))
    assert index.iloc[1] == pytest.approx(150.0)


def test_index_excludes_holding_without_a_starting_price():
    index, excluded = live_data.build_portfolio_index(frame([[100, None], [110, 500]]))
    assert excluded == ["BBB"]
    assert index.iloc[1] == pytest.approx(110.0)


def test_index_carries_forward_a_missing_day():
    index, _ = live_data.build_portfolio_index(frame([[100, 100], [None, 120], [110, 120]]))
    assert index.iloc[1] == pytest.approx(110.0)


def test_weighted_index_follows_chosen_weights():
    # 75% in a stock that doubles and 25% in a flat one: 0.75*200 + 0.25*100.
    index, excluded = live_data.build_portfolio_index(frame([[100, 50], [200, 50]]), {"AAA": 75, "BBB": 25})
    assert index.iloc[0] == pytest.approx(100.0)
    assert index.iloc[1] == pytest.approx(175.0)
    assert excluded == []


def test_weighted_index_drifts_rather_than_rebalancing():
    # 50/50 start. AAA doubles, then both add 10%: 0.5*220 + 0.5*110, not a daily reset to 50/50.
    index, _ = live_data.build_portfolio_index(frame([[100, 100], [200, 100], [220, 110]]), {"AAA": 50, "BBB": 50})
    assert index.iloc[2] == pytest.approx(165.0)


def test_weighted_index_scales_up_when_a_holding_has_no_start_price():
    index, excluded = live_data.build_portfolio_index(
        frame([[100, 100, None], [110, 130, 500]], columns=("AAA", "BBB", "NEW")),
        {"AAA": 60, "BBB": 20, "NEW": 20},
    )
    assert excluded == ["NEW"]
    # AAA and BBB carry 60:20 of the remaining weight, so 0.75*110 + 0.25*130.
    assert index.iloc[1] == pytest.approx(115.0)


def test_universe_merges_dual_listings_by_isin():
    merged = live_data.merge_universe(
        [{"SYMBOL": "TCS", "NAME OF COMPANY": "TCS Limited", " ISIN NUMBER": "INE1"}],
        [
            {"SCRIP_CD": "532540", "scrip_id": "TCS", "Scrip_Name": "TCS Ltd", "ISIN_NUMBER": "INE1"},
            {"SCRIP_CD": "500012", "scrip_id": "ANDHRAPET", "Scrip_Name": "Andhra Petro", "ISIN_NUMBER": "INE2"},
        ],
    )
    assert len(merged) == 2
    dual = next(c for c in merged if c["ticker"] == "TCS")
    assert dual["exchanges"] == ["NSE", "BSE"]
    assert dual["yahoo_symbol"] == "TCS.NS"
    assert dual["bse_code"] == "532540"
    bse_only = next(c for c in merged if c["ticker"] == "ANDHRAPET")
    assert bse_only["exchanges"] == ["BSE"]
    assert bse_only["yahoo_symbol"] == "ANDHRAPET.BO"


def test_universe_gives_colliding_bse_symbol_its_numeric_code():
    merged = live_data.merge_universe(
        [{"SYMBOL": "ABC", "NAME OF COMPANY": "ABC Limited", " ISIN NUMBER": "INE1"}],
        [{"SCRIP_CD": "511111", "scrip_id": "ABC", "Scrip_Name": "Unrelated Ltd", "ISIN_NUMBER": "INE9"}],
    )
    other = next(c for c in merged if c["isin"] == "INE9")
    assert other["ticker"] == "511111"
    assert other["yahoo_symbol"] == "ABC.BO"


def test_universe_search_ranks_exact_symbol_first():
    assert live_data.search_universe("TCS")[0]["ticker"] == "TCS"
    assert live_data.search_universe("532540")[0]["ticker"] == "TCS"
    assert live_data.search_universe("andhra petro")[0]["ticker"] == "ANDHRAPET"
    assert live_data.search_universe("not a real company") == []


def test_yahoo_symbol_uses_stored_symbol_and_aliases():
    assert live_data.yahoo_symbol_for("TATAMOTORS", "TATAMOTORS.NS") == "TMPV.NS"
    assert live_data.yahoo_symbol_for("ANDHRAPET", "ANDHRAPET.BO") == "ANDHRAPET.BO"
    assert live_data.exchange_of("ANDHRAPET.BO") == "BSE"


def test_parse_bse_filing():
    row = {
        "NEWSID": "c37d335d-6a92-418d-a7ec-d1b4092ae322",
        "SCRIP_CD": 532540,
        "HEADLINE": "Press Release - New launch",
        "SUBCATNAME": "Press Release",
        "NEWS_DT": "2026-10-19T11:30:41.537",
        "ATTACHMENTNAME": "abc.pdf",
    }
    parsed = live_data.parse_bse_filing(row, "TCS", "TCS", datetime(2026, 10, 20))
    assert parsed["exchange"] == "BSE"
    assert parsed["category"] == "press_release"
    assert parsed["id"] < 2 ** 53
    assert parsed["pdf_url"].endswith("/AttachLive/abc.pdf")
    assert parsed["filed_at"] == "2026-10-19T11:30:41+05:30"


def test_clean_closes_drops_empty_session_and_empty_ticker():
    closes = frame([[100, 50, None], [101, 51, None], [None, None, None]], columns=("AAA", "BBB", "DEAD"))
    cleaned = live_data.clean_closes(closes)
    assert list(cleaned.columns) == ["AAA", "BBB"]
    assert len(cleaned) == 2


def test_slice_range_counts_back_from_latest_date():
    dates = pd.date_range("2026-01-01", periods=100, freq="D")
    closes = pd.DataFrame({"AAA": range(100)}, index=dates, dtype=float)
    assert live_data.slice_range(closes, "1M").index[0] == dates[-1] - pd.Timedelta(days=30)


def test_company_summary_changes():
    summary = live_data.company_summary(frame([[100, 0], [110, 0], [99, 0]])["AAA"])
    assert summary["latest_close"] == 99
    assert summary["daily_change_pct"] == -10.0
    assert summary["range_change_pct"] == -1.0


def test_company_summary_handles_no_prices():
    assert live_data.company_summary(frame([[None, 1]])["AAA"]) is None


def test_symbol_aliases_cover_renamed_listings():
    assert live_data.live_symbol("TATAMOTORS") == "TMPV"
    assert live_data.live_symbol("zomato") == "ETERNAL"
    assert live_data.live_symbol("TCS") == "TCS"


def test_nse_label_beats_keywords():
    assert live_data.classify_nse_filing("Change in Management", "Mr X ceases to be CFO")[0] == "management_change"
    assert live_data.classify_nse_filing("ESOP/ESOS/ESPS", "Allotment under results linked plan")[0] == "unclassified"


def test_vague_nse_label_falls_back_to_keywords():
    assert live_data.classify_nse_filing("Updates", "Unaudited financial results for the quarter")[0] == "results"


def test_investor_call_transcript_is_earnings_call():
    label = "Analysts/Institutional Investor Meet/Con. Call Updates"
    assert live_data.classify_nse_filing(label, "Transcript of the call")[0] == "earnings_call"
    assert live_data.classify_nse_filing(label, "Meeting with funds")[0] == "investor_meetings"


def test_auditor_appointment_is_routine():
    text = "Appointment of Statutory Auditors Pursuant to Mandatory Auditor Rotation"
    assert live_data.classify_nse_filing("General Updates", text)[0] == "unclassified"


def test_clean_filing_title_capitalises_raw_titles():
    assert live_data.clean_filing_title("change in Management", "") == "Change in Management"
    assert live_data.clean_filing_title("", "Updates") == "Updates"


NSE_ROW = {
    "seq_id": "106821698",
    "symbol": "TMPV",
    "desc": "Press Release",
    "sort_date": "2026-10-19 11:30:07",
    "attchmntText": "Tata Motors Limited has informed the Exchange regarding 'Press Release - New launch'.",
    "attchmntFile": "https://nsearchives.nseindia.com/corporate/x.pdf",
    "fileSize": "523.38 KB",
}


def test_parse_nse_filing():
    parsed = live_data.parse_nse_filing(NSE_ROW, "TATAMOTORS", "Tata Motors Ltd", datetime(2026, 10, 20))
    assert parsed["id"] == 106821698
    assert parsed["ticker"] == "TATAMOTORS"
    assert parsed["symbol"] == "TMPV"
    assert parsed["category"] == "press_release"
    assert parsed["title"].startswith("Press Release - New launch")
    assert parsed["filed_at"] == "2026-10-19T11:30:07+05:30"
    assert parsed["pdf_url"].endswith("x.pdf")


def test_parse_nse_filing_without_document():
    parsed = live_data.parse_nse_filing({**NSE_ROW, "attchmntFile": "-"}, "TCS", "TCS", datetime(2026, 10, 20))
    assert parsed["pdf_url"] is None


def test_parse_nse_filing_rejects_malformed_row():
    assert live_data.parse_nse_filing({"seq_id": "x"}, "TCS", "TCS", datetime(2026, 10, 20)) is None


def test_cache_serves_stale_copy_when_source_fails(monkeypatch):
    monkeypatch.setattr(live_data, "_cache", {})
    assert live_data._cached("key", lambda: "good") [0] == "good"
    entry = live_data._cache["key"]
    live_data._cache["key"] = (entry[0] - live_data.CACHE_TTL_SECONDS - 1, entry[1])

    def broken():
        raise RuntimeError("down")

    value, _, is_stale = live_data._cached("key", broken)
    assert value == "good"
    assert is_stale is True


def test_cache_raises_when_source_fails_with_nothing_cached(monkeypatch):
    monkeypatch.setattr(live_data, "_cache", {})

    def broken():
        raise RuntimeError("down")

    with pytest.raises(live_data.LiveDataUnavailable):
        live_data._cached("key", broken)


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


def fake_closes(symbols):
    dates = pd.date_range("2026-01-01", periods=5, freq="D")
    data = {s: [100.0, 101.0, 102.0, 103.0, 110.0] for s in symbols}
    return pd.DataFrame(data, index=dates), 1_800_000_000.0, False


def test_portfolio_history_endpoint(client, monkeypatch):
    monkeypatch.setattr(live_data, "get_closes", fake_closes)
    data = client.get("/api/live/portfolio-history?range=1M").json()
    assert data["view"] == "portfolio"
    assert data["unit"] == "INDEX"
    assert data["start_value"] == 100.0
    assert data["latest_value"] == 110.0
    assert data["change_pct"] == 10.0
    assert data["companies"]


def test_portfolio_history_single_company(client, monkeypatch):
    monkeypatch.setattr(live_data, "get_closes", fake_closes)
    data = client.get("/api/live/portfolio-history?range=1M&ticker=tcs").json()
    assert data["view"] == "company"
    assert data["ticker"] == "TCS"
    assert data["unit"] == "INR"
    assert data["latest_value"] == 110.0


def test_portfolio_history_rejects_company_outside_portfolio(client, monkeypatch):
    monkeypatch.setattr(live_data, "get_closes", fake_closes)
    assert client.get("/api/live/portfolio-history?ticker=NOTHELD").status_code == 404


def test_portfolio_history_rejects_unknown_range(client):
    assert client.get("/api/live/portfolio-history?range=5Y").status_code == 422


def valid_portfolio(name, **overrides):
    return {
        "name": name,
        "holdings": [{"ticker": "TCS", "weight": 75}, {"ticker": "INFY", "weight": 25}],
        **overrides,
    }


@pytest.fixture
def clean_portfolio(client):
    """Yield a portfolio name, then remove anything created and return to the mock portfolio."""
    name = "Pytest Portfolio"
    yield name
    for portfolio in client.get("/api/portfolios").json()["portfolios"]:
        if portfolio["name"].startswith(name):
            client.delete(f"/api/portfolios/{portfolio['id']}")
    client.put("/api/portfolios-active", json={"portfolio_id": None})


def test_weights_must_total_100(client, clean_portfolio):
    body = valid_portfolio(clean_portfolio, holdings=[{"ticker": "TCS", "weight": 60}, {"ticker": "INFY", "weight": 30}])
    res = client.post("/api/portfolios", json=body)
    assert res.status_code == 422
    assert "90.00%" in res.json()["detail"]


def test_portfolio_rejects_duplicates_bad_weights_and_unknown_companies(client, clean_portfolio):
    twice = [{"ticker": "TCS", "weight": 50}, {"ticker": "tcs", "weight": 50}]
    assert client.post("/api/portfolios", json=valid_portfolio(clean_portfolio, holdings=twice)).status_code == 422
    negative = [{"ticker": "TCS", "weight": 110}, {"ticker": "INFY", "weight": -10}]
    assert client.post("/api/portfolios", json=valid_portfolio(clean_portfolio, holdings=negative)).status_code == 422
    unknown = [{"ticker": "NOTLISTED", "weight": 100}]
    assert client.post("/api/portfolios", json=valid_portfolio(clean_portfolio, holdings=unknown)).status_code == 404
    assert not [p for p in client.get("/api/portfolios").json()["portfolios"] if p["name"] == clean_portfolio]


def test_active_custom_portfolio_drives_weighted_history(client, monkeypatch, clean_portfolio):
    dates = pd.date_range("2026-01-01", periods=2, freq="D")

    def closes(symbols):
        prices = {"TCS.NS": [100.0, 200.0], "INFY.NS": [100.0, 100.0]}
        return pd.DataFrame({s: prices[s] for s in symbols}, index=dates), 1_800_000_000.0, False

    monkeypatch.setattr(live_data, "get_closes", closes)
    created = client.post("/api/portfolios", json=valid_portfolio(clean_portfolio))
    assert created.status_code == 201

    data = client.get("/api/live/portfolio-history?range=1M").json()
    assert data["portfolio"]["name"] == clean_portfolio
    assert data["portfolio"]["is_custom"] is True
    assert data["latest_value"] == 175.0  # 75% doubled, 25% flat
    assert {c["ticker"]: c["weight"] for c in data["companies"]} == {"TCS": 75, "INFY": 25}

    assert client.get("/api/live/portfolio-history?ticker=RELIANCE").status_code == 404

    # Editing changes the weights the chart uses.
    even = [{"ticker": "TCS", "weight": 50}, {"ticker": "INFY", "weight": 50}]
    client.put(f"/api/portfolios/{created.json()['id']}", json=valid_portfolio(clean_portfolio, holdings=even))
    assert client.get("/api/live/portfolio-history?range=1M").json()["latest_value"] == 150.0


def test_deleting_active_portfolio_returns_to_mock(client, monkeypatch, clean_portfolio):
    monkeypatch.setattr(live_data, "get_closes", fake_closes)
    created = client.post("/api/portfolios", json=valid_portfolio(clean_portfolio)).json()
    assert client.get("/api/portfolios").json()["active_id"] == created["id"]
    client.delete(f"/api/portfolios/{created['id']}")
    assert client.get("/api/portfolios").json()["active_id"] is None
    assert client.get("/api/live/portfolio-history").json()["portfolio"]["is_custom"] is False


def test_portfolio_names_are_unique(client, clean_portfolio):
    assert client.post("/api/portfolios", json=valid_portfolio(clean_portfolio)).status_code == 201
    assert client.post("/api/portfolios", json=valid_portfolio(clean_portfolio)).status_code == 409


def test_company_search_covers_listed_companies(client):
    results = client.get("/api/companies/search?q=ANDHRA").json()["results"]
    assert results[0]["ticker"] == "ANDHRAPET"
    assert results[0]["exchange"] == "BSE"


def test_universe_search_endpoint(client):
    results = client.get("/api/universe/search?q=TCS").json()["results"]
    assert results[0]["exchanges"] == ["NSE", "BSE"]


def test_ensure_rejects_unlisted_company(client):
    assert client.post("/api/companies/NOTLISTED/ensure").status_code == 404


def test_source_outage_returns_503(client, monkeypatch):
    def down(_):
        raise live_data.LiveDataUnavailable("timed out")

    monkeypatch.setattr(live_data, "get_closes", down)
    res = client.get("/api/live/portfolio-history")
    assert res.status_code == 503
    assert "Yahoo Finance" in res.json()["detail"]
