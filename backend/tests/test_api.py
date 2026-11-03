"""Integration tests for FINN FastAPI API endpoints using TestClient."""
import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture(scope="session", autouse=True)
def client():
    with TestClient(app) as test_client:
        yield test_client


def test_health_check(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["demo_mode"] is True
    assert data["database"] == "connected"


def test_get_portfolio(client):
    res = client.get("/api/portfolio")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 18
    assert len(data["companies"]) == 18
    c = data["companies"][0]
    assert "ticker" in c
    assert "latest_price" in c
    assert "sector" in c


def test_search_companies(client):
    res = client.get("/api/companies/search?q=RELIANCE")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] >= 1
    assert data["results"][0]["ticker"] == "RELIANCE"
    assert data["results"][0]["in_portfolio"] is True


def test_quarterly_financials_comparison(client):
    res = client.get("/api/companies/RELIANCE/financials")
    assert res.status_code == 200
    data = res.json()
    assert data["company_ticker"] == "RELIANCE"
    assert "metrics" in data
    assert len(data["metrics"]) >= 4  # REVENUE, EBITDA, PBT, PAT
    rev = next((m for m in data["metrics"] if m["metric"] == "REVENUE"), None)
    assert rev is not None
    assert rev["current_quarter"] is not None
    assert rev["previous_quarter"] is not None
    assert rev["qoq_pct"] is not None


def test_announcements_inbox(client):
    res = client.get("/api/announcements?limit=20")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] >= 1
    assert "announcements" in data


def test_daily_digest(client):
    res = client.get("/api/digest?hours=168")
    assert res.status_code == 200
    data = res.json()
    assert "important_items" in data
    assert "routine_items" in data
    assert data["total_announcements"] >= 1


def test_alert_rules_and_evaluation(client):
    res = client.get("/api/alerts/rules")
    assert res.status_code == 200
    rules = res.json()["rules"]
    assert len(rules) >= 5

    eval_res = client.post("/api/alerts/evaluate")
    assert eval_res.status_code == 200
    assert "total_triggered" in eval_res.json()

    events_res = client.get("/api/alerts/events?include_demo=true")
    assert events_res.status_code == 200
    assert events_res.json()["total"] >= 1
    # Without asking for them, demo alerts stay out of the list.
    live_events = client.get("/api/alerts/events").json()["events"]
    assert all(not e["is_demo"] for e in live_events)


def test_management_change_enrichment(client):
    ann_res = client.get("/api/announcements?category=management_change")
    announcements = ann_res.json()["announcements"]
    assert len(announcements) >= 1
    ann_id = announcements[0]["id"]

    res = client.get(f"/api/management-change/{ann_id}")
    assert res.status_code == 200
    data = res.json()
    assert "profile" in data
    assert data["profile"]["verification_status"] in ("verified", "unverified")


def test_company_research(client):
    res = client.post(
        "/api/companies/INFY/research",
        json={"research_type": "narrative_vs_numbers"}
    )
    assert res.status_code == 200
    data = res.json()
    assert data["company_ticker"] == "INFY"
    assert data["research_type"] == "narrative_vs_numbers"
    assert "data" in data
    assert "citations" in data
