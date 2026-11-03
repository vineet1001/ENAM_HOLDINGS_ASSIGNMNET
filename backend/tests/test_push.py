"""Tests for results tables, executive bios, alert preferences and notifications. No network."""
from datetime import date, datetime, timedelta

import httpx
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.core import config
from app.main import app
from app.services import alert_settings, documents as docs
from app.services import filing_ai, live_data, notifications


# ---------- Results first cut ----------

FILING_TEXT = """Revenue from operations 73,188 72,275 65,799
Other income 1,200 1,100 900
Finance costs 300 310 280
Depreciation 1,500 1,480 1,400
Profit before tax 18,000 17,500 16,000
Net profit 13,500 13,000 12,000"""


def answer(rows):
    return {
        "periods": {"current": "Sep 2026", "previous": "Jun 2026", "year_ago": "Sep 2025"},
        "unit": "₹ crore", "basis": "consolidated", "rows": rows,
    }


def row(metric, current, previous, year_ago, page=3):
    return {"metric": metric, "current": current, "previous": previous, "year_ago": year_ago, "page": page}


FULL_ROWS = [
    row("Revenue", "73,188", "72,275", "65,799"),
    row("EBITDA", "", "", ""),
    row("PBT", "18,000", "17,500", "16,000"),
    row("PAT", "13,500", "13,000", "12,000"),
    row("Finance costs", "300", "310", "280"),
    row("Depreciation", "1,500", "1,480", "1,400"),
    row("Other income", "1,200", "1,100", "900"),
]


def test_results_table_calculates_qoq_and_yoy_in_python():
    table = filing_ai.build_results_table(answer(FULL_ROWS), filing_ai.source_numbers(FILING_TEXT))
    revenue = next(r for r in table["rows"] if r["metric"] == "Revenue")
    assert revenue["current"] == 73188
    assert revenue["qoq_pct"] == pytest.approx(1.3)
    assert revenue["yoy_pct"] == pytest.approx(11.2)
    assert revenue["page"] == 3
    assert [r["metric"] for r in table["rows"]] == ["Revenue", "EBITDA", "PBT", "PAT"]


def test_ebitda_is_calculated_when_not_printed_and_marked_as_such():
    table = filing_ai.build_results_table(answer(FULL_ROWS), filing_ai.source_numbers(FILING_TEXT))
    ebitda = next(r for r in table["rows"] if r["metric"] == "EBITDA")
    assert ebitda["current"] == 18000 + 300 + 1500 - 1200
    assert ebitda["calculated"] is True


def test_printed_ebitda_is_used_as_is():
    text = FILING_TEXT + "\nEBITDA 19,999 19,000 17,000"
    rows = [row("EBITDA", "19,999", "19,000", "17,000"), *[r for r in FULL_ROWS if r["metric"] != "EBITDA"]]
    table = filing_ai.build_results_table(answer(rows), filing_ai.source_numbers(text))
    ebitda = next(r for r in table["rows"] if r["metric"] == "EBITDA")
    assert ebitda["current"] == 19999
    assert ebitda["calculated"] is False


def test_invented_figure_is_thrown_away():
    rows = [row("Revenue", "73,188", "72,275", "65,799"), row("PAT", "99,999", "13,000", "12,000")]
    table = filing_ai.build_results_table(answer(rows), filing_ai.source_numbers(FILING_TEXT))
    assert [r["metric"] for r in table["rows"]] == ["Revenue"]  # PAT's current figure isn't in the filing.


def test_year_ago_missing_still_shows_qoq():
    rows = [row("Revenue", "73,188", "72,275", "1,111,111")]
    table = filing_ai.build_results_table(answer(rows), filing_ai.source_numbers(FILING_TEXT))
    assert table["rows"][0]["qoq_pct"] == pytest.approx(1.3)
    assert table["rows"][0]["yoy_pct"] is None


def test_bracketed_loss_reads_as_negative():
    text = "Revenue 100 90 80\nNet profit (25) (10) 5"
    rows = [row("Revenue", "100", "90", "80"), row("PAT", "(25)", "(10)", "5")]
    table = filing_ai.build_results_table(answer(rows), filing_ai.source_numbers(text))
    pat = next(r for r in table["rows"] if r["metric"] == "PAT")
    assert pat["current"] == -25
    assert pat["qoq_pct"] == pytest.approx(-150.0)


def test_no_revenue_means_no_table():
    assert filing_ai.build_results_table(answer([row("PAT", "13,500", "", "")]), filing_ai.source_numbers(FILING_TEXT)) is None


# ---------- Executive bios ----------

def test_people_must_be_named_in_the_filing():
    pages = ["Mr. Rajesh Kumar has been appointed Chief Financial Officer. He was previously at Infosys."]
    result = filing_ai.build_people({"changes": [
        {"person": "Rajesh Kumar", "role": "CFO", "change": "appointed", "effective_date": "1 Nov 2026",
         "background": "Previously at Infosys", "previous_roles": ["Infosys"], "education": "", "page": 1},
        {"person": "Invented Person", "role": "CEO", "change": "appointed", "effective_date": "",
         "background": "", "previous_roles": [], "education": "", "page": 1},
    ]}, pages, "Acme Ltd")
    assert [p["person"] for p in result] == ["Rajesh Kumar"]
    assert "linkedin.com/search" in result[0]["linkedin_search"]
    assert "Rajesh+Kumar+Acme" in result[0]["linkedin_search"]


# ---------- Transcript dates ----------

@pytest.mark.parametrize("text,expected", [
    ("Earnings Conference Call July 10, 2025, 19:00 hrs IST", date(2025, 7, 10)),
    ("Q2 FY27 call held on 10th October 2026", date(2026, 10, 10)),
    ("October 9th, 2026", date(2026, 10, 9)),
    ("Sept 3, 2026 at noon", date(2026, 9, 3)),
    ("No date in this one at all", None),
    ("February 31, 2026 is not a date", None),
])
def test_call_date_is_read_from_the_document(text, expected):
    assert docs.call_date_from_text([text]) == expected


def test_analysts_questions_are_not_treated_as_guidance():
    class Doc:
        id, document_type, title, financial_period = 9101, "concall_transcript", "Call", "Jul 2026"
        status, source_url = "processed", "https://x/9101.pdf"

    docs._page_cache[9101] = [
        "Is it fair to assume that the guidance is still intact for reaching 25% by the next quarter? "
        "We expect margins to reach 25% by the fourth quarter of this year."
    ]
    found = docs.guidance_sentences([Doc()])
    assert len(found) == 1
    assert found[0]["quote"].startswith("We expect")


# ---------- Alert preferences ----------

@pytest.fixture
def client():
    with TestClient(app, client=("127.0.0.1", 50000)) as test_client:
        yield test_client


def valid(**changes):
    base = {
        "price_enabled": True, "price_threshold": 4.0, "price_direction": "both",
        "volume_enabled": True, "volume_multiple": 2.5, "volume_lookback": 30,
        "categories": ["results", "M&A", "management_change"],
        "overrides": [], "alert_lookback_days": 7, "sync_minutes": 15,
        "digest_default_hours": 24, "digest_focus_categories": ["results"], "move_watch_percent": 2.0,
    }
    return {**base, **changes}


@pytest.fixture
def quiet_markets(monkeypatch):
    dates = pd.date_range(end=datetime.utcnow().date() + timedelta(days=200), periods=25, freq="D")
    monkeypatch.setattr(live_data, "get_filings", lambda holdings: ({"filings": [], "failed": []}, 1.0, False))
    frame = lambda symbols, value: pd.DataFrame({s: [value] * 25 for s in symbols}, index=dates)  # noqa: E731
    monkeypatch.setattr(live_data, "get_closes", lambda s: (frame(s, 100.0), 1.0, False))
    monkeypatch.setattr(live_data, "get_volumes", lambda s: (frame(s, 100.0), 1.0, False))


def test_preferences_round_trip(client, quiet_markets):
    assert client.put("/api/settings/alerts", json=valid()).status_code == 200
    saved = client.get("/api/settings/alerts").json()
    assert saved["price_threshold"] == 4.0
    assert saved["volume_multiple"] == 2.5
    assert saved["volume_lookback"] == 30
    assert set(saved["categories"]) == {"results", "M&A", "management_change"}
    assert saved["digest_focus_categories"] == ["results"]


def test_turning_a_category_on_and_off(client, quiet_markets):
    client.put("/api/settings/alerts", json=valid(categories=["results", "dividend"]))
    assert set(client.get("/api/settings/alerts").json()["categories"]) == {"results", "dividend"}
    client.put("/api/settings/alerts", json=valid(categories=["results"]))
    assert client.get("/api/settings/alerts").json()["categories"] == ["results"]


@pytest.mark.parametrize("bad", [
    {"price_threshold": 0.1}, {"price_threshold": 99}, {"price_threshold": "lots"}, {"volume_multiple": 0.5},
    {"volume_lookback": 2}, {"price_direction": "sideways"}, {"categories": ["nonsense"]},
    {"digest_default_hours": 5}, {"sync_minutes": 1}, {"alert_lookback_days": 90},
])
def test_bad_values_change_nothing(client, quiet_markets, bad):
    client.put("/api/settings/alerts", json=valid())
    assert client.put("/api/settings/alerts", json=valid(price_threshold=7.0, **{k: v for k, v in bad.items() if k != "price_threshold"}) if "price_threshold" not in bad else valid(**bad)).status_code == 422
    assert client.get("/api/settings/alerts").json()["price_threshold"] == 4.0


def test_override_replaces_global_rule_for_that_stock(client, monkeypatch):
    # Every stock moves 5%. The global limit is 4%, but TCS has its own limit of 8%.
    dates = pd.date_range(end=datetime.utcnow().date() + timedelta(days=300), periods=25, freq="D")
    closes = lambda s: (pd.DataFrame({x: [100.0] * 24 + [105.0] for x in s}, index=dates), 1.0, False)  # noqa: E731
    volumes = lambda s: (pd.DataFrame({x: [100.0] * 25 for x in s}, index=dates), 1.0, False)  # noqa: E731
    monkeypatch.setattr(live_data, "get_filings", lambda holdings: ({"filings": [], "failed": []}, 1.0, False))
    monkeypatch.setattr(live_data, "get_closes", closes)
    monkeypatch.setattr(live_data, "get_volumes", volumes)

    res = client.put("/api/settings/alerts", json=valid(overrides=[{"ticker": "TCS", "price_threshold": 8.0}]))
    assert res.status_code == 200
    events = client.get("/api/alerts/events?rule_type=price_movement&limit=200").json()["events"]
    recent = [e for e in events if str(dates[-1].date()) in e["observed_value"]]
    assert recent
    assert "TCS" not in {e["company_ticker"] for e in recent}
    assert client.get("/api/settings/alerts").json()["overrides"][0]["ticker"] == "TCS"
    client.put("/api/settings/alerts", json=valid(overrides=[]))
    assert client.get("/api/settings/alerts").json()["overrides"] == []


def test_preview_counts_moves_like_the_rules_do(client, monkeypatch):
    dates = pd.date_range(end=datetime.utcnow().date(), periods=40, freq="D")
    closes = lambda s: (pd.DataFrame({x: [100.0] * 39 + [110.0] for x in s}, index=dates), 1.0, False)  # noqa: E731
    volumes = lambda s: (pd.DataFrame({x: [100.0] * 39 + [300.0] for x in s}, index=dates), 1.0, False)  # noqa: E731
    monkeypatch.setattr(live_data, "get_closes", closes)
    monkeypatch.setattr(live_data, "get_volumes", volumes)
    first = client.get("/api/settings/alerts/preview?lookback=20").json()["companies"][0]
    assert first["changes"][-1] == 10.0
    assert first["volume_multiples"][-1] == 3.0


def test_notification_credentials_are_owner_only():
    with TestClient(app, client=("203.0.113.9", 50000)) as remote:
        assert remote.get("/api/settings/alerts").json()["can_edit_notifications"] is False
        assert remote.get("/api/settings/notifications").status_code == 403
        assert remote.put("/api/settings/notifications", json={"chat_id": "123"}).status_code == 403
        assert remote.post("/api/settings/notifications/test").status_code == 403


# ---------- Notifications ----------

GOOD_TOKEN = "123456789:" + "A" * 35


@pytest.fixture
def telegram(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "ENV_FILE", tmp_path / ".env")
    monkeypatch.delenv(notifications.TOKEN_ENV, raising=False)
    monkeypatch.delenv(notifications.CHAT_ENV, raising=False)
    yield tmp_path / ".env"
    notifications.clear()


def capture(monkeypatch, status=200, body=None):
    seen = {}
    real = httpx.AsyncClient

    def handler(request):
        seen["url"] = str(request.url)
        seen["body"] = request.content.decode()
        return httpx.Response(status, json=body or {"ok": True})

    monkeypatch.setattr(notifications.httpx, "AsyncClient", lambda **kw: real(transport=httpx.MockTransport(handler), **kw))
    return seen


def test_token_is_saved_to_env_and_never_returned(client, telegram):
    res = client.put("/api/settings/notifications", json={"bot_token": GOOD_TOKEN, "chat_id": "12345"})
    assert GOOD_TOKEN not in res.text
    assert res.json()["configured"] is True
    assert res.json()["token_hint"].endswith("AAAA")
    assert GOOD_TOKEN in telegram.read_text()


@pytest.mark.parametrize("field,value", [("bot_token", "not a token"), ("chat_id", "bad id; x")])
def test_bad_notification_settings_are_refused_without_repeating_them(client, telegram, field, value):
    res = client.put("/api/settings/notifications", json={field: value})
    assert res.status_code == 422
    assert value not in res.text


def test_test_message_reports_success(client, telegram, monkeypatch):
    client.put("/api/settings/notifications", json={"bot_token": GOOD_TOKEN, "chat_id": "12345"})
    seen = capture(monkeypatch)
    assert client.post("/api/settings/notifications/test").json()["ok"] is True
    assert "sendMessage" in seen["url"]
    assert "12345" in seen["body"]


def test_telegram_errors_never_expose_the_token(client, telegram, monkeypatch):
    client.put("/api/settings/notifications", json={"bot_token": GOOD_TOKEN, "chat_id": "12345"})
    capture(monkeypatch, status=401, body={"description": f"Unauthorized {GOOD_TOKEN}"})
    res = client.post("/api/settings/notifications/test")
    assert res.json()["ok"] is False
    assert GOOD_TOKEN not in res.text
    assert GOOD_TOKEN not in client.get("/api/settings/notifications").text


def test_alert_message_summarises_a_sync():
    text = notifications.format_alerts({"details": {
        "announcement": [{"company": "TCS", "announcement": "Results"}],
        "price": [{"company": "ITC", "change": "+5.00%", "threshold": "3%"}],
        "volume": [{"company": "LT", "volume_multiple": "3.1x", "threshold": "2x"}],
    }})
    assert "3 new alerts" in text and "TCS" in text and "ITC" in text and "LT" in text
    assert notifications.format_alerts({"details": {}}) is None


def test_long_message_is_capped():
    items = [{"company": f"C{i}", "announcement": "x"} for i in range(30)]
    assert "and 10 more" in notifications.format_alerts({"details": {"announcement": items}})
