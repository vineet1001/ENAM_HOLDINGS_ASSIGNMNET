"""Research endpoints that page polling and the document explorer rely on. No network."""
import gzip
import json

import pytest
from fastapi.testclient import TestClient

from app.core.database import async_session_factory
from app.main import app
from app.models.company import Company
from app.models.document import SourceDocument
from app.services import documents as docs
from app.services import filing_ai, research_engine
from sqlalchemy import select


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def transcript(client):
    import asyncio

    async def create():
        async with async_session_factory() as db:
            company = (await db.execute(select(Company).where(Company.ticker == "TCS"))).scalar_one()
            document = SourceDocument(
                company_id=company.id, document_type="concall_transcript", title="Concall transcript, Jul 2026",
                financial_period="Jul 2026", source_url="https://example.com/call.pdf", status="processed",
                page_count=2, is_demo=False,
            )
            db.add(document)
            await db.commit()
            return document.id

    docs._queue.clear()
    document_id = asyncio.run(create())
    docs.TEXT_DIR.mkdir(parents=True, exist_ok=True)
    with gzip.open(docs.TEXT_DIR / f"{document_id}.json.gz", "wt", encoding="utf-8") as handle:
        json.dump(["Opening remarks about nothing in particular at all, for the record of this call.",
                   "We expect margins to reach 25% by the fourth quarter of this financial year, management said on the call."], handle)
    docs._page_cache.pop(document_id, None)
    return document_id


def test_search_inside_a_document_names_the_page(client, transcript):
    res = client.get(f"/api/sources/{transcript}/pages?q=margins").json()
    assert res["results"][0]["page"] == 2
    assert res["results"][0]["url"].endswith("#page=2")


def test_unknown_document_is_404(client):
    assert client.get("/api/sources/99999999/pages?q=x").status_code == 404


def test_documents_report_their_reading_state(client, transcript):
    res = client.get("/api/companies/TCS/documents").json()
    assert res["state"]["state"] == "ready"
    assert res["state"]["transcripts"] >= 1


def test_fetch_queues_the_company_once(client):
    docs._queue.clear()
    assert client.post("/api/companies/INFY/documents/fetch").json()["state"]["state"] == "preparing"
    client.post("/api/companies/INFY/documents/fetch")
    assert len(docs._queue) == 1
    docs._queue.clear()


def test_portfolio_documents_lists_every_holding(client):
    body = client.get("/api/documents").json()
    assert body["companies"]
    assert {"ticker", "name", "state", "documents"} <= set(body["companies"][0])


def test_a_failed_model_call_still_returns_a_saved_answer(client, transcript, monkeypatch):
    async def fail(*args, **kwargs):
        raise filing_ai.AIUnavailable("The model is down")

    monkeypatch.setattr(filing_ai, "call_model", fail)
    monkeypatch.setattr(filing_ai, "ai_status", lambda: {"configured": True, "paused_seconds": 0})
    res = client.post("/api/companies/TCS/research", json={"research_type": "guidance"})
    assert res.status_code == 200
    body = res.json()
    assert body["data"]["ai_error"] == "The model is down"
    assert body["data"]["found_sentences"][0]["page"] == 2


def test_search_many_takes_turns_between_queries(transcript):
    class Doc:
        id, document_type, title, financial_period = 9102, "annual_report", "AR", "FY26"
        status, source_url = "processed", "https://x/9102.pdf"

    docs._page_cache[9102] = [
        "segment " * 30 + "revenue details for the segment reporting table in this report",
        "segment " * 25 + "more of the same kind of words for the segment reporting table",
        "customers geography markets are described on this particular page of the annual report",
    ]
    found = docs.search_many([Doc()], ("segment reporting", "customers geography"), limit=2)
    assert {f["page"] for f in found} >= {3}
