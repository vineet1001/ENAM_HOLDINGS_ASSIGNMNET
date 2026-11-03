"""Keeps alerts live: stores real filings and prices, runs the rules, and has new filings read."""
import asyncio
import logging
from datetime import date, datetime, timedelta
from typing import Optional

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import config
from app.core.database import async_session_factory
from app.models.alert import AlertEvent
from app.models.announcement import Announcement, AnnouncementClassification
from app.models.company import Company
from app.models.filing_insight import FilingInsight
from app.models.price import PriceBar
from app.services import filing_ai, live_data, notifications
from app.services.alert_settings import stored_preferences
from app.services.active_portfolio import active_portfolio
from app.services.alert_engine import evaluate_all_alerts

logger = logging.getLogger("finn.live_sync")

BAR_HISTORY_SESSIONS = 40
IDLE_SECONDS = 20

_last_sync: Optional[dict] = None
_upserted_copies: set[tuple[str, float]] = set()
_lock: Optional[asyncio.Lock] = None
_lock_loop = None


def last_sync() -> Optional[dict]:
    return _last_sync


def _writer_lock() -> asyncio.Lock:
    """Page loads and the background sync can store the same filings at once, so writers take turns."""
    global _lock, _lock_loop
    loop = asyncio.get_running_loop()
    if _lock is None or _lock_loop is not loop:
        _lock, _lock_loop = asyncio.Lock(), loop
    return _lock


async def store_filings(db: AsyncSession, company_ids: dict[str, int], filings: list[dict]) -> int:
    """Save real filings so rules can fire on them. Existing rows are left as they are."""
    if not filings:
        return 0
    earliest = min(datetime.fromisoformat(f["filed_at"]).replace(tzinfo=None) for f in filings)
    rows = await db.execute(
        select(Announcement.company_id, Announcement.title, Announcement.filing_date)
        .where(Announcement.company_id.in_(company_ids.values()), Announcement.filing_date >= earliest)
    )
    existing = {tuple(row) for row in rows.all()}

    added = 0
    for filing in filings:
        company_id = company_ids.get(filing["ticker"])
        if company_id is None:
            continue
        filed_at = datetime.fromisoformat(filing["filed_at"]).replace(tzinfo=None)
        title = filing["title"][:500]
        key = (company_id, title, filed_at)
        if key in existing:
            continue
        existing.add(key)
        announcement = Announcement(
            company_id=company_id,
            title=title,
            exchange=filing["exchange"],
            category=filing["category"],
            filing_date=filed_at,
            source_url=filing["pdf_url"],
            priority_score=filing["priority_score"],
            is_demo=False,
            status="new",
        )
        announcement.classification = AnnouncementClassification(
            category=filing["category"],
            confidence=filing["confidence"],
            explanation=f"From the exchange's label '{filing['nse_category']}', or keyword rules if it was vague.",
            method="exchange",
        )
        db.add(announcement)
        added += 1
    await db.flush()
    return added


async def ensure_filings_stored(db: AsyncSession, holdings: list[dict], payload: dict, fetched_at: float) -> None:
    """Called when the feed is read, and skipped when this copy of it has already been stored."""
    key = (",".join(sorted(h["ticker"] for h in holdings)), fetched_at)
    if key in _upserted_copies:
        return
    async with _writer_lock():
        await db.commit()  # Start from the latest rows, in case another writer just finished.
        await store_filings(db, {h["ticker"]: h["company_id"] for h in holdings}, payload["filings"])
        await db.commit()
    _upserted_copies.add(key)


async def store_price_bars(db: AsyncSession, holdings: list[dict], closes, volumes) -> int:
    """Save recent real closes and volumes, which the price and volume rules read."""
    added = 0
    for holding in holdings:
        symbol = holding["yahoo"]
        if symbol not in closes.columns:
            continue
        series = closes[symbol].dropna().tail(BAR_HISTORY_SESSIONS)
        if series.empty:
            continue
        rows = await db.execute(
            select(PriceBar).where(
                PriceBar.company_id == holding["company_id"],
                PriceBar.date >= series.index[0].date(),
            )
        )
        known = {bar.date: bar for bar in rows.scalars().all()}
        for stamp, close in series.items():
            bar_date: date = stamp.date()
            volume = volumes[symbol].get(stamp) if symbol in volumes.columns else None
            value = round(float(close), 2)
            shares = 0 if volume is None or volume != volume else int(volume)
            bar = known.get(bar_date)
            if bar is not None:
                # After a split or bonus, Yahoo restates past prices. Keeping the old figures would make
                # the next day look like a crash and raise a false alert, so stored bars follow Yahoo.
                if not bar.is_demo and (abs(bar.close - value) > 0.005 or (shares and bar.volume != shares)):
                    bar.open = bar.high = bar.low = bar.close = bar.adj_close = value
                    if shares:
                        bar.volume = shares
                continue
            db.add(PriceBar(
                company_id=holding["company_id"],
                date=bar_date,
                open=value, high=value, low=value, close=value, adj_close=value,
                volume=0 if volume is None or volume != volume else int(volume),
                source="yahoo_finance",
                is_demo=False,
            ))
            added += 1
    await db.flush()
    return added


async def sync_live_alerts() -> dict:
    """One pass: fetch filings and prices, store them, then evaluate the rules."""
    global _last_sync
    errors: list[str] = []
    filings_added = bars_added = 0
    filings: list[dict] = []
    closes = volumes = None

    async with async_session_factory() as db:
        _, holdings = await active_portfolio(db)

    # The slow network part happens before the lock, so it never holds up other requests.
    if holdings:
        try:
            payload, _, _ = await asyncio.to_thread(
                live_data.get_filings, [(h["ticker"], h["name"], h["yahoo"]) for h in holdings]
            )
            filings = payload["filings"]
            if payload["failed"]:
                errors.append(f"No filings returned for: {', '.join(payload['failed'])}")
        except live_data.LiveDataUnavailable as exc:
            errors.append(f"Filings unavailable: {exc}")
        try:
            symbols = [h["yahoo"] for h in holdings]
            closes = (await asyncio.to_thread(live_data.get_closes, symbols))[0]
            volumes = (await asyncio.to_thread(live_data.get_volumes, symbols))[0]
        except live_data.LiveDataUnavailable as exc:
            errors.append(f"Prices unavailable: {exc}")

    async with _writer_lock():
        async with async_session_factory() as db:
            filings_added = await store_filings(db, {h["ticker"]: h["company_id"] for h in holdings}, filings)
            if closes is not None:
                bars_added = await store_price_bars(db, holdings, closes, volumes)
            evaluation = await evaluate_all_alerts(db)
            await db.commit()

    _last_sync = {
        "at": datetime.utcnow().isoformat() + "Z",
        "filings_added": filings_added,
        "bars_added": bars_added,
        "alerts_triggered": evaluation["total_triggered"],
        "errors": errors,
    }
    await notifications.notify_new_alerts(evaluation)
    return {**_last_sync, **evaluation}


def _unread_filter():
    return or_(
        FilingInsight.id.is_(None),
        and_(
            FilingInsight.status.in_(("pending", "failed")),
            FilingInsight.attempts < filing_ai.MAX_ATTEMPTS,
        ),
    )


async def count_unread(db: AsyncSession) -> int:
    rows = await db.execute(
        select(Announcement.source_url)
        .join(AlertEvent, AlertEvent.related_announcement_id == Announcement.id)
        .outerjoin(FilingInsight, FilingInsight.pdf_url == Announcement.source_url)
        .where(Announcement.is_demo == False, Announcement.source_url.is_not(None), _unread_filter())  # noqa: E712
    )
    return len({row[0] for row in rows.all()})


async def read_next_filing() -> bool:
    """Write the headline for the newest alerted filing not read yet. Returns False when none are left."""
    async with async_session_factory() as db:
        row = (await db.execute(
            select(Announcement, Company.name)
            .join(AlertEvent, AlertEvent.related_announcement_id == Announcement.id)
            .join(Company, Company.id == Announcement.company_id)
            .outerjoin(FilingInsight, FilingInsight.pdf_url == Announcement.source_url)
            .where(Announcement.is_demo == False, Announcement.source_url.is_not(None), _unread_filter())  # noqa: E712
            .order_by(Announcement.filing_date.desc())
            .limit(1)
        )).first()
        if row is None:
            return False
        await filing_ai.generate_headline(db, row[0], row[1])
        return True


async def live_sync_loop() -> None:
    while True:
        minutes = config.LIVE_SYNC_MINUTES
        try:
            await sync_live_alerts()
            async with async_session_factory() as db:
                minutes = (await stored_preferences(db))["sync_minutes"]
        except Exception:
            logger.exception("Live alert sync failed")
        await asyncio.sleep(minutes * 60)


async def insight_worker_loop() -> None:
    """Reads alerted filings one at a time in the background. Idle without a key."""
    while True:
        try:
            if not filing_ai.ai_status()["configured"] or not await read_next_filing():
                await asyncio.sleep(IDLE_SECONDS)
        except filing_ai.AIRateLimited:
            await asyncio.sleep(max(IDLE_SECONDS, filing_ai.ai_status()["paused_seconds"]))
        except filing_ai.AIUnavailable:
            await asyncio.sleep(IDLE_SECONDS * 3)  # The reason is shown on the Alerts page.
        except Exception:
            logger.exception("Filing reader failed")
            await asyncio.sleep(IDLE_SECONDS * 3)
