"""Downloads annual reports and concall transcripts, then lets research search them page by page.

Page text is stored as compressed files in a git-ignored folder rather than in finn.db, which is
committed to the repository and shouldn't grow by a megabyte per annual report.
"""
import asyncio
import difflib
import gzip
import json
import logging
import math
import re
from collections import Counter
from concurrent.futures import ProcessPoolExecutor
from concurrent.futures.process import BrokenProcessPool
from datetime import date, datetime
from pathlib import Path
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import config
from app.core.database import async_session_factory
from app.models.company import Company
from app.models.document import SourceDocument
from app.services import filing_ai, screener
from app.services.live_data import LiveDataUnavailable

logger = logging.getLogger("finn.documents")

ANNUAL_REPORTS_TO_READ = 1
TRANSCRIPTS_TO_READ = 5  # Four quarters of promises, plus the call that reports on the last of them.
TEXT_DIR = config.DOCS_DIR / "text"
MAX_REPORT_PAGES = 500
TERMS = re.compile(r"[a-z0-9&]{3,}")
STOP_WORDS = set(
    "about after also and are been but can did does for from had has have how into its more not our out over "
    "said some than that the their them they this was were what when where which who why will with you your "
    "would should could there these those".split()
)
GUIDANCE_PATTERN = re.compile(
    r"\b(guidance|guide[ds]?|expect(?:ed|ing|s)?|target(?:s|ing)?|aim(?:s|ing)?|outlook|anticipat\w+|going forward|"
    r"next (?:year|quarter|fiscal)|by (?:fy|the end)|we will|we plan|plans? to|on track)\b",
    re.IGNORECASE,
)

MONTH_NAMES = r"(?P<month>Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)"
DATE_MONTH_FIRST = re.compile(MONTH_NAMES + r"\.?\s+(?P<day>\d{1,2})(?:st|nd|rd|th)?,?\s+(?P<year>20\d{2})", re.IGNORECASE)
DATE_DAY_FIRST = re.compile(r"(?P<day>\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?" + MONTH_NAMES + r"\.?,?\s+(?P<year>20\d{2})", re.IGNORECASE)
MONTH_NUMBERS = {m: i + 1 for i, m in enumerate(("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"))}

COMMENTARY_TYPES = ("concall_transcript", "investor_presentation")
QUOTE_SIMILARITY = 0.9
SYNONYMS = {
    "margin": ("margins", "ebitda", "operating", "profitability"),
    "margins": ("margin", "ebitda", "operating", "profitability"),
    "debt": ("borrowings", "leverage", "loans"),
    "leverage": ("debt", "borrowings"),
    "capex": ("capital", "expenditure", "investment", "capacity"),
    "revenue": ("sales", "income", "turnover", "topline"),
    "growth": ("grew", "growing", "increase"),
    "guidance": ("outlook", "expect", "target"),
    "deal": ("deals", "contract", "contracts", "tcv", "order"),
    "deals": ("deal", "contract", "contracts", "tcv", "order"),
    "orders": ("order", "orderbook", "book"),
    "dividend": ("dividends", "payout"),
    "acquisition": ("acquisitions", "acquire", "merger"),
    "segment": ("segments", "division", "vertical", "business"),
    "employees": ("headcount", "attrition", "hiring"),
    "cash": ("liquidity", "fcf"),
}
_extractor: Optional[ProcessPoolExecutor] = None
_queue: list[int] = []
_in_progress: Optional[int] = None
_page_cache: dict[int, list[str]] = {}
_PAGE_CACHE_DOCS = 16


def _terms(text: str) -> list[str]:
    return [t for t in TERMS.findall(text.lower()) if t not in STOP_WORDS]


def _text_path(document_id: int) -> Path:
    return TEXT_DIR / f"{document_id}.json.gz"


def load_pages(document: SourceDocument) -> list[str]:
    """The text of each page of a document, kept in memory for the most recently used few."""
    if document.id in _page_cache:
        return _page_cache[document.id]
    try:
        with gzip.open(_text_path(document.id), "rt", encoding="utf-8") as handle:
            pages = json.load(handle)
    except (OSError, ValueError):
        return []
    if len(_page_cache) >= _PAGE_CACHE_DOCS:
        _page_cache.pop(next(iter(_page_cache)))
    _page_cache[document.id] = pages
    return pages


def _save_pages(document_id: int, pages: list[str]) -> None:
    TEXT_DIR.mkdir(parents=True, exist_ok=True)
    with gzip.open(_text_path(document_id), "wt", encoding="utf-8") as handle:
        json.dump(pages, handle)


def page_url(document: SourceDocument, page: Optional[int]) -> Optional[str]:
    if not document.source_url:
        return None
    return f"{document.source_url}#page={page}" if page else document.source_url


def call_date_from_text(pages: list[str]) -> Optional[date]:
    """The date printed at the top of a transcript, such as July 10, 2025 or 10th July 2025."""
    text = " ".join(pages[:2])[:3000]
    for pattern in (DATE_MONTH_FIRST, DATE_DAY_FIRST):
        match = pattern.search(text)
        if match:
            groups = match.groupdict()
            month = MONTH_NUMBERS.get(groups["month"][:3].lower())
            try:
                return date(int(groups["year"]), month, int(groups["day"]))
            except (TypeError, ValueError):
                continue
    return None


def wanted_documents(data: dict) -> list[dict]:
    """The newest annual report and the last few transcripts that exist."""
    wanted = []
    reports = sorted(
        [r for r in data.get("annual_reports", []) if r.get("url")],
        key=lambda r: r.get("year") or 0, reverse=True,
    )
    for report in reports[:ANNUAL_REPORTS_TO_READ]:
        wanted.append({
            "type": "annual_report", "title": report["title"], "url": report["url"],
            "period": f"FY{str(report['year'])[-2:]}" if report.get("year") else None,
            "date": date(report["year"], 3, 31) if report.get("year") else None,
        })
    # Some companies never publish transcripts. Their presentations are the next best record of what they said.
    calls = [c for c in data.get("concalls", []) if c.get("transcript_url") or c.get("presentation_url")]
    for call in calls[:TRANSCRIPTS_TO_READ]:
        when = date.fromisoformat(call["date"]) if call.get("date") else None
        if call.get("transcript_url"):
            wanted.append({
                "type": "concall_transcript", "title": f"Concall transcript, {call['label']}", "url": call["transcript_url"],
                "period": call["label"], "date": when,
            })
        else:
            wanted.append({
                "type": "investor_presentation", "title": f"Investor presentation, {call['label']}", "url": call["presentation_url"],
                "period": call["label"], "date": when,
            })
    return wanted


async def real_documents(db: AsyncSession, company_id: int) -> list[SourceDocument]:
    rows = await db.execute(
        select(SourceDocument)
        .where(SourceDocument.company_id == company_id, SourceDocument.is_demo == False)  # noqa: E712
        .order_by(SourceDocument.publication_date.desc().nullslast())
    )
    return list(rows.scalars().all())


def request_ingest(company_id: int) -> None:
    """Ask for a company's documents to be fetched. Returns immediately; the worker does the rest."""
    if company_id not in _queue and company_id != _in_progress:
        _queue.append(company_id)


def document_state(company_id: int, documents: list[SourceDocument]) -> dict:
    """What research can tell the page about how far along the reading is."""
    finished = [d for d in documents if d.status == "processed"]
    failed = [d for d in documents if d.status == "failed"]
    busy = company_id == _in_progress or company_id in _queue
    if busy:
        state = "preparing"
    elif finished:
        state = "ready"
    elif failed:
        state = "failed"
    else:
        state = "none"
    return {
        "state": state,
        "ready": len(finished),
        "failed": len(failed),
        "total": len(documents),
        "annual_reports": sum(1 for d in finished if d.document_type == "annual_report"),
        "transcripts": sum(1 for d in finished if d.document_type == "concall_transcript"),
        "presentations": sum(1 for d in finished if d.document_type == "investor_presentation"),
    }


async def _extract_pages(data: bytes) -> tuple[list[str], int]:
    """In a process of its own: a 400-page report takes a minute of CPU, which would stall every other request."""
    global _extractor
    if _extractor is None:
        _extractor = ProcessPoolExecutor(max_workers=1)
    loop = asyncio.get_running_loop()
    try:
        return await loop.run_in_executor(_extractor, filing_ai.extract_pdf_pages, data, MAX_REPORT_PAGES)
    except BrokenProcessPool:
        _extractor = None
        return await asyncio.to_thread(filing_ai.extract_pdf_pages, data, MAX_REPORT_PAGES)


async def _ingest_one(company_id: int, item: dict) -> None:
    async with async_session_factory() as db:
        document = (await db.execute(
            select(SourceDocument).where(
                SourceDocument.company_id == company_id, SourceDocument.source_url == item["url"],
                SourceDocument.is_demo == False,  # noqa: E712
            )
        )).scalar_one_or_none()
        if document and document.status == "processed":
            return
        if document is None:
            document = SourceDocument(
                company_id=company_id, document_type=item["type"], title=item["title"],
                financial_period=item["period"], publication_date=item["date"], source_url=item["url"],
                status="downloading", is_demo=False,
            )
            db.add(document)
        document.status = "downloading"
        document.error_message = None
        await db.commit()

        try:
            data = await filing_ai.download_pdf(item["url"], any_public_host=True)
            pages, total = await _extract_pages(data)
            await asyncio.to_thread(_save_pages, document.id, pages)
            if document.document_type == "concall_transcript":
                # Screener's labels can be wrong by a year, and promises have to line up with the right quarter.
                held_on = call_date_from_text(pages)
                if held_on:
                    document.publication_date = held_on
                    document.financial_period = held_on.strftime("%b %Y")
                    document.title = f"Concall transcript, {held_on.strftime('%b %Y')}"
            document.status = "processed"
            document.page_count = total
            document.processed_at = datetime.utcnow()
            _page_cache.pop(document.id, None)
        except filing_ai.DocumentUnreadable as exc:
            document.status = "failed"
            document.error_message = str(exc)
        await db.commit()


async def ingest_company(company_id: int) -> None:
    async with async_session_factory() as db:
        company = await db.get(Company, company_id)
        if company is None:
            return
        ticker, yahoo = company.ticker, company.yahoo_symbol
    try:
        data = await asyncio.to_thread(screener.get_company_data, ticker, yahoo)
    except LiveDataUnavailable:
        logger.warning("Couldn't list documents for %s", ticker)
        return
    for item in wanted_documents(data or {}):
        await _ingest_one(company_id, item)


async def ingest_worker_loop() -> None:
    """Fetches one company's documents at a time, so a big portfolio can't flood anyone's servers."""
    global _in_progress
    while True:
        if not _queue:
            await asyncio.sleep(2)
            continue
        _in_progress = _queue.pop(0)
        try:
            await ingest_company(_in_progress)
        except Exception:
            logger.exception("Document ingestion failed")
        finally:
            _in_progress = None


# ---------- Searching ----------

def _chunks(document: SourceDocument, size: int = 1800) -> list[dict]:
    """Page-sized passages, split further if a page is long, so each result names its page."""
    passages = []
    for number, text in enumerate(load_pages(document), start=1):
        cleaned = re.sub(r"[ \t]+", " ", text).strip()
        for start in range(0, len(cleaned), size):
            passage = cleaned[start:start + size]
            if len(passage) > 80:
                passages.append({"page": number, "text": passage})
    return passages


def search(
    documents: list[SourceDocument], query: str, limit: int = 8,
    types: Optional[tuple[str, ...]] = None, per_document: Optional[int] = None,
    front_share: Optional[float] = None,
) -> list[dict]:
    """BM25 ranking in plain Python, which needs no embeddings service and costs nothing to run."""
    terms = _terms(query)
    if not terms:
        return []
    # Filings use different words for the same idea. Related words count for half.
    weights = {term: 1.0 for term in terms}
    for term in terms:
        for related in SYNONYMS.get(term, ()):
            weights.setdefault(related, 0.5)
    terms = list(weights)
    corpus = []
    for document in documents:
        if document.status != "processed" or (types and document.document_type not in types):
            continue
        last_page = math.ceil(len(load_pages(document)) * front_share) if front_share else None
        for passage in _chunks(document):
            if last_page and passage["page"] > last_page:
                continue
            words = _terms(passage["text"])
            corpus.append({"document": document, **passage, "words": Counter(words), "length": len(words)})
    if not corpus:
        return []

    average = sum(c["length"] for c in corpus) / len(corpus)
    frequency = Counter(term for c in corpus for term in set(terms) if term in c["words"])
    k1, b = 1.4, 0.75

    def score(entry: dict) -> float:
        total = 0.0
        for term in set(terms):
            count = entry["words"].get(term, 0)
            if count:
                idf = math.log(1 + (len(corpus) - frequency[term] + 0.5) / (frequency[term] + 0.5))
                total += weights[term] * idf * count * (k1 + 1) / (count + k1 * (1 - b + b * entry["length"] / (average or 1)))
        return total

    ranked = sorted(((score(c), c) for c in corpus), key=lambda pair: -pair[0])
    results, seen = [], Counter()
    for value, entry in ranked:
        if value <= 0 or len(results) >= limit:
            break
        document = entry["document"]
        if per_document and seen[document.id] >= per_document:
            continue
        seen[document.id] += 1
        results.append(as_source(document, entry["page"], entry["text"]))
    return results


def search_many(documents: list[SourceDocument], queries: tuple[str, ...], limit: int, **options) -> list[dict]:
    """Takes turns across several narrow searches, because one broad query favours whichever page repeats its words."""
    ranked = [search(documents, query, limit=limit, **options) for query in queries]
    merged, seen = [], set()
    for position in range(limit):
        for results in ranked:
            if position < len(results):
                source = results[position]
                key = (source["document_id"], source["page"])
                if key not in seen and len(merged) < limit:
                    seen.add(key)
                    merged.append(source)
    return merged


def as_source(document: SourceDocument, page: int, text: str) -> dict:
    return {
        "document_id": document.id,
        "title": document.title,
        "type": document.document_type,
        "period": document.financial_period,
        "page": page,
        "text": text,
        "url": page_url(document, page),
    }


def guidance_sentences(documents: list[SourceDocument], limit: int = 14) -> list[dict]:
    """Forward-looking sentences with a number in them, found by pattern. Used when there's no model."""
    found = []
    transcripts = [d for d in documents if d.document_type in COMMENTARY_TYPES and d.status == "processed"]
    # A share for each call, so the first transcript can't fill the whole list.
    per_call = max(2, math.ceil(limit / max(1, len(transcripts))))
    for document in transcripts:
        from_this_call = 0
        for number, text in enumerate(load_pages(document), start=1):
            flat = re.sub(r"\s+", " ", text)
            for sentence in re.split(r"(?<=[.?!])\s+(?=[A-Z])", flat):
                # Questions are analysts asking, not management committing.
                is_question = sentence.rstrip().endswith("?") or sentence.lstrip().lower().startswith(("sir", "so, safe to assume"))
                if 40 <= len(sentence) <= 320 and not is_question and re.search(r"\d", sentence) and GUIDANCE_PATTERN.search(sentence):
                    if from_this_call < per_call:
                        from_this_call += 1
                        found.append({**as_source(document, number, sentence), "quote": sentence})
    return found[:limit]


def _normalize_text(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (text or "").lower()).strip()


def find_quote(quote: str, pages: list[str]) -> Optional[tuple[int, str]]:
    """The page a quote is on, and the document's own words for it.

    An exact match, ignoring line breaks and punctuation, comes first. Failing that, a sentence that is
    nearly identical is accepted, because models tidy up spoken transcripts. Either way, what's shown
    is the document's text, never the model's version of it.
    """
    target = _normalize_text(quote)
    if len(target) < 15:
        return None
    for number, page in enumerate(pages, start=1):
        if target in _normalize_text(page):
            return number, quote
    best = (0.0, None, None)
    for number, page in enumerate(pages, start=1):
        sentences = re.split(r"(?<=[.?!])\s+", re.sub(r"\s+", " ", page))
        candidates = sentences + [" ".join(pair) for pair in zip(sentences, sentences[1:])]
        for candidate in candidates:
            normalized = _normalize_text(candidate)
            if abs(len(normalized) - len(target)) > len(target) * 0.25:
                continue
            matcher = difflib.SequenceMatcher(None, target, normalized, autojunk=False)
            if matcher.quick_ratio() < QUOTE_SIMILARITY:
                continue
            ratio = matcher.ratio()
            if ratio > best[0]:
                best = (ratio, number, candidate.strip())
    if best[0] >= QUOTE_SIMILARITY:
        return best[1], best[2]
    return None


def quote_is_real(quote: str, pages: list[str]) -> Optional[int]:
    found = find_quote(quote, pages)
    return found[0] if found else None
