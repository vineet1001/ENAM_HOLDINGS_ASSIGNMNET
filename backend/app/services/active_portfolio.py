"""Which companies the app is currently following."""
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.company import Company, PortfolioMembership
from app.models.custom_portfolio import CustomPortfolio, CustomPortfolioHolding
from app.services import live_data


def holding_of(company: Company, weight: Optional[float]) -> dict:
    return {
        "company_id": company.id,
        "ticker": company.ticker,
        "name": company.name,
        "sector": company.sector,
        "yahoo": live_data.yahoo_symbol_for(company.ticker, company.yahoo_symbol),
        "weight": weight,
    }


async def active_portfolio(db: AsyncSession) -> tuple[dict, list[dict]]:
    """The active custom portfolio, or else the mock portfolio."""
    result = await db.execute(
        select(CustomPortfolio)
        .where(CustomPortfolio.is_active == True)  # noqa: E712
        .options(selectinload(CustomPortfolio.holdings).selectinload(CustomPortfolioHolding.company))
    )
    custom = result.scalars().first()
    if custom:
        holdings = [holding_of(h.company, h.weight) for h in custom.holdings]
        return {"id": custom.id, "name": custom.name, "is_custom": True}, holdings

    result = await db.execute(
        select(Company)
        .join(PortfolioMembership, PortfolioMembership.company_id == Company.id)
        .order_by(Company.ticker)
    )
    holdings = [holding_of(company, None) for company in result.scalars().all()]
    return {"id": None, "name": "Mock portfolio", "is_custom": False}, holdings


async def active_company_ids(db: AsyncSession) -> list[int]:
    _, holdings = await active_portfolio(db)
    return [h["company_id"] for h in holdings]
