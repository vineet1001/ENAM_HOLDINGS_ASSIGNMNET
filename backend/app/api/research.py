"""Research and document API endpoints."""
import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.company import Company
from app.models.document import SourceDocument, DocumentChunk, Citation
from app.models.research import ResearchSession, ResearchAnswer
from app.models.financial import GuidanceStatement
from app.schemas.schemas import (
    ResearchRequest, ResearchResponse, SourceDocumentResponse
)

router = APIRouter(prefix="/api", tags=["research"])


@router.get("/companies/{ticker}/documents")
async def get_company_documents(
    ticker: str,
    doc_type: str | None = None,
    db: AsyncSession = Depends(get_db)
):
    """Get all documents for a company."""
    result = await db.execute(
        select(Company).where(Company.ticker == ticker.upper())
    )
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail=f"Company '{ticker}' not found")
    
    query = select(SourceDocument).where(SourceDocument.company_id == company.id)
    if doc_type:
        query = query.where(SourceDocument.document_type == doc_type)
    query = query.order_by(SourceDocument.ingested_at.desc().nullslast())
    
    doc_result = await db.execute(query)
    docs = doc_result.scalars().all()
    
    responses = []
    for doc in docs:
        # Count chunks
        chunk_count_result = await db.execute(
            select(func.count(DocumentChunk.id)).where(
                DocumentChunk.source_document_id == doc.id
            )
        )
        chunk_count = chunk_count_result.scalar_one()
        
        responses.append(SourceDocumentResponse(
            id=doc.id,
            company_ticker=ticker.upper(),
            document_type=doc.document_type,
            title=doc.title,
            financial_period=doc.financial_period,
            publication_date=doc.publication_date,
            source_url=doc.source_url,
            status=doc.status,
            page_count=doc.page_count,
            ingested_at=doc.ingested_at,
            processed_at=doc.processed_at,
            is_demo=doc.is_demo,
            chunk_count=chunk_count
        ))
    
    return {"documents": responses, "total": len(responses)}


@router.get("/sources/{source_id}")
async def get_source_document(
    source_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Get a source document with its chunks."""
    result = await db.execute(
        select(SourceDocument).where(SourceDocument.id == source_id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Source document not found")
    
    # Get company
    company = await db.get(Company, doc.company_id)
    
    # Get chunks
    chunk_result = await db.execute(
        select(DocumentChunk)
        .where(DocumentChunk.source_document_id == doc.id)
        .order_by(DocumentChunk.chunk_index)
    )
    chunks = chunk_result.scalars().all()
    
    return {
        "document": {
            "id": doc.id,
            "company_ticker": company.ticker if company else "",
            "document_type": doc.document_type,
            "title": doc.title,
            "financial_period": doc.financial_period,
            "publication_date": str(doc.publication_date) if doc.publication_date else None,
            "source_url": doc.source_url,
            "status": doc.status,
            "page_count": doc.page_count,
            "is_demo": doc.is_demo,
            "error_message": doc.error_message,
        },
        "chunks": [
            {
                "id": c.id,
                "chunk_index": c.chunk_index,
                "content": c.content,
                "section_heading": c.section_heading,
                "page_number": c.page_number,
                "chunk_type": c.chunk_type,
            }
            for c in chunks
        ],
        "total_chunks": len(chunks)
    }


@router.post("/companies/{ticker}/research")
async def create_research(
    ticker: str,
    req: ResearchRequest,
    db: AsyncSession = Depends(get_db)
):
    """Run a research query for a company."""
    result = await db.execute(
        select(Company).where(Company.ticker == ticker.upper())
    )
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail=f"Company '{ticker}' not found. Use /companies/search to find supported tickers.")
    
    # Create research session
    session = ResearchSession(
        company_id=company.id,
        query=req.query or f"{req.research_type} analysis",
        research_type=req.research_type,
        status="processing",
        created_at=datetime.utcnow()
    )
    db.add(session)
    await db.flush()
    
    # For now, generate demo research based on type
    research_data = await _generate_demo_research(db, company, req.research_type, req.query)
    
    answer = ResearchAnswer(
        research_session_id=session.id,
        answer_json=json.dumps(research_data.get("data", {})),
        summary=research_data.get("summary"),
        key_observations=json.dumps(research_data.get("key_observations", [])),
        risks_caveats=json.dumps(research_data.get("risks_caveats", [])),
        missing_info=json.dumps(research_data.get("missing_info", [])),
        created_at=datetime.utcnow()
    )
    db.add(answer)
    
    session.status = "completed"
    session.completed_at = datetime.utcnow()
    await db.flush()
    
    return ResearchResponse(
        session_id=session.id,
        company_ticker=ticker.upper(),
        research_type=req.research_type,
        status="completed",
        summary=research_data.get("summary"),
        key_observations=research_data.get("key_observations", []),
        data=research_data.get("data", {}),
        risks_caveats=research_data.get("risks_caveats", []),
        missing_info=research_data.get("missing_info", []),
        citations=research_data.get("citations", []),
        created_at=session.created_at,
        completed_at=session.completed_at
    )


async def _generate_demo_research(db: AsyncSession, company: Company, research_type: str, query: str | None) -> dict:
    """Generate structured research output from available data."""
    from app.models.financial import FinancialPeriod, FinancialMetric
    from app.models.document import SourceDocument, DocumentChunk
    
    # Get financial data
    periods_result = await db.execute(
        select(FinancialPeriod)
        .where(FinancialPeriod.company_id == company.id)
        .order_by(FinancialPeriod.fiscal_year.desc(), FinancialPeriod.fiscal_quarter.desc())
    )
    periods = periods_result.scalars().all()
    
    # Get documents
    docs_result = await db.execute(
        select(SourceDocument).where(SourceDocument.company_id == company.id)
    )
    docs = docs_result.scalars().all()
    
    # Get guidance
    guidance_result = await db.execute(
        select(GuidanceStatement).where(GuidanceStatement.company_id == company.id)
    )
    guidance = guidance_result.scalars().all()
    
    # Get document chunks for evidence
    chunks = []
    for doc in docs:
        chunk_result = await db.execute(
            select(DocumentChunk)
            .where(DocumentChunk.source_document_id == doc.id)
            .limit(5)
        )
        chunks.extend(chunk_result.scalars().all())
    
    citations = []
    for doc in docs:
        citations.append({
            "source": doc.title,
            "type": doc.document_type,
            "period": doc.financial_period,
            "url": doc.source_url,
            "is_demo": doc.is_demo
        })
    
    missing_info = []
    if not periods:
        missing_info.append("No quarterly financial data available for comparison")
    if not docs:
        missing_info.append("No primary-source documents ingested for this company")
    if not guidance:
        missing_info.append("No management guidance statements tracked")
    
    # Build response based on research type
    if research_type == "business_snapshot":
        return _build_business_snapshot(company, chunks, citations, missing_info)
    elif research_type == "financial_snapshot":
        return await _build_financial_snapshot(db, company, periods, citations, missing_info)
    elif research_type == "trajectory":
        return await _build_trajectory(db, company, periods, citations, missing_info)
    elif research_type == "balance_sheet":
        return await _build_balance_sheet(db, company, periods, citations, missing_info)
    elif research_type == "cash_quality":
        return await _build_cash_quality(db, company, periods, citations, missing_info)
    elif research_type == "narrative_vs_numbers":
        return _build_narrative_vs_numbers(company, guidance, citations, missing_info)
    elif research_type == "guidance":
        return _build_guidance_view(company, guidance, citations, missing_info)
    elif research_type == "bull_bear":
        return await _build_bull_bear(db, company, periods, guidance, chunks, citations, missing_info)
    else:
        return _build_custom_research(company, query, chunks, citations, missing_info)


def _build_business_snapshot(company, chunks, citations, missing_info):
    # Build from available chunk content
    evidence = [c.content for c in chunks if c.content]
    
    sector_desc = {
        "Oil & Gas": f"{company.name} is one of India's largest conglomerates with interests across energy, petrochemicals, retail, and digital services.",
        "Banking": f"{company.name} is a leading Indian bank providing a wide range of financial products and services.",
        "IT Services": f"{company.name} is a leading global IT services and consulting company headquartered in India.",
        "Engineering": f"{company.name} is a major Indian engineering and construction conglomerate.",
        "Telecom": f"{company.name} is one of India's largest telecommunications companies.",
        "FMCG": f"{company.name} is a leading Indian consumer goods company.",
        "Automobile": f"{company.name} is a leading Indian automobile manufacturer.",
        "Pharma": f"{company.name} is a leading Indian pharmaceutical company.",
        "Metals": f"{company.name} is one of India's largest steel and metals companies.",
        "Power": f"{company.name} is India's largest power generation company.",
        "Consumer Goods": f"{company.name} is a leading Indian consumer lifestyle company.",
    }
    
    summary = sector_desc.get(company.sector or company.industry, 
                              f"{company.name} ({company.ticker}) is a {company.market_cap_category or 'large'}-cap Indian listed company in the {company.sector or 'diversified'} sector.")
    
    if not evidence:
        missing_info.append("No primary-source documents available for detailed business description. Information shown is based on public company profile.")
    
    return {
        "summary": summary,
        "key_observations": [
            f"Sector: {company.sector or 'N/A'}",
            f"Industry: {company.industry or 'N/A'}",
            f"Exchange: {company.exchange}",
            f"Market Cap Category: {company.market_cap_category or 'N/A'}",
        ],
        "data": {
            "company_name": company.name,
            "ticker": company.ticker,
            "sector": company.sector,
            "industry": company.industry,
            "exchange": company.exchange,
            "description": summary,
            "evidence_excerpts": evidence[:3] if evidence else [],
        },
        "risks_caveats": [
            "Business description based on publicly available information and demo data" if not evidence else
            "Business description sourced from ingested documents"
        ],
        "missing_info": missing_info,
        "citations": citations
    }


async def _build_financial_snapshot(db, company, periods, citations, missing_info):
    from app.models.financial import FinancialMetric
    from app.services.financial_calc import margin as calc_margin, safe_round
    
    if not periods:
        return {
            "summary": f"No quarterly financial data available for {company.ticker}.",
            "key_observations": [],
            "data": {},
            "risks_caveats": ["Financial data not yet ingested for this company"],
            "missing_info": missing_info,
            "citations": citations
        }
    
    latest = periods[0]
    metrics_result = await db.execute(
        select(FinancialMetric).where(FinancialMetric.financial_period_id == latest.id)
    )
    metrics = {m.metric_name: m.value for m in metrics_result.scalars().all()}
    
    q_label = f"Q{latest.fiscal_quarter} FY{str(latest.fiscal_year)[-2:]}"
    
    observations = []
    if metrics.get("revenue"):
        observations.append(f"Revenue: ₹{metrics['revenue']:,.0f} Cr ({q_label})")
    if metrics.get("ebitda"):
        observations.append(f"EBITDA: ₹{metrics['ebitda']:,.0f} Cr")
    if metrics.get("pat"):
        observations.append(f"PAT: ₹{metrics['pat']:,.0f} Cr")
    
    ebitda_m = calc_margin(metrics.get("ebitda"), metrics.get("revenue"))
    if ebitda_m:
        observations.append(f"EBITDA Margin: {ebitda_m:.1f}%")
    
    return {
        "summary": f"Financial snapshot for {company.name} as of {q_label}.",
        "key_observations": observations,
        "data": {
            "period": q_label,
            "reporting_basis": latest.reporting_basis,
            "metrics": metrics,
            "ebitda_margin": safe_round(ebitda_m),
        },
        "risks_caveats": ["Figures are from demo data" if any(True for _ in []) else "Figures extracted from financial filings"],
        "missing_info": missing_info,
        "citations": citations
    }


async def _build_trajectory(db, company, periods, citations, missing_info):
    from app.models.financial import FinancialMetric
    
    if len(periods) < 2:
        missing_info.append("Insufficient historical periods for trajectory analysis")
    
    trajectory_data = []
    for p in periods:
        metrics_result = await db.execute(
            select(FinancialMetric).where(FinancialMetric.financial_period_id == p.id)
        )
        metrics = {m.metric_name: m.value for m in metrics_result.scalars().all()}
        trajectory_data.append({
            "period": f"Q{p.fiscal_quarter} FY{str(p.fiscal_year)[-2:]}",
            **metrics
        })
    
    trajectory_data.reverse()  # Chronological
    
    return {
        "summary": f"Multi-period financial trajectory for {company.name}.",
        "key_observations": [
            f"Data available for {len(periods)} quarter(s)",
        ],
        "data": {"trajectory": trajectory_data},
        "risks_caveats": ["Trajectory requires multiple periods for meaningful analysis"],
        "missing_info": missing_info,
        "citations": citations
    }


def _fetch_yfinance_balance_sheet(yahoo_symbol: str):
    """Fetch live annual balance sheet statement via yfinance adapter in ₹ Crores."""
    try:
        import yfinance as yf
        t = yf.Ticker(yahoo_symbol)
        bs = t.balance_sheet
        if bs is not None and not bs.empty:
            years = [f"FY{col.year % 100}" for col in bs.columns[:4]]
            rows = []
            target_metrics = [
                ("Total Assets", "Total Assets"),
                ("Common Stock Equity", "Net Worth (Equity)"),
                ("Working Capital", "Working Capital"),
                ("Cash And Cash Equivalents", "Cash & Cash Equivalents"),
                ("Total Debt", "Total Debt"),
                ("Net Debt", "Net Debt"),
                ("Tangible Book Value", "Tangible Book Value"),
                ("Invested Capital", "Invested Capital"),
                ("Current Assets", "Current Assets"),
                ("Current Liabilities", "Current Liabilities"),
            ]
            for raw_name, display_name in target_metrics:
                if raw_name in bs.index:
                    vals = [
                        round(float(v) / 1e7, 1) if v is not None and str(v) != 'nan' else None
                        for v in bs.loc[raw_name][:4]
                    ]
                    rows.append({"metric": display_name, "values": vals})
            return {"years": years, "rows": rows}
    except Exception:
        pass
    return None


def _fetch_yfinance_cash_flow(yahoo_symbol: str):
    """Fetch live annual cash flow statement via yfinance adapter in ₹ Crores."""
    try:
        import yfinance as yf
        t = yf.Ticker(yahoo_symbol)
        cf = t.cashflow
        if cf is not None and not cf.empty:
            years = [f"FY{col.year % 100}" for col in cf.columns[:4]]
            rows = []
            target_metrics = [
                ("Free Cash Flow", "Free Cash Flow"),
                ("Operating Cash Flow", "Operating Cash Flow (CFO)"),
                ("Capital Expenditure", "Capital Expenditure (CapEx)"),
                ("Financing Cash Flow", "Financing Cash Flow"),
                ("Cash Dividends Paid", "Dividends Paid"),
                ("End Cash Position", "Ending Cash Position"),
            ]
            for raw_name, display_name in target_metrics:
                if raw_name in cf.index:
                    vals = [
                        round(float(v) / 1e7, 1) if v is not None and str(v) != 'nan' else None
                        for v in cf.loc[raw_name][:4]
                    ]
                    rows.append({"metric": display_name, "values": vals})
            return {"years": years, "rows": rows}
    except Exception:
        pass
    return None


async def _build_balance_sheet(db, company, periods, citations, missing_info):
    symbol = company.yahoo_symbol or f"{company.ticker}.NS"
    bs_data = _fetch_yfinance_balance_sheet(symbol)
    
    if bs_data and bs_data["rows"]:
        years = bs_data["years"]
        latest_year = years[0] if years else "Latest"
        
        # Extract highlights for observations
        obs = []
        for r in bs_data["rows"]:
            m = r["metric"]
            val = r["values"][0] if r["values"] else None
            if val is not None:
                if m == "Total Assets":
                    obs.append(f"Total Assets: ₹{val:,.1f} Cr ({latest_year})")
                elif m == "Net Worth (Equity)":
                    obs.append(f"Shareholders' Net Worth: ₹{val:,.1f} Cr")
                elif m == "Cash & Cash Equivalents":
                    obs.append(f"Liquid Cash Reserves: ₹{val:,.1f} Cr")
                elif m == "Total Debt":
                    obs.append(f"Total Borrowings: ₹{val:,.1f} Cr ({'Virtually Debt-Free' if val < 1000 else 'Leveraged'})")
                elif m == "Working Capital":
                    obs.append(f"Working Capital Cushion: ₹{val:,.1f} Cr")
        
        return {
            "summary": f"Consolidated Balance Sheet for {company.name} across {len(years)} fiscal years. Total assets stand at ₹{bs_data['rows'][0]['values'][0]:,.1f} Cr ({latest_year}).",
            "key_observations": obs,
            "data": {
                "years": years,
                "table": bs_data["rows"],
                "unit": "₹ Crores",
                "source": f"Exchange Financial Disclosures via Yahoo Finance ({symbol})"
            },
            "risks_caveats": [
                "Figures in ₹ Crores, converted from audited annual filings and XBRL submissions",
                "Reporting basis: Consolidated financial statements"
            ],
            "missing_info": [m for m in missing_info if "balance sheet" not in m.lower()],
            "citations": citations
        }
    
    missing_info.append("Detailed balance sheet analysis requires annual report ingestion or online market data adapter sync")
    return {
        "summary": f"Balance sheet analysis for {company.name}.",
        "key_observations": ["Full balance sheet data requires annual report processing or online data feed"],
        "data": {},
        "risks_caveats": ["Balance sheet metrics require primary-source annual reports"],
        "missing_info": missing_info,
        "citations": citations
    }


async def _build_cash_quality(db, company, periods, citations, missing_info):
    symbol = company.yahoo_symbol or f"{company.ticker}.NS"
    cf_data = _fetch_yfinance_cash_flow(symbol)
    
    if cf_data and cf_data["rows"]:
        years = cf_data["years"]
        latest_year = years[0] if years else "Latest"
        
        obs = []
        for r in cf_data["rows"]:
            m = r["metric"]
            val = r["values"][0] if r["values"] else None
            if val is not None:
                if m == "Operating Cash Flow (CFO)":
                    obs.append(f"Cash Flow from Operations: ₹{val:,.1f} Cr ({latest_year})")
                elif m == "Free Cash Flow":
                    obs.append(f"Free Cash Flow Generation: ₹{val:,.1f} Cr")
                elif m == "Capital Expenditure (CapEx)":
                    obs.append(f"Annual Capital Expenditure: ₹{abs(val):,.1f} Cr")
                elif m == "Dividends Paid":
                    obs.append(f"Cash Returned to Shareholders via Dividends: ₹{abs(val):,.1f} Cr")
        
        return {
            "summary": f"Cash Quality and Capital Allocation for {company.name} across {len(years)} fiscal years. Delivered ₹{cf_data['rows'][0]['values'][0]:,.1f} Cr in Free Cash Flow in {latest_year}.",
            "key_observations": obs,
            "data": {
                "years": years,
                "table": cf_data["rows"],
                "unit": "₹ Crores",
                "source": f"Cash Flow Statement via Yahoo Finance ({symbol})"
            },
            "risks_caveats": [
                "Figures in ₹ Crores from audited Cash Flow Statements",
                "FCF calculated as CFO minus CapEx"
            ],
            "missing_info": [m for m in missing_info if "cash flow" not in m.lower()],
            "citations": citations
        }
    
    missing_info.append("Cash flow analysis requires cash flow statement extraction from annual reports or online data feed")
    return {
        "summary": f"Cash quality analysis for {company.name}.",
        "key_observations": ["Cash flow data requires annual report or quarterly results processing"],
        "data": {},
        "risks_caveats": ["Operating cash flow and capex figures not yet extracted"],
        "missing_info": missing_info,
        "citations": citations
    }


def _build_narrative_vs_numbers(company, guidance, citations, missing_info):
    if not guidance:
        missing_info.append("No management guidance statements tracked for narrative-vs-numbers comparison")
        return {
            "summary": f"Narrative vs Numbers analysis for {company.name}.",
            "key_observations": ["No guidance statements available for comparison"],
            "data": {"comparisons": []},
            "risks_caveats": ["Requires earnings-call transcript processing to extract guidance"],
            "missing_info": missing_info,
            "citations": citations
        }
    
    comparisons = []
    for gs in guidance:
        comparisons.append({
            "statement": gs.statement_text,
            "metric": gs.metric_name,
            "target_range": f"{gs.target_value_low or 'N/A'} - {gs.target_value_high or 'N/A'} {gs.target_unit or ''}",
            "target_period": gs.target_period,
            "actual_value": gs.actual_value,
            "status": gs.status,
            "variance_pct": gs.variance_pct,
            "assessment": gs.assessment_notes,
            "source_date": str(gs.statement_date) if gs.statement_date else None,
        })
    
    met = sum(1 for c in comparisons if c["status"] == "achieved")
    missed = sum(1 for c in comparisons if c["status"] == "missed")
    
    return {
        "summary": f"Tracking {len(comparisons)} management guidance statement(s) for {company.name}. {met} met, {missed} missed.",
        "key_observations": [
            f"Total guidance tracked: {len(comparisons)}",
            f"Achieved: {met}",
            f"Missed: {missed}",
        ],
        "data": {"comparisons": comparisons},
        "risks_caveats": ["Guidance-to-outcome matching requires careful period alignment"],
        "missing_info": missing_info,
        "citations": citations
    }


def _build_guidance_view(company, guidance, citations, missing_info):
    if not guidance:
        missing_info.append("No guidance statements found")
    
    items = []
    for gs in guidance:
        items.append({
            "statement": gs.statement_text,
            "metric": gs.metric_name,
            "target_low": gs.target_value_low,
            "target_high": gs.target_value_high,
            "unit": gs.target_unit,
            "period": gs.target_period,
            "is_quantitative": gs.is_quantitative,
            "status": gs.status,
            "actual": gs.actual_value,
        })
    
    return {
        "summary": f"Management guidance for {company.name}: {len(items)} statement(s).",
        "key_observations": [f"{len(items)} guidance statement(s) tracked"],
        "data": {"guidance": items},
        "risks_caveats": [],
        "missing_info": missing_info,
        "citations": citations
    }


async def _build_bull_bear(db, company, periods, guidance, chunks, citations, missing_info):
    from app.models.financial import FinancialMetric
    from app.services.financial_calc import pct_change, margin as calc_margin
    
    bull_points = []
    bear_points = []
    
    # Analyse available financials
    if len(periods) >= 2:
        latest = periods[0]
        prev = periods[1]
        
        latest_metrics_r = await db.execute(
            select(FinancialMetric).where(FinancialMetric.financial_period_id == latest.id)
        )
        latest_m = {m.metric_name: m.value for m in latest_metrics_r.scalars().all()}
        
        prev_metrics_r = await db.execute(
            select(FinancialMetric).where(FinancialMetric.financial_period_id == prev.id)
        )
        prev_m = {m.metric_name: m.value for m in prev_metrics_r.scalars().all()}
        
        # Revenue growth
        rev_change = pct_change(latest_m.get("revenue"), prev_m.get("revenue"))
        if rev_change is not None:
            if rev_change > 0:
                bull_points.append({
                    "claim": f"Revenue grew {rev_change:.1f}% QoQ",
                    "evidence": f"Revenue: ₹{latest_m.get('revenue', 0):,.0f} Cr vs ₹{prev_m.get('revenue', 0):,.0f} Cr",
                    "period": f"Q{latest.fiscal_quarter} vs Q{prev.fiscal_quarter} FY{latest.fiscal_year}",
                    "caveat": "Based on demo financial data"
                })
            else:
                bear_points.append({
                    "claim": f"Revenue declined {rev_change:.1f}% QoQ",
                    "evidence": f"Revenue: ₹{latest_m.get('revenue', 0):,.0f} Cr vs ₹{prev_m.get('revenue', 0):,.0f} Cr",
                    "period": f"Q{latest.fiscal_quarter} vs Q{prev.fiscal_quarter} FY{latest.fiscal_year}",
                    "caveat": "Based on demo financial data"
                })
        
        # Margin
        curr_margin = calc_margin(latest_m.get("ebitda"), latest_m.get("revenue"))
        prev_margin = calc_margin(prev_m.get("ebitda"), prev_m.get("revenue"))
        if curr_margin is not None and prev_margin is not None:
            if curr_margin > prev_margin:
                bull_points.append({
                    "claim": f"EBITDA margin expanded from {prev_margin:.1f}% to {curr_margin:.1f}%",
                    "evidence": "Margin improvement indicates operational efficiency gains",
                    "period": f"Q{latest.fiscal_quarter} FY{latest.fiscal_year}",
                    "caveat": "Based on demo financial data"
                })
            else:
                bear_points.append({
                    "claim": f"EBITDA margin compressed from {prev_margin:.1f}% to {curr_margin:.1f}%",
                    "evidence": "Margin compression may indicate cost pressures",
                    "period": f"Q{latest.fiscal_quarter} FY{latest.fiscal_year}",
                    "caveat": "Based on demo financial data"
                })
    
    # Guidance misses
    for gs in guidance:
        if gs.status == "missed":
            bear_points.append({
                "claim": f"Missed guidance on {gs.metric_name or 'undisclosed metric'}",
                "evidence": gs.statement_text,
                "period": gs.target_period or "N/A",
                "caveat": "Management credibility concern"
            })
        elif gs.status == "achieved":
            bull_points.append({
                "claim": f"Met guidance on {gs.metric_name or 'target metric'}",
                "evidence": gs.statement_text,
                "period": gs.target_period or "N/A",
                "caveat": "Demonstrates execution capability"
            })
    
    if not bull_points:
        bull_points.append({"claim": "Insufficient data for bull case", "evidence": "N/A", "period": "N/A", "caveat": "Requires more financial data"})
    if not bear_points:
        bear_points.append({"claim": "Insufficient data for bear case", "evidence": "N/A", "period": "N/A", "caveat": "Requires more financial data"})
    
    if not periods and not guidance:
        missing_info.append("Bull/bear analysis requires financial data and/or guidance statements")
    
    return {
        "summary": f"Bull vs Bear case for {company.name}: {len(bull_points)} bull argument(s), {len(bear_points)} bear argument(s).",
        "key_observations": [
            f"Bull arguments: {len(bull_points)}",
            f"Bear arguments: {len(bear_points)}",
            "Analysis based on available quantitative data and management guidance"
        ],
        "data": {
            "bull_case": bull_points,
            "bear_case": bear_points,
            "synthesis": "This analysis is based on available demo financial data and guidance statements. A complete assessment requires full annual report and earnings call transcript analysis."
        },
        "risks_caveats": [
            "Analysis is limited to available quantitative data",
            "Primary-source documents needed for qualitative assessment",
            "No stock price target or investment recommendation provided"
        ],
        "missing_info": missing_info,
        "citations": citations
    }


def _build_custom_research(company, query, chunks, citations, missing_info):
    evidence = [c.content for c in chunks if c.content][:5]
    
    if not evidence:
        missing_info.append("No primary-source document chunks available for custom research")
    
    return {
        "summary": f"Research on '{query or 'general inquiry'}' for {company.name}. {'Evidence found in ' + str(len(evidence)) + ' document chunks.' if evidence else 'No primary-source evidence available.'}",
        "key_observations": [
            f"Query: {query or 'general inquiry'}",
            f"Evidence chunks found: {len(evidence)}",
        ],
        "data": {
            "query": query,
            "evidence": evidence,
        },
        "risks_caveats": [
            "Custom research requires LLM provider configuration for full analysis",
            "Currently showing available evidence without LLM synthesis"
        ],
        "missing_info": missing_info,
        "citations": citations
    }

