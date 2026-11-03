"""Financial data and quarterly results API endpoints."""
import asyncio
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.company import Company
from app.models.financial import FinancialPeriod, FinancialMetric, GuidanceStatement
from app.schemas.schemas import (
    QuarterlyComparisonResponse, QuarterlyComparisonRow,
    FinancialMetricResponse, GuidanceStatementResponse
)
from app.services import fundamentals, live_data, screener
from app.services.financial_calc import pct_change, margin, safe_round

router = APIRouter(prefix="/api", tags=["financials"])


async def _get_period_metrics(db: AsyncSession, period_id: int) -> dict[str, float | None]:
    """Get all metrics for a financial period as a dict."""
    result = await db.execute(
        select(FinancialMetric).where(FinancialMetric.financial_period_id == period_id)
    )
    metrics = result.scalars().all()
    return {m.metric_name: m.value for m in metrics}


@router.get("/companies/{ticker}/financials")
async def get_company_financials(
    ticker: str,
    db: AsyncSession = Depends(get_db)
):
    """Get quarterly financial comparison for a company."""
    result = await db.execute(
        select(Company).where(Company.ticker == ticker.upper())
    )
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail=f"Company '{ticker}' not found")
    
    # Real reported numbers first. Seeded sample figures are only a fallback, and are labelled as demo.
    try:
        data = await asyncio.to_thread(screener.get_company_data, company.ticker, company.yahoo_symbol)
    except live_data.LiveDataUnavailable:
        data = None
    if data:
        real = fundamentals.quarterly_comparison(data, company.ticker, company.name)
        if real:
            return real

    # Get all quarterly periods, sorted by fiscal year and quarter descending
    periods_result = await db.execute(
        select(FinancialPeriod)
        .where(
            FinancialPeriod.company_id == company.id,
            FinancialPeriod.period_type == "quarterly"
        )
        .order_by(FinancialPeriod.fiscal_year.desc(), FinancialPeriod.fiscal_quarter.desc())
    )
    periods = periods_result.scalars().all()
    
    if not periods:
        return {
            "company_ticker": ticker.upper(),
            "company_name": company.name,
            "message": "No quarterly financial data available",
            "metrics": [],
            "periods": []
        }
    
    # Current quarter = most recent
    current = periods[0]
    current_metrics = await _get_period_metrics(db, current.id)
    
    # Previous quarter
    prev_quarter = None
    prev_metrics = {}
    for p in periods[1:]:
        if p.fiscal_year == current.fiscal_year and p.fiscal_quarter == (current.fiscal_quarter or 1) - 1:
            prev_quarter = p
            break
        elif p.fiscal_year == current.fiscal_year - 1 and (current.fiscal_quarter or 1) == 1 and p.fiscal_quarter == 4:
            prev_quarter = p
            break
    
    if not prev_quarter and len(periods) > 1:
        prev_quarter = periods[1]
    
    if prev_quarter:
        prev_metrics = await _get_period_metrics(db, prev_quarter.id)
    
    # Year-ago quarter
    yago_quarter = None
    yago_metrics = {}
    for p in periods:
        if (p.fiscal_year == (current.fiscal_year or 0) - 1 and
            p.fiscal_quarter == current.fiscal_quarter):
            yago_quarter = p
            break
    
    if yago_quarter:
        yago_metrics = await _get_period_metrics(db, yago_quarter.id)
    
    # Build comparison rows
    metric_names = ["revenue", "ebitda", "pbt", "pat"]
    rows = []
    
    for metric in metric_names:
        curr_val = current_metrics.get(metric)
        prev_val = prev_metrics.get(metric)
        yago_val = yago_metrics.get(metric)
        
        qoq = pct_change(curr_val, prev_val) if curr_val is not None and prev_val is not None else None
        yoy = pct_change(curr_val, yago_val) if curr_val is not None and yago_val is not None else None
        
        qoq_abs = (curr_val - prev_val) if curr_val is not None and prev_val is not None else None
        yoy_abs = (curr_val - yago_val) if curr_val is not None and yago_val is not None else None
        
        rows.append(QuarterlyComparisonRow(
            metric=metric.upper(),
            current_quarter=safe_round(curr_val),
            previous_quarter=safe_round(prev_val),
            year_ago_quarter=safe_round(yago_val),
            qoq_change=safe_round(qoq_abs),
            qoq_pct=safe_round(qoq),
            yoy_change=safe_round(yoy_abs),
            yoy_pct=safe_round(yoy),
            unit="₹ Crores"
        ))
    
    # Calculate EBITDA margins
    ebitda_margin_curr = margin(current_metrics.get("ebitda"), current_metrics.get("revenue"))
    ebitda_margin_prev = margin(prev_metrics.get("ebitda"), prev_metrics.get("revenue"))
    ebitda_margin_yago = margin(yago_metrics.get("ebitda"), yago_metrics.get("revenue"))
    
    def period_label(p):
        if p is None:
            return "N/A"
        q = p.fiscal_quarter or 0
        return f"Q{q} FY{str(p.fiscal_year)[-2:]}"
    
    return QuarterlyComparisonResponse(
        company_ticker=ticker.upper(),
        company_name=company.name,
        current_period=period_label(current),
        previous_period=period_label(prev_quarter),
        year_ago_period=period_label(yago_quarter),
        reporting_basis=current.reporting_basis or "consolidated",
        metrics=rows,
        ebitda_margin_current=safe_round(ebitda_margin_curr),
        ebitda_margin_previous=safe_round(ebitda_margin_prev),
        ebitda_margin_yago=safe_round(ebitda_margin_yago),
        source="Demo financial data" if any(
            m.is_demo for m in (await db.execute(
                select(FinancialMetric).where(FinancialMetric.financial_period_id == current.id)
            )).scalars().all()
        ) else "Exchange filings",
        is_demo=True,
        extraction_confidence=0.95
    )


@router.get("/companies/{ticker}/guidance")
async def get_company_guidance(
    ticker: str,
    db: AsyncSession = Depends(get_db)
):
    """Get management guidance statements with delivery tracking."""
    result = await db.execute(
        select(Company).where(Company.ticker == ticker.upper())
    )
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail=f"Company '{ticker}' not found")
    
    guidance_result = await db.execute(
        select(GuidanceStatement)
        .where(GuidanceStatement.company_id == company.id)
        .order_by(GuidanceStatement.statement_date.desc().nullslast())
    )
    statements = guidance_result.scalars().all()
    
    responses = []
    for gs in statements:
        responses.append(GuidanceStatementResponse(
            id=gs.id,
            company_ticker=ticker.upper(),
            statement_date=gs.statement_date,
            statement_text=gs.statement_text,
            metric_name=gs.metric_name,
            target_value_low=gs.target_value_low,
            target_value_high=gs.target_value_high,
            target_unit=gs.target_unit,
            target_period=gs.target_period,
            is_quantitative=gs.is_quantitative,
            status=gs.status,
            actual_value=gs.actual_value,
            variance_pct=gs.variance_pct,
            assessment_notes=gs.assessment_notes,
        ))
    
    return {
        "company_ticker": ticker.upper(),
        "company_name": company.name,
        "guidance": responses,
        "total": len(responses)
    }

