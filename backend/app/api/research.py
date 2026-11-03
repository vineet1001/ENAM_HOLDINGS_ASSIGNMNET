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
from app.services import documents as document_store
from app.services.active_portfolio import active_portfolio
from app.services import research_engine
from app.services import document_summary
from app.schemas.schemas import (
    ResearchRequest, ResearchResponse, SourceDocumentResponse
)

router = APIRouter(prefix="/api", tags=["research"])


@router.get("/companies/{ticker}/documents")
async def get_company_documents(
    ticker: str,
    doc_type: str | None = None,
    include_demo: bool = False,
    db: AsyncSession = Depends(get_db)
):
    """Get a company's real documents. Seeded sample ones only appear if asked for."""
    result = await db.execute(
        select(Company).where(Company.ticker == ticker.upper())
    )
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail=f"Company '{ticker}' not found")
    
    query = select(SourceDocument).where(SourceDocument.company_id == company.id)
    if doc_type:
        query = query.where(SourceDocument.document_type == doc_type)
    if not include_demo:
        query = query.where(SourceDocument.is_demo == False)  # noqa: E712
    query = query.order_by(SourceDocument.publication_date.desc().nullslast())
    
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
    
    real = await document_store.real_documents(db, company.id)
    return {
        "documents": responses,
        "total": len(responses),
        "state": document_store.document_state(company.id, real),
    }


@router.post("/companies/{ticker}/documents/fetch")
async def fetch_company_documents(ticker: str, db: AsyncSession = Depends(get_db)):
    """Queue a company's latest annual report and transcripts for reading."""
    company = (await db.execute(select(Company).where(Company.ticker == ticker.upper()))).scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail=f"Company '{ticker}' not found")
    document_store.request_ingest(company.id)
    return {"state": document_store.document_state(company.id, await document_store.real_documents(db, company.id))}


@router.get("/documents")
async def get_portfolio_documents(db: AsyncSession = Depends(get_db)):
    """Every company in the active portfolio with the documents read for it so far."""
    portfolio, holdings = await active_portfolio(db)
    companies = []
    for holding in holdings:
        documents = await document_store.real_documents(db, holding["company_id"])
        companies.append({
            "ticker": holding["ticker"],
            "name": holding["name"],
            "state": document_store.document_state(holding["company_id"], documents),
            "documents": [
                {
                    "id": d.id, "document_type": d.document_type, "title": d.title,
                    "financial_period": d.financial_period, "source_url": d.source_url,
                    "status": d.status, "page_count": d.page_count, "error_message": d.error_message,
                }
                for d in documents
            ],
        })
    return {"portfolio": portfolio["name"], "companies": companies}


@router.get("/sources/{source_id}/pages")
async def search_source_pages(
    source_id: int,
    q: str = Query("", max_length=200),
    db: AsyncSession = Depends(get_db)
):
    """Search inside one document. Every result names its page and links straight to it."""
    document = await db.get(SourceDocument, source_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Source document not found")
    return {
        "query": q,
        "total_pages": document.page_count,
        "results": document_store.search([document], q, limit=10) if q.strip() else [],
    }


@router.get("/sources/{source_id}/summary")
async def get_source_summary(source_id: int, db: AsyncSession = Depends(get_db)):
    """The whole-document summary if there is one, or how far along it is."""
    document = await db.get(SourceDocument, source_id)
    if document is None or document.is_demo:
        raise HTTPException(status_code=404, detail="Source document not found")
    return await document_summary.summary_state(db, document)


@router.post("/sources/{source_id}/summary")
async def start_source_summary(source_id: int, db: AsyncSession = Depends(get_db)):
    """Summarise every page of a document in the background. The result is saved for everyone."""
    document = await db.get(SourceDocument, source_id)
    if document is None or document.is_demo:
        raise HTTPException(status_code=404, detail="Source document not found")
    if document.status != "processed":
        raise HTTPException(status_code=409, detail="This document hasn't been read yet")
    state = await document_summary.summary_state(db, document)
    if state["status"] == "done":
        return state
    if not state["ai_configured"]:
        raise HTTPException(status_code=409, detail="Add an AI key under Settings to summarise whole documents")
    document_summary.start(document)
    return await document_summary.summary_state(db, document)


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
    await db.commit()
    session_id = session.id

    research_data = await research_engine.run_research(db, company, req.research_type, req.query)

    # A failed model call rolls back and expires everything, so the session is loaded again here.
    session = await db.get(ResearchSession, session_id)
    answer = ResearchAnswer(
        research_session_id=session_id,
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
