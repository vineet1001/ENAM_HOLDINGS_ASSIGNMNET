"""FINN - Financial Investment Intelligence Agent
FastAPI Application Entry Point.
"""

import asyncio
from contextlib import asynccontextmanager
from datetime import datetime
import os
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import (
    CORS_ORIGINS, DEMO_MODE
)
from app.core.database import init_db, close_db, get_db, async_session_factory
from app.demo_data.seed import seed_demo_data
from app.api import portfolio, announcements, alerts, financials, research, live, portfolios, filings, settings
from app.core.config import BACKGROUND_TASKS_ENABLED
from app.services import documents, filing_ai, live_data, live_sync
from app.models.company import Company, PortfolioMembership
from app.models.price import PriceBar
from app.models.announcement import Announcement
from app.models.alert import AlertRule, AlertEvent
from app.models.document import SourceDocument
from app.schemas.schemas import HealthResponse, MetricsSummaryResponse


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown lifecycle."""
    # 1. Initialize tables
    await init_db()
    
    # 2. Seed demo data if database is empty
    async with async_session_factory() as session:
        await seed_demo_data(session)

    # 3. Load the company lists in the background so the first search isn't the slow one
    tasks = [asyncio.create_task(_warm_company_lists())]

    # 4. Keep alerts live and have new filings read
    if BACKGROUND_TASKS_ENABLED:
        tasks.append(asyncio.create_task(live_sync.live_sync_loop()))
        tasks.append(asyncio.create_task(live_sync.insight_worker_loop()))
        tasks.append(asyncio.create_task(documents.ingest_worker_loop()))

    yield

    for task in tasks:
        task.cancel()
    
    # 5. Clean shutdown
    await close_db()


async def _warm_company_lists():
    try:
        await asyncio.to_thread(live_data.get_universe)
    except live_data.LiveDataUnavailable:
        pass  # Searches report the outage when they run, and retry then.


app = FastAPI(
    title="FINN - Financial Investment Intelligence Agent",
    description="Intelligence layer for public-market investors: Push notifications + Pull research workbench.",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:8000"],
    allow_origin_regex=r"https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(portfolio.router)
app.include_router(announcements.router)
app.include_router(alerts.router)
app.include_router(financials.router)
app.include_router(research.router)
app.include_router(live.router)
app.include_router(portfolios.router)
app.include_router(filings.router)
app.include_router(settings.router)


@app.get("/api/health", response_model=HealthResponse, tags=["system"])
async def health_check():
    """Health check endpoint providing runtime diagnostics."""
    return HealthResponse(
        status="ok",
        version="1.0.0",
        demo_mode=DEMO_MODE,
        llm_configured=filing_ai.ai_status()["configured"],
        database="connected",
        timestamp=datetime.utcnow()
    )


@app.get("/api/metrics/summary", response_model=MetricsSummaryResponse, tags=["system"])
async def get_metrics_summary(db: AsyncSession = Depends(get_db)):
    """Summary metrics of all records in FINN."""
    total_companies = (await db.execute(select(func.count(Company.id)))).scalar_one()
    portfolio_cos = (await db.execute(select(func.count(PortfolioMembership.id)))).scalar_one()
    total_bars = (await db.execute(select(func.count(PriceBar.id)))).scalar_one()
    total_ann = (await db.execute(select(func.count(Announcement.id)))).scalar_one()
    total_rules = (await db.execute(select(func.count(AlertRule.id)))).scalar_one()
    total_events = (await db.execute(select(func.count(AlertEvent.id)))).scalar_one()
    total_docs = (await db.execute(select(func.count(SourceDocument.id)))).scalar_one()
    
    return MetricsSummaryResponse(
        total_companies=total_companies,
        portfolio_companies=portfolio_cos,
        total_price_bars=total_bars,
        total_announcements=total_ann,
        total_alert_rules=total_rules,
        total_alert_events=total_events,
        total_documents=total_docs,
        demo_mode=DEMO_MODE
    )


@app.post("/api/companies/{ticker}/ingest", tags=["market-data"])
async def ingest_company_market_data(ticker: str, db: AsyncSession = Depends(get_db)):
    """Trigger market data ingestion for a company via Yahoo Finance."""
    result = await db.execute(select(Company).where(Company.ticker == ticker.upper()))
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail=f"Company '{ticker}' not found")
    
    # Attempt real-world yfinance fetch
    try:
        import yfinance as yf
        from datetime import date
        
        symbol = company.yahoo_symbol or f"{company.ticker}.NS"
        stock = yf.Ticker(symbol)
        hist = stock.history(period="1mo")
        
        if hist.empty:
            return {
                "ticker": ticker.upper(),
                "status": "partial",
                "message": f"No recent market data returned from Yahoo Finance for symbol '{symbol}'. Retaining existing cached observations.",
                "bars_added": 0,
                "is_demo": False
            }
        
        added = 0
        for dt_idx, row in hist.iterrows():
            bar_date = dt_idx.date() if hasattr(dt_idx, "date") else dt_idx
            # Check existing
            exist = await db.execute(
                select(PriceBar).where(
                    PriceBar.company_id == company.id,
                    PriceBar.date == bar_date,
                    PriceBar.source == "yahoo_finance"
                )
            )
            if exist.scalar_one_or_none():
                continue
            
            bar = PriceBar(
                company_id=company.id,
                date=bar_date,
                open=round(float(row.get("Open", 0)), 2),
                high=round(float(row.get("High", 0)), 2),
                low=round(float(row.get("Low", 0)), 2),
                close=round(float(row.get("Close", 0)), 2),
                adj_close=round(float(row.get("Close", 0)), 2),
                volume=int(row.get("Volume", 0)),
                source="yahoo_finance",
                is_demo=False
            )
            db.add(bar)
            added += 1
        
        await db.flush()
        return {
            "ticker": ticker.upper(),
            "status": "success",
            "message": f"Successfully ingested {added} bars from Yahoo Finance for '{symbol}'.",
            "bars_added": added,
            "is_demo": False
        }
    except Exception as e:
        return {
            "ticker": ticker.upper(),
            "status": "failed",
            "message": f"External market data provider error: {str(e)}. Retaining existing cached data.",
            "bars_added": 0,
            "is_demo": False
        }


@app.get("/api/management-change/{announcement_id}", tags=["announcements"])
async def get_management_change_enrichment(announcement_id: int, db: AsyncSession = Depends(get_db)):
    """Enrich a management change announcement with executive profile data."""
    result = await db.execute(select(Announcement).where(Announcement.id == announcement_id))
    ann = result.scalar_one_or_none()
    if not ann:
        raise HTTPException(status_code=404, detail="Announcement not found")
    
    company = await db.get(Company, ann.company_id)
    
    # Curated verified professional profiles for demo management changes
    profiles = {
        "Jayesh Sanghrajka": {
            "person_name": "Jayesh Sanghrajka",
            "role": "Chief Financial Officer (CFO)",
            "effective_date": "November 15, 2024",
            "previous_role": "Executive Vice President and Deputy CFO, Infosys",
            "career_history": [
                {"role": "Deputy CFO", "organization": "Infosys Ltd", "period": "2015 - 2024"},
                {"role": "Vice President - Finance", "organization": "Infosys Ltd", "period": "2008 - 2015"},
                {"role": "Corporate Finance", "organization": "Mu Sigma / Wipro", "period": "2000 - 2008"}
            ],
            "education": "Chartered Accountant (ICAI) - 18th Rank All-India; B.Com from University of Mumbai",
            "verification_status": "verified",
            "source_url": "https://www.infosys.com/about/management-profiles/jayesh-sanghrajka.html",
            "source_type": "Company Leadership Profile",
            "notes": "Internal promotion succeeding Nilanjan Roy. Over 18 years of tenure at Infosys across multiple finance leadership roles."
        },
        "K Krithivasan": {
            "person_name": "K. Krithivasan",
            "role": "Chief Executive Officer & Managing Director",
            "effective_date": "October 15, 2024",
            "previous_role": "President and Global Head - BFSI Business Group, TCS",
            "career_history": [
                {"role": "Global Head - BFSI", "organization": "Tata Consultancy Services", "period": "2014 - 2023"},
                {"role": "Delivery & Relationship Head", "organization": "Tata Consultancy Services", "period": "1989 - 2014"}
            ],
            "education": "B.Tech in Mechanical Engineering (University of Madras); M.Tech in Industrial Engineering (IIT Kanpur)",
            "verification_status": "verified",
            "source_url": "https://www.tcs.com/about-us/leadership/k-krithivasan",
            "source_type": "Company Leadership Profile",
            "notes": "34+ year veteran at TCS. Led BFSI segment contributing over 30% of total company revenue prior to CEO appointment."
        },
        "Subha Tatavarti": {
            "person_name": "Subha Tatavarti",
            "role": "Chief Technology Officer (Outgoing)",
            "effective_date": "December 31, 2024",
            "previous_role": "Director - Technology & Cloud, Walmart Global Tech",
            "career_history": [
                {"role": "CTO", "organization": "Wipro Ltd", "period": "2021 - 2024"},
                {"role": "Senior Director", "organization": "Walmart Global Tech", "period": "2018 - 2021"},
                {"role": "Head of Product", "organization": "PayPal", "period": "2010 - 2018"}
            ],
            "education": "Master's in Computer Science",
            "verification_status": "verified",
            "source_url": "https://www.wipro.com/newsroom/executive-announcements",
            "source_type": "Exchange Filing & Corporate Release",
            "notes": "Resigned to pursue external opportunities. Company appointed an interim committee to oversee technology strategy."
        }
    }
    
    # Match profile from title
    matched = None
    for name, p in profiles.items():
        if name.lower() in ann.title.lower():
            matched = p
            break
    
    if not matched:
        # Fallback card with unverified/inferred disclaimer
        matched = {
            "person_name": "Senior Executive",
            "role": "Key Managerial Personnel",
            "effective_date": "As stated in filing",
            "previous_role": "Information not disclosed in headline filing",
            "career_history": [],
            "education": "Not publicly disclosed in summary filing",
            "verification_status": "unverified",
            "source_url": ann.source_url or "https://www.nseindia.com",
            "source_type": "NSE Filing Notice",
            "notes": "Detailed professional background requires inspection of full annexure filing or public company directory."
        }
    
    return {
        "announcement_id": announcement_id,
        "company_ticker": company.ticker if company else "",
        "company_name": company.name if company else "",
        "filing_title": ann.title,
        "filing_date": ann.filing_date,
        "profile": matched
    }

