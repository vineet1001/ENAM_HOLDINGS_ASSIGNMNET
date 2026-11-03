"""Custom portfolios with chosen weights, and lookups across every NSE and BSE listed company."""
import asyncio
from typing import Literal, Optional

import pandas as pd

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.company import Company, PortfolioMembership
from app.models.custom_portfolio import CustomPortfolio, CustomPortfolioHolding
from app.services import live_data
from app.services.portfolio_optimizer import OptimisationError, optimise

router = APIRouter(prefix="/api", tags=["custom-portfolios"])

WEIGHT_TOLERANCE = 0.01

# get_db commits after the response is sent. The page reloads straight after these writes, so each
# one commits first; otherwise that reload can see a half-finished change.


class HoldingInput(BaseModel):
    ticker: str = Field(min_length=1, max_length=20)
    weight: float = Field(gt=0, le=100)


class PortfolioInput(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    holdings: list[HoldingInput] = Field(min_length=1, max_length=100)
    activate: bool = True


class ActivateInput(BaseModel):
    portfolio_id: Optional[int] = None


class OptimiseInput(BaseModel):
    holdings: list[HoldingInput] = Field(min_length=2, max_length=50)
    objective: Literal["max_sharpe", "min_variance"] = "max_sharpe"
    max_weight: float = Field(40, gt=0, le=100)
    risk_free: float = Field(6.5, ge=0, le=20)
    years: int = Field(3, ge=1, le=10)


@router.post("/portfolios/optimise")
async def optimise_portfolio(body: OptimiseInput, db: AsyncSession = Depends(get_db)):
    """Suggested weights from past prices. Nothing is saved; the builder applies them if asked."""
    symbols: dict[str, str] = {}
    current: dict[str, float] = {}
    for holding in body.holdings:
        company = await ensure_company(db, holding.ticker)
        symbols[company.ticker] = live_data.yahoo_symbol_for(company.ticker, company.yahoo_symbol)
        current[company.ticker] = current.get(company.ticker, 0.0) + holding.weight
    await db.commit()
    try:
        history = (await asyncio.to_thread(live_data.get_history, sorted(set(symbols.values()))))[0]
    except live_data.LiveDataUnavailable as exc:
        raise HTTPException(status_code=503, detail=f"Yahoo Finance is unavailable: {exc}")

    frame = pd.DataFrame({ticker: history[symbol] for ticker, symbol in symbols.items() if symbol in history.columns})
    no_prices = [t for t in symbols if t not in frame.columns]
    if not frame.empty:
        frame = frame[frame.index >= frame.index[-1] - pd.DateOffset(years=body.years)]
    # A stock listed partway through would cut everyone's history short, so it's left out instead.
    complete = frame.dropna(axis=1, thresh=int(len(frame) * 0.9)) if len(frame) else frame
    too_new = [t for t in frame.columns if t not in complete.columns]
    try:
        result = optimise(complete, body.objective, body.max_weight / 100, body.risk_free / 100, current)
    except OptimisationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    result["left_out"] = [{"ticker": t, "reason": "no price history"} for t in no_prices] + [
        {"ticker": t, "reason": f"less than {body.years} years of prices"} for t in too_new
    ]
    result["objective"] = body.objective
    return result


async def ensure_company(db: AsyncSession, ticker: str) -> Company:
    """Find a company, adding it from the NSE or BSE company list the first time it is used."""
    symbol = ticker.strip().upper()
    existing = (await db.execute(select(Company).where(Company.ticker == symbol))).scalar_one_or_none()
    if existing:
        return existing

    try:
        listed = await asyncio.to_thread(live_data.find_listed_company, symbol)
    except live_data.LiveDataUnavailable as exc:
        raise HTTPException(status_code=503, detail=f"The NSE and BSE company lists are unavailable: {exc}")
    if not listed:
        raise HTTPException(status_code=404, detail=f"'{symbol}' isn't a listed NSE or BSE company")

    # The same security may already be stored under another of its symbols.
    existing = (await db.execute(select(Company).where(Company.ticker == listed["ticker"]))).scalar_one_or_none()
    if existing:
        return existing

    company = Company(
        ticker=listed["ticker"],
        name=listed["name"],
        exchange=listed["exchanges"][0],
        yahoo_symbol=listed["yahoo_symbol"],
        is_active=True,
    )
    db.add(company)
    await db.flush()
    return company


def _serialize(portfolio: CustomPortfolio) -> dict:
    return {
        "id": portfolio.id,
        "name": portfolio.name,
        "is_active": portfolio.is_active,
        "holdings": sorted(
            (
                {
                    "ticker": h.company.ticker,
                    "name": h.company.name,
                    "exchange": h.company.exchange,
                    "weight": h.weight,
                }
                for h in portfolio.holdings
            ),
            key=lambda h: -h["weight"],
        ),
    }


async def _load_portfolio(db: AsyncSession, portfolio_id: int) -> CustomPortfolio:
    result = await db.execute(
        select(CustomPortfolio)
        .where(CustomPortfolio.id == portfolio_id)
        .options(selectinload(CustomPortfolio.holdings).selectinload(CustomPortfolioHolding.company))
        .execution_options(populate_existing=True)
    )
    portfolio = result.scalar_one_or_none()
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    return portfolio


async def _resolve_holdings(db: AsyncSession, body: PortfolioInput) -> list[tuple[Company, float]]:
    """Check the name and weights, then look up every company. Nothing is written if a check fails."""
    if not body.name.strip():
        raise HTTPException(status_code=422, detail="Give the portfolio a name")

    total = sum(h.weight for h in body.holdings)
    if abs(total - 100) > WEIGHT_TOLERANCE:
        raise HTTPException(status_code=422, detail=f"Weights must add up to 100%, but they add up to {total:.2f}%")

    resolved: dict[int, tuple[Company, float]] = {}
    for holding in body.holdings:
        company = await ensure_company(db, holding.ticker)
        if company.id in resolved:
            raise HTTPException(status_code=422, detail=f"{company.ticker} is in the portfolio twice")
        resolved[company.id] = (company, holding.weight)
    return list(resolved.values())


async def _activate(db: AsyncSession, portfolio_id: Optional[int]) -> None:
    await db.execute(update(CustomPortfolio).values(is_active=False))
    if portfolio_id is not None:
        await db.execute(
            update(CustomPortfolio).where(CustomPortfolio.id == portfolio_id).values(is_active=True)
        )


async def _name_taken(db: AsyncSession, name: str, ignore_id: Optional[int] = None) -> bool:
    query = select(CustomPortfolio.id).where(CustomPortfolio.name == name)
    if ignore_id is not None:
        query = query.where(CustomPortfolio.id != ignore_id)
    return (await db.execute(query)).first() is not None


@router.get("/universe/search")
async def search_listed_companies(q: str = Query(..., min_length=1, max_length=60)):
    """Search every company listed on NSE or BSE by symbol, scrip code, ISIN or name."""
    try:
        results = await asyncio.to_thread(live_data.search_universe, q)
    except live_data.LiveDataUnavailable as exc:
        raise HTTPException(status_code=503, detail=f"The NSE and BSE company lists are unavailable: {exc}")
    return {
        "results": [
            {
                "ticker": c["ticker"],
                "name": c["name"],
                "exchanges": c["exchanges"],
                "nse_symbol": c["nse_symbol"],
                "bse_code": c["bse_code"],
            }
            for c in results
        ],
        "total": len(results),
    }


@router.post("/companies/{ticker}/ensure")
async def ensure_company_exists(ticker: str, db: AsyncSession = Depends(get_db)):
    """Make any listed company available to the rest of the app."""
    company = await ensure_company(db, ticker)
    await db.commit()
    return {"ticker": company.ticker, "name": company.name, "exchange": company.exchange}


@router.get("/portfolios")
async def list_portfolios(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(CustomPortfolio)
        .options(selectinload(CustomPortfolio.holdings).selectinload(CustomPortfolioHolding.company))
        .order_by(CustomPortfolio.name)
    )
    portfolios = result.scalars().all()
    mock_count = len((await db.execute(select(PortfolioMembership.id))).all())
    active = next((p.id for p in portfolios if p.is_active), None)
    return {
        "portfolios": [_serialize(p) for p in portfolios],
        "active_id": active,
        "mock_holdings": mock_count,
    }


@router.post("/portfolios", status_code=201)
async def create_portfolio(body: PortfolioInput, db: AsyncSession = Depends(get_db)):
    name = body.name.strip()
    if await _name_taken(db, name):
        raise HTTPException(status_code=409, detail=f"A portfolio named '{name}' already exists")
    resolved = await _resolve_holdings(db, body)

    portfolio = CustomPortfolio(name=name)
    db.add(portfolio)
    await db.flush()
    for company, weight in resolved:
        db.add(CustomPortfolioHolding(portfolio_id=portfolio.id, company_id=company.id, weight=weight))
    await db.flush()
    if body.activate:
        await _activate(db, portfolio.id)
    saved = _serialize(await _load_portfolio(db, portfolio.id))
    await db.commit()
    return saved


@router.put("/portfolios/{portfolio_id}")
async def update_portfolio(portfolio_id: int, body: PortfolioInput, db: AsyncSession = Depends(get_db)):
    portfolio = await _load_portfolio(db, portfolio_id)
    name = body.name.strip()
    if await _name_taken(db, name, ignore_id=portfolio_id):
        raise HTTPException(status_code=409, detail=f"A portfolio named '{name}' already exists")
    resolved = await _resolve_holdings(db, body)

    portfolio.name = name
    portfolio.holdings.clear()
    await db.flush()
    for company, weight in resolved:
        db.add(CustomPortfolioHolding(portfolio_id=portfolio.id, company_id=company.id, weight=weight))
    await db.flush()
    if body.activate:
        await _activate(db, portfolio.id)
    saved = _serialize(await _load_portfolio(db, portfolio.id))
    await db.commit()
    return saved


@router.delete("/portfolios/{portfolio_id}")
async def delete_portfolio(portfolio_id: int, db: AsyncSession = Depends(get_db)):
    portfolio = await _load_portfolio(db, portfolio_id)
    name = portfolio.name
    await db.delete(portfolio)
    await db.commit()
    return {"message": f"Deleted {name}"}


@router.put("/portfolios-active")
async def set_active_portfolio(body: ActivateInput, db: AsyncSession = Depends(get_db)):
    """Choose which portfolio the app follows; null returns to the mock portfolio."""
    if body.portfolio_id is not None:
        await _load_portfolio(db, body.portfolio_id)
    await _activate(db, body.portfolio_id)
    await db.commit()
    return {"active_id": body.portfolio_id}
