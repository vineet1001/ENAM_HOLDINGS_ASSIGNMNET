"""Whole-document summaries: splitting, checking, saving and the no-key fallback. No network."""
import asyncio
import gzip
import json
import time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core import config
from app.core.database import async_session_factory
from app.main import app
from app.models.company import Company
from app.models.document import SourceDocument
from app.services import document_summary as ds
from app.services import documents as docs
from app.services import filing_ai
from app.services.ai_providers import AIRateLimited

NARRATIVE = (
    "Revenue grew 18% to Rs 4,200 crore as demand for our widgets improved across every region this year. "
    "We expect margins to improve further as the new plant reaches full capacity during the coming year. "
)
PAGES = [
    NARRATIVE,
    "Board of Directors Amit Shah Priya Rao Kiran Mehta Sunil Das Rekha Iyer Anil Kumar Committee Member Chair Audit.",
    "Total 1,234 5,678 9,012 3,456 7,890 1,112 1,314 1,516 1,718 1,920 2,122 2,324 note 14 schedule 3 of 2026 accounts.",
    "Exports now make up a third of sales, and the order book for the next year stands at a record level for us. "
    "Management plans to spend on a second line because customers keep asking for shorter delivery times.",
    "This document contains forward-looking statements that involve risks and uncertainties about the future of it.",
    "Net debt fell to Rs 310 crore as strong cash generation from operations paid for most of the capital spending.",
]


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def report(client):
    async def create():
        async with async_session_factory() as db:
            company = (await db.execute(select(Company).where(Company.ticker == "TCS"))).scalar_one()
            document = SourceDocument(
                company_id=company.id, document_type="concall_transcript", title="Concall transcript, Oct 2026",
                financial_period="Oct 2026", source_url="https://example.com/summary-call.pdf", status="processed",
                page_count=len(PAGES), is_demo=False,
            )
            db.add(document)
            await db.commit()
            return document.id

    document_id = asyncio.run(create())
    docs.TEXT_DIR.mkdir(parents=True, exist_ok=True)
    with gzip.open(docs.TEXT_DIR / f"{document_id}.json.gz", "wt", encoding="utf-8") as handle:
        json.dump(PAGES, handle)
    docs._page_cache.pop(document_id, None)
    ds.reset_state()
    return document_id


def wait_for(client, document_id, status=("done", "failed"), seconds=10):
    deadline = time.time() + seconds
    while time.time() < deadline:
        body = client.get(f"/api/sources/{document_id}/summary").json()
        if body["status"] in status:
            return body
        time.sleep(0.05)
    raise AssertionError(f"summary still {body['status']}")


# ---------- Splitting ----------

def test_parts_cover_every_page_once_and_in_order():
    pages = ["x" * 300] * 23
    parts = ds.split_parts(pages, 1000)
    covered = [n for first, last in parts for n in range(first, last + 1)]
    assert covered == list(range(1, 24))
    assert all((last - first + 1) * 312 <= 1000 for first, last in parts)


def test_a_huge_document_gets_bigger_parts_not_unread_pages(monkeypatch):
    monkeypatch.setattr(ds, "MAX_PARTS", 5)
    parts = ds.split_parts(["y" * 1000] * 100, 2000)
    assert len(parts) <= 5
    assert parts[0][0] == 1 and parts[-1][1] == 100


def test_a_page_longer_than_a_part_is_cut_not_skipped():
    text = ds._part_text(["z" * 5000], 1, 1, 1000)
    assert text.startswith("[Page 1]") and len(text) == 1000


# ---------- Without a key ----------

def test_sentences_skip_boilerplate_name_lists_and_table_rows():
    picked = ds.extractive_summary(PAGES, limit=6)
    pages = [s["page"] for s in picked]
    assert pages == sorted(pages)
    assert {2, 3, 5}.isdisjoint(pages)
    assert {1, 4, 6} & set(pages)


def test_annual_reports_only_draw_on_the_narrative_front():
    pages = PAGES + ["Interest income on loans increased as the bank charged higher rates on its corporate book."] * 20
    picked = ds.extractive_summary(pages, limit=8, front_share=0.25)
    assert all(s["page"] <= 7 for s in picked)


def test_no_key_shows_sentences_and_refuses_to_start(client, report, monkeypatch):
    monkeypatch.setattr(config, "LLM_API_KEY", "")
    body = client.get(f"/api/sources/{report}/summary").json()
    assert body["status"] == "none" and not body["ai_configured"]
    assert body["summary"]["mode"] == "extract"
    assert body["summary"]["sentences"][0]["url"].endswith(f"#page={body['summary']['sentences'][0]['page']}")
    assert client.post(f"/api/sources/{report}/summary").status_code == 409


def test_unknown_or_unread_documents(client):
    assert client.get("/api/sources/99999999/summary").status_code == 404


# ---------- With a key ----------

def stub_model(calls, fail_on=None):
    async def call(prompt, schema, max_tokens, system=None, strong=False):
        calls.append({"prompt": prompt, "strong": strong, "final": schema is ds.FINAL_SCHEMA})
        if fail_on is not None and len(calls) == fail_on:
            raise AIRateLimited("quota")
        if schema is ds.PART_SCHEMA:
            return {
                "summary": "Part notes.",
                "points": [{"text": "Revenue grew 18% to Rs 4,200 crore.", "page": 1}],
                "figures": [{"label": "Revenue", "value": "Rs 4,200 crore", "period": "FY26", "page": 1},
                            {"label": "Invented", "value": "Rs 9,999 crore", "period": "FY26", "page": 1}],
            }
        return {
            "headline": "Demand lifted revenue and cut net debt",
            "overview": "Revenue grew 18% and net debt fell to Rs 310 crore.",
            "key_points": [
                {"text": "Revenue grew 18% to Rs 4,200 crore.", "page": 1},
                {"text": "Margins rose to 27%.", "page": 4},
                {"text": "A page that doesn't exist.", "page": 99},
            ],
            "figures": [{"label": "Net debt", "value": "Rs 310 crore", "period": "FY26", "page": 6},
                        {"label": "Made up", "value": "Rs 777 crore", "period": "FY26", "page": 6}],
            "risks": [{"text": "Forward-looking statements may not hold.", "page": 5}],
        }
    return call


def test_long_document_is_read_part_by_part_then_combined_and_checked(client, report, monkeypatch):
    calls = []
    monkeypatch.setattr(config, "LLM_API_KEY", "test-key")
    monkeypatch.setattr(ds, "PART_CHARS", 250)
    monkeypatch.setattr(filing_ai, "call_model", stub_model(calls))

    started = client.post(f"/api/sources/{report}/summary").json()
    assert started["calls_needed"] == started["parts"] + 1 > 2
    body = wait_for(client, report)
    assert body["status"] == "done", body
    summary = body["summary"]

    parts = [c for c in calls if not c["final"]]
    assert len(parts) == started["parts"] and calls[-1]["final"] and calls[-1]["strong"]
    every_page = "".join(c["prompt"] for c in parts)
    assert all(f"[Page {n}]" in every_page for n in range(1, len(PAGES) + 1))

    assert [f["value"] for f in summary["figures"]] == ["Rs 310 crore"]
    assert summary["figures_dropped"] == 1
    flags = {p["text"]: p for p in summary["key_points"]}
    assert flags["Revenue grew 18% to Rs 4,200 crore."]["verified"]
    assert not flags["Margins rose to 27%."]["verified"]
    assert flags["A page that doesn't exist."]["page"] is None
    assert len(summary["sections"]) == len(parts)
    assert all(len(s["points"]) == 1 for s in summary["sections"])

    # Saved: asking again costs nothing.
    before = len(calls)
    assert client.post(f"/api/sources/{report}/summary").json()["status"] == "done"
    assert len(calls) == before


def test_short_document_takes_one_call(client, report, monkeypatch):
    calls = []
    monkeypatch.setattr(config, "LLM_API_KEY", "test-key")
    monkeypatch.setattr(filing_ai, "call_model", stub_model(calls))
    client.post(f"/api/sources/{report}/summary")
    body = wait_for(client, report)
    assert body["status"] == "done" and len(calls) == 1 and not calls[0]["strong"]
    assert body["summary"]["sections"] == []


def test_a_quota_error_stops_and_a_retry_resumes_from_saved_parts(client, report, monkeypatch):
    calls = []
    monkeypatch.setattr(config, "LLM_API_KEY", "test-key")
    monkeypatch.setattr(ds, "PART_CHARS", 250)
    monkeypatch.setattr(filing_ai, "call_model", stub_model(calls, fail_on=3))

    client.post(f"/api/sources/{report}/summary")
    failed = wait_for(client, report)
    assert failed["status"] == "failed" and "quota" in failed["error"]
    assert failed["summary"]["mode"] == "extract"  # Something useful still shows.

    monkeypatch.setattr(filing_ai, "call_model", stub_model(calls))
    client.post(f"/api/sources/{report}/summary")
    assert wait_for(client, report)["status"] == "done"
    part_calls = [c for c in calls if not c["final"]]
    parts = ds.split_parts(PAGES, 250)
    assert len(part_calls) == len(parts) + 1  # Only the failed part was asked for twice.
