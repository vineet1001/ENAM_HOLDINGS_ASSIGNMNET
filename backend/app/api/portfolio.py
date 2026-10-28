"""Portfolio and Company API endpoints."""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, and_, or_, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.database import get_db
from app.models.company import Company, PortfolioMembership
from app.models.price import PriceBar
from app.models.announcement import Announcement, AnnouncementClassification
from app.models.alert import AlertEvent
from app.schemas.schemas import (
    CompanyResponse, CompanyCreate, CompanySearchResult,
    PortfolioAddRequest, PortfolioResponse, PriceBarResponse, PriceDataResponse
)
from app.services.financial_calc import pct_change

router = APIRouter(prefix="/api", tags=["portfolio"])


@router.get("/portfolio", response_model=PortfolioResponse)
async def get_portfolio(db: AsyncSession = Depends(get_db)):
    """Get all portfolio companies with latest market data."""
    result = await db.execute(
        select(Company)
        .join(PortfolioMembership, Company.id == PortfolioMembership.company_id)
        .options(joinedload(Company.portfolio_memberships))
        .order_by(Company.sector, Company.ticker)
    )
    companies = result.unique().scalars().all()
    
    response_companies = []
    sectors = set()
    
    for company in companies:
        # Get latest price
        price_result = await db.execute(
            select(PriceBar)
            .where(PriceBar.company_id == company.id)
            .order_by(PriceBar.date.desc())
            .limit(2)
        )
        prices = price_result.scalars().all()
        
        latest_price = None
        daily_change = None
        price_date = None
        if prices:
            latest_price = prices[0].close
            price_date = str(prices[0].date)
            if len(prices) > 1:
                daily_change = pct_change(prices[0].close, prices[1].close)
        
        # Get latest announcement
        ann_result = await db.execute(
            select(Announcement.title)
            .where(Announcement.company_id == company.id)
            .order_by(Announcement.filing_date.desc())
            .limit(1)
        )
        latest_ann = ann_result.scalar_one_or_none()
        
        # Get unacknowledged alert count
        alert_result = await db.execute(
            select(func.count(AlertEvent.id))
            .where(
                AlertEvent.company_id == company.id,
                AlertEvent.is_acknowledged == False
            )
        )
        alert_count = alert_result.scalar_one()
        
        pm = company.portfolio_memberships[0] if company.portfolio_memberships else None
        
        if company.sector:
            sectors.add(company.sector)
        
        response_companies.append(CompanyResponse(
            id=company.id,
            ticker=company.ticker,
            name=company.name,
            sector=company.sector,
            industry=company.industry,
            exchange=company.exchange,
            yahoo_symbol=company.yahoo_symbol,
            market_cap_category=company.market_cap_category,
            is_active=company.is_active,
            created_at=company.created_at,
            updated_at=company.updated_at,
            in_portfolio=True,
            is_watchlist=pm.is_watchlist if pm else False,
            latest_price=latest_price,
            daily_change_pct=round(daily_change, 2) if daily_change else None,
            latest_price_date=price_date,
            alert_count=alert_count,
            latest_announcement=latest_ann,
        ))
    
    return PortfolioResponse(
        companies=response_companies,
        total=len(response_companies),
        sectors=sorted(sectors),
        last_updated=datetime.utcnow()
    )


@router.post("/portfolio")
async def add_to_portfolio(req: PortfolioAddRequest, db: AsyncSession = Depends(get_db)):
    """Add a company to the portfolio."""
    # Find the company
    result = await db.execute(
        select(Company).where(Company.ticker == req.ticker.upper())
    )
    company = result.scalar_one_or_none()
    
    if not company:
        raise HTTPException(status_code=404, detail=f"Company with ticker '{req.ticker}' not found")
    
    # Check if already in portfolio
    existing = await db.execute(
        select(PortfolioMembership).where(
            PortfolioMembership.company_id == company.id
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"'{req.ticker}' is already in the portfolio")
    
    pm = PortfolioMembership(
        company_id=company.id,
        portfolio_name="default",
        is_watchlist=req.is_watchlist,
        added_at=datetime.utcnow()
    )
    db.add(pm)
    await db.flush()
    
    return {"message": f"Added {req.ticker} to portfolio", "company_id": company.id}


@router.delete("/portfolio/{ticker}")
async def remove_from_portfolio(ticker: str, db: AsyncSession = Depends(get_db)):
    """Remove a company from the portfolio."""
    result = await db.execute(
        select(Company).where(Company.ticker == ticker.upper())
    )
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail=f"Company '{ticker}' not found")
    
    await db.execute(
        delete(PortfolioMembership).where(
            PortfolioMembership.company_id == company.id
        )
    )
    return {"message": f"Removed {ticker} from portfolio"}


@router.get("/companies/search")
async def search_companies(
    q: str = Query(..., min_length=1),
    db: AsyncSession = Depends(get_db)
):
    """Search companies by ticker or name."""
    search = f"%{q.upper()}%"
    result = await db.execute(
        select(Company).where(
            or_(
                Company.ticker.ilike(search),
                Company.name.ilike(f"%{q}%")
            )
        ).limit(20)
    )
    companies = result.scalars().all()
    
    # Check portfolio membership
    response = []
    for c in companies:
        pm_result = await db.execute(
            select(PortfolioMembership).where(
                PortfolioMembership.company_id == c.id
            )
        )
        in_portfolio = pm_result.scalar_one_or_none() is not None
        
        response.append(CompanySearchResult(
            ticker=c.ticker,
            name=c.name,
            sector=c.sector,
            exchange=c.exchange,
            in_portfolio=in_portfolio
        ))
    
    return {"results": response, "total": len(response)}


@router.get("/companies/{ticker}")
async def get_company(ticker: str, db: AsyncSession = Depends(get_db)):
    """Get company details."""
    result = await db.execute(
        select(Company).where(Company.ticker == ticker.upper())
    )
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail=f"Company '{ticker}' not found. Use /companies/search to find supported tickers.")
    
    # Get latest prices
    price_result = await db.execute(
        select(PriceBar)
        .where(PriceBar.company_id == company.id)
        .order_by(PriceBar.date.desc())
        .limit(2)
    )
    prices = price_result.scalars().all()
    
    latest_price = prices[0].close if prices else None
    daily_change = None
    price_date = None
    if len(prices) >= 2:
        daily_change = pct_change(prices[0].close, prices[1].close)
        price_date = str(prices[0].date)
    elif prices:
        price_date = str(prices[0].date)
    
    # Portfolio membership
    pm_result = await db.execute(
        select(PortfolioMembership).where(PortfolioMembership.company_id == company.id)
    )
    pm = pm_result.scalar_one_or_none()
    
    # Alert count
    alert_result = await db.execute(
        select(func.count(AlertEvent.id)).where(
            AlertEvent.company_id == company.id,
            AlertEvent.is_acknowledged == False
        )
    )
    alert_count = alert_result.scalar_one()
    
    return CompanyResponse(
        id=company.id,
        ticker=company.ticker,
        name=company.name,
        sector=company.sector,
        industry=company.industry,
        exchange=company.exchange,
        yahoo_symbol=company.yahoo_symbol,
        market_cap_category=company.market_cap_category,
        is_active=company.is_active,
        created_at=company.created_at,
        updated_at=company.updated_at,
        in_portfolio=pm is not None,
        is_watchlist=pm.is_watchlist if pm else False,
        latest_price=latest_price,
        daily_change_pct=round(daily_change, 2) if daily_change else None,
        latest_price_date=price_date,
        alert_count=alert_count,
    )


@router.get("/companies/{ticker}/prices")
async def get_company_prices(
    ticker: str,
    days: int = Query(60, ge=1, le=365),
    db: AsyncSession = Depends(get_db)
):
    """Get EOD price history for a company."""
    result = await db.execute(
        select(Company).where(Company.ticker == ticker.upper())
    )
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail=f"Company '{ticker}' not found")
    
    price_result = await db.execute(
        select(PriceBar)
        .where(PriceBar.company_id == company.id)
        .order_by(PriceBar.date.desc())
        .limit(days)
    )
    prices = price_result.scalars().all()
    prices.reverse()  # Chronological order
    
    # Calculate daily changes
    price_responses = []
    for i, p in enumerate(prices):
        change = None
        if i > 0:
            change = pct_change(p.close, prices[i-1].close)
        price_responses.append(PriceBarResponse(
            date=p.date,
            open=p.open,
            high=p.high,
            low=p.low,
            close=p.close,
            adj_close=p.adj_close,
            volume=p.volume,
            source=p.source,
            is_demo=p.is_demo,
            daily_change_pct=round(change, 2) if change else None
        ))
    
    latest = price_responses[-1] if price_responses else None
    is_stale = False
    freshness = "No data available"
    
    if prices:
        from datetime import date as dt_date
        days_old = (dt_date.today() - prices[-1].date).days
        if days_old > 3:
            is_stale = True
            freshness = f"Data is {days_old} days old (last: {prices[-1].date})"
        else:
            freshness = f"Latest: {prices[-1].date} ({prices[-1].source})"
    
    return PriceDataResponse(
        ticker=ticker.upper(),
        prices=price_responses,
        latest=latest,
        data_freshness=freshness,
        is_stale=is_stale
    )

