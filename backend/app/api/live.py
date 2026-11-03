"""Live data endpoints backed by free sources (Yahoo Finance prices, NSE and BSE filings)."""
import asyncio
import logging
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.announcement import Announcement
from app.models.company import Company
from app.services import filing_ai, live_data, live_sync
from app.services.active_portfolio import active_portfolio, holding_of

router = APIRouter(prefix="/api/live", tags=["live-data"])
logger = logging.getLogger("finn.live")

SPARKLINE_POINTS = 30


def _iso_utc(epoch: float) -> str:
    return datetime.fromtimestamp(epoch, tz=timezone.utc).isoformat()


@router.get("/portfolio-history")
async def get_portfolio_history(
    range: Literal["1M", "3M", "6M", "1Y"] = Query("6M"),
    ticker: Optional[str] = Query(None, description="A holding's ticker; omit for the whole portfolio"),
    db: AsyncSession = Depends(get_db)
):
    """The active portfolio's index, or a single holding's closing prices, from Yahoo Finance."""
    portfolio, holdings = await active_portfolio(db)
    if not holdings:
        raise HTTPException(status_code=404, detail="The portfolio is empty")

    selected = ticker.upper() if ticker else None
    by_ticker = {h["ticker"]: h for h in holdings}
    if selected and selected not in by_ticker:
        raise HTTPException(status_code=404, detail=f"'{selected}' is not in the portfolio")

    try:
        closes, fetched_at, is_stale = await asyncio.to_thread(
            live_data.get_closes, [h["yahoo"] for h in holdings]
        )
    except live_data.LiveDataUnavailable as exc:
        raise HTTPException(status_code=503, detail=f"Yahoo Finance is unavailable: {exc}")

    window = live_data.slice_range(closes, range)
    companies = []
    unavailable = []
    for holding in holdings:
        symbol = holding["yahoo"]
        series = window[symbol] if symbol in window.columns else None
        summary = live_data.company_summary(series) if series is not None else None
        if summary is None:
            unavailable.append(holding["ticker"])
        companies.append({
            "ticker": holding["ticker"],
            "name": holding["name"],
            "sector": holding["sector"],
            "symbol": symbol.rsplit(".", 1)[0],
            "exchange": live_data.exchange_of(symbol),
            "weight": holding["weight"],
            "has_data": summary is not None,
            "spark": (
                [round(float(v), 2) for v in series.dropna().tail(SPARKLINE_POINTS)]
                if summary is not None else []
            ),
            **(summary or {
                "latest_close": None, "daily_change_pct": None,
                "range_change_pct": None, "latest_date": None
            }),
        })

    if selected:
        symbol = by_ticker[selected]["yahoo"]
        if symbol not in window.columns or window[symbol].dropna().empty:
            raise HTTPException(status_code=503, detail=f"Yahoo Finance has no prices for {selected} ({symbol})")
        series = window[symbol].dropna()
        unit = "INR"
        method = f"{symbol} closing price"
    else:
        tracked = sorted({h["yahoo"] for h in holdings if h["yahoo"] in window.columns})
        if not tracked:
            raise HTTPException(status_code=503, detail="Yahoo Finance has no prices for any holding")
        weights = None
        if portfolio["is_custom"]:
            weights = {}
            for holding in holdings:
                weights[holding["yahoo"]] = weights.get(holding["yahoo"], 0.0) + holding["weight"]
        series, excluded = live_data.build_portfolio_index(window[tracked], weights)
        symbol_owner = {h["yahoo"]: h["ticker"] for h in holdings}
        unavailable = sorted(set(unavailable) | {symbol_owner[s] for s in excluded})
        unit = "INDEX"
        method = (
            "Your weights invested on the first day shown, starting at 100, then left to move with prices."
            if portfolio["is_custom"]
            else "Equal rupees in each holding on the first day shown, starting at 100."
        ) + " Price only, dividends excluded."
        if portfolio["is_custom"] and unavailable:
            method += " Remaining weights were scaled up to cover holdings with no price data."

    start_value = float(series.iloc[0])
    latest_value = float(series.iloc[-1])
    change = live_data.pct_change(latest_value, start_value)

    return {
        "portfolio": portfolio,
        "view": "company" if selected else "portfolio",
        "ticker": selected,
        "name": by_ticker[selected]["name"] if selected else portfolio["name"],
        "range": range,
        "unit": unit,
        "points": [
            {"date": index.date().isoformat(), "value": round(float(value), 2)}
            for index, value in series.items()
        ],
        "start_value": round(start_value, 2),
        "latest_value": round(latest_value, 2),
        "change_pct": round(change, 2) if change is not None else None,
        "as_of": series.index[-1].date().isoformat(),
        "companies": companies,
        "unavailable": unavailable,
        "method": method,
        "source": "Yahoo Finance",
        "fetched_at": _iso_utc(fetched_at),
        "is_stale": is_stale,
    }


@router.get("/filings")
async def get_live_filings(
    ticker: Optional[str] = Query(None, description="One company; omit for the active portfolio"),
    db: AsyncSession = Depends(get_db)
):
    """Real exchange filings from the last 30 days, each with its original document."""
    if ticker:
        company = (await db.execute(select(Company).where(Company.ticker == ticker.upper()))).scalar_one_or_none()
        if not company:
            raise HTTPException(status_code=404, detail=f"Company '{ticker}' not found")
        holdings = [holding_of(company, None)]
    else:
        _, holdings = await active_portfolio(db)

    try:
        payload, fetched_at, is_stale = await asyncio.to_thread(
            live_data.get_filings, [(h["ticker"], h["name"], h["yahoo"]) for h in holdings]
        )
    except live_data.LiveDataUnavailable as exc:
        raise HTTPException(status_code=503, detail=f"The exchange filings feeds are unavailable: {exc}")

    # Attach each filing's stored id and anything the model has already read from its document.
    try:
        await live_sync.ensure_filings_stored(db, holdings, payload, fetched_at)
    except SQLAlchemyError:
        # Showing filings matters more than saving this copy; the next sync stores them.
        await db.rollback()
        logger.exception("Could not store live filings")
    urls =[f["pdf_url"] for f in payload["filings"] if f["pdf_url"]]
    stored = (await db.execute(
        select(Announcement.source_url, Announcement.id)
        .where(Announcement.source_url.in_(urls), Announcement.is_demo == False)  # noqa: E712
    )).all() if urls else []
    announcement_ids = {url: announcement_id for url, announcement_id in stored}
    insight_by_url = await filing_ai.insight_payloads(db, urls)

    return {
        "filings": [
            {
                **f,
                "announcement_id": announcement_ids.get(f["pdf_url"]),
                "insight": insight_by_url.get(f["pdf_url"]),
            }
            for f in payload["filings"]
        ],
        "failed": payload["failed"],
        "lookback_days": live_data.FILINGS_LOOKBACK_DAYS,
        "source": "NSE and BSE corporate announcements",
        "fetched_at": _iso_utc(fetched_at),
        "is_stale": is_stale,
    }


@router.get("/companies/{ticker}/prices")
async def get_live_company_prices(
    ticker: str,
    days: int = Query(60, ge=1, le=260),
    db: AsyncSession = Depends(get_db)
):
    """Daily prices and volume for one company, from Yahoo Finance."""
    company = (await db.execute(select(Company).where(Company.ticker == ticker.upper()))).scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail=f"Company '{ticker}' not found")

    symbol = live_data.yahoo_symbol_for(company.ticker, company.yahoo_symbol)
    try:
        bars, _, is_stale = await asyncio.to_thread(live_data.get_price_bars, symbol)
    except live_data.LiveDataUnavailable as exc:
        raise HTTPException(status_code=503, detail=f"Yahoo Finance is unavailable: {exc}")

    return {
        "ticker": company.ticker,
        "prices": bars[-days:],
        "latest": bars[-1],
        "data_freshness": f"Yahoo Finance ({symbol})",
        "is_stale": is_stale,
    }
