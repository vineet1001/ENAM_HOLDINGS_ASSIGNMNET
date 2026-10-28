"""Announcement and Digest API endpoints."""
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.database import get_db
from app.models.company import Company
from app.models.announcement import Announcement, AnnouncementClassification
from app.schemas.schemas import (
    AnnouncementResponse, AnnouncementListResponse,
    DigestRequest, DigestResponse, DigestItemResponse
)
from app.services.classifier import (
    classify_announcement, compute_materiality_score, CATEGORY_DESCRIPTIONS
)

router = APIRouter(prefix="/api", tags=["announcements"])


def _build_announcement_response(ann: Announcement, company: Company | None = None) -> AnnouncementResponse:
    """Build an AnnouncementResponse from ORM model."""
    classification = None
    if hasattr(ann, 'classification') and ann.classification:
        classification = ann.classification
    
    return AnnouncementResponse(
        id=ann.id,
        company_ticker=company.ticker if company else "",
        company_name=company.name if company else "",
        title=ann.title,
        description=ann.description,
        exchange=ann.exchange,
        category=classification.category if classification else ann.category,
        classification_confidence=classification.confidence if classification else None,
        classification_method=classification.method if classification else None,
        classification_explanation=classification.explanation if classification else None,
        filing_date=ann.filing_date,
        source_url=ann.source_url,
        document_url=ann.document_url,
        is_demo=ann.is_demo,
        status=ann.status or "new",
        priority_score=ann.priority_score,
    )


@router.get("/companies/{ticker}/announcements", response_model=AnnouncementListResponse)
async def get_company_announcements(
    ticker: str,
    category: str | None = None,
    status: str | None = None,
    days: int = Query(30, ge=1, le=365),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db)
):
    """Get announcements for a company."""
    result = await db.execute(
        select(Company).where(Company.ticker == ticker.upper())
    )
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail=f"Company '{ticker}' not found")
    
    query = (
        select(Announcement)
        .outerjoin(AnnouncementClassification, Announcement.id == AnnouncementClassification.announcement_id)
        .where(Announcement.company_id == company.id)
        .order_by(Announcement.filing_date.desc())
        .limit(limit)
    )
    
    if category:
        query = query.where(
            or_(
                Announcement.category == category,
                AnnouncementClassification.category == category
            )
        )
    if status:
        query = query.where(Announcement.status == status)
    
    ann_result = await db.execute(query)
    announcements = ann_result.scalars().all()
    
    # Fetch classifications
    responses = []
    for ann in announcements:
        cls_result = await db.execute(
            select(AnnouncementClassification).where(
                AnnouncementClassification.announcement_id == ann.id
            )
        )
        ann.classification = cls_result.scalar_one_or_none()
        responses.append(_build_announcement_response(ann, company))
    
    return AnnouncementListResponse(
        announcements=responses,
        total=len(responses),
        filters_applied={"category": category, "status": status, "days": days}
    )


@router.get("/announcements", response_model=AnnouncementListResponse)
async def get_all_announcements(
    category: str | None = None,
    company_ticker: str | None = None,
    status: str | None = None,
    hours: int = Query(168, ge=1, le=8760),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db)
):
    """Get all announcements across portfolio, with filters."""
    query = (
        select(Announcement)
        .join(Company, Announcement.company_id == Company.id)
        .outerjoin(AnnouncementClassification, Announcement.id == AnnouncementClassification.announcement_id)
        .order_by(Announcement.filing_date.desc())
        .limit(limit)
    )
    
    if category:
        query = query.where(
            or_(
                Announcement.category == category,
                AnnouncementClassification.category == category
            )
        )
    if company_ticker:
        query = query.where(Company.ticker == company_ticker.upper())
    if status:
        query = query.where(Announcement.status == status)
    
    ann_result = await db.execute(query)
    announcements = ann_result.scalars().all()
    
    responses = []
    for ann in announcements:
        c_result = await db.execute(select(Company).where(Company.id == ann.company_id))
        company = c_result.scalar_one_or_none()
        
        cls_result = await db.execute(
            select(AnnouncementClassification).where(
                AnnouncementClassification.announcement_id == ann.id
            )
        )
        ann.classification = cls_result.scalar_one_or_none()
        responses.append(_build_announcement_response(ann, company))
    
    return AnnouncementListResponse(
        announcements=responses,
        total=len(responses),
        filters_applied={"category": category, "company": company_ticker, "status": status}
    )


@router.post("/announcements/{announcement_id}/classify")
async def classify_single_announcement(
    announcement_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Classify or reclassify a single announcement."""
    result = await db.execute(
        select(Announcement).where(Announcement.id == announcement_id)
    )
    ann = result.scalar_one_or_none()
    if not ann:
        raise HTTPException(status_code=404, detail="Announcement not found")
    
    classification = classify_announcement(ann.title, ann.description)
    
    # Update or create classification
    existing = await db.execute(
        select(AnnouncementClassification).where(
            AnnouncementClassification.announcement_id == ann.id
        )
    )
    cls = existing.scalar_one_or_none()
    
    if cls:
        cls.category = classification["category"]
        cls.confidence = classification["confidence"]
        cls.explanation = classification["explanation"]
        cls.method = classification["method"]
        cls.evidence_snippet = classification["evidence_snippet"]
        cls.classified_at = datetime.utcnow()
    else:
        cls = AnnouncementClassification(
            announcement_id=ann.id,
            category=classification["category"],
            confidence=classification["confidence"],
            explanation=classification["explanation"],
            method=classification["method"],
            evidence_snippet=classification["evidence_snippet"],
            classified_at=datetime.utcnow()
        )
        db.add(cls)
    
    # Update announcement category too
    ann.category = classification["category"]
    
    # Compute materiality score
    score, explanation = compute_materiality_score(
        classification["category"],
        classification["confidence"],
        ann.filing_date
    )
    ann.priority_score = score
    
    await db.flush()
    
    return {
        "announcement_id": ann.id,
        "classification": classification,
        "priority_score": score,
        "priority_explanation": explanation
    }


@router.patch("/announcements/{announcement_id}/status")
async def update_announcement_status(
    announcement_id: int,
    status: str = Query(..., pattern="^(new|read|saved|dismissed)$"),
    db: AsyncSession = Depends(get_db)
):
    """Update announcement status (read/saved/dismissed)."""
    result = await db.execute(
        select(Announcement).where(Announcement.id == announcement_id)
    )
    ann = result.scalar_one_or_none()
    if not ann:
        raise HTTPException(status_code=404, detail="Announcement not found")
    
    ann.status = status
    return {"message": f"Announcement {announcement_id} marked as {status}"}


@router.get("/digest", response_model=DigestResponse)
async def get_digest(
    hours: int = Query(24, ge=1, le=720),
    db: AsyncSession = Depends(get_db)
):
    """Generate portfolio announcement digest for the given time window."""
    # For demo data, use the date range of stored announcements
    # rather than "last N hours" from now, since demo dates are historical
    from app.core.config import DEMO_MODE
    
    if DEMO_MODE:
        # Find the date range of stored announcements
        date_result = await db.execute(
            select(func.max(Announcement.filing_date))
        )
        max_date = date_result.scalar_one_or_none()
        if max_date:
            end_time = max_date
            start_time = max_date - timedelta(hours=hours)
        else:
            end_time = datetime.utcnow()
            start_time = end_time - timedelta(hours=hours)
    else:
        end_time = datetime.utcnow()
        start_time = end_time - timedelta(hours=hours)
    
    # Fetch announcements in window
    ann_result = await db.execute(
        select(Announcement)
        .join(Company, Announcement.company_id == Company.id)
        .where(Announcement.filing_date.between(start_time, end_time))
        .order_by(Announcement.priority_score.desc().nullslast(), Announcement.filing_date.desc())
    )
    announcements = ann_result.scalars().all()
    
    if not announcements:
        # Widen to all available announcements for demo
        ann_result = await db.execute(
            select(Announcement)
            .join(Company, Announcement.company_id == Company.id)
            .order_by(Announcement.priority_score.desc().nullslast(), Announcement.filing_date.desc())
            .limit(50)
        )
        announcements = ann_result.scalars().all()
        if announcements:
            start_time = min(a.filing_date for a in announcements)
            end_time = max(a.filing_date for a in announcements)
    
    important_items = []
    routine_items = []
    companies_set = set()
    categories_set = set()
    
    for ann in announcements:
        c_result = await db.execute(select(Company).where(Company.id == ann.company_id))
        company = c_result.scalar_one_or_none()
        
        cls_result = await db.execute(
            select(AnnouncementClassification).where(
                AnnouncementClassification.announcement_id == ann.id
            )
        )
        ann.classification = cls_result.scalar_one_or_none()
        
        ann_response = _build_announcement_response(ann, company)
        
        category = ann_response.category or "unclassified"
        score = ann.priority_score or 0.0
        
        # Compute materiality if not already set
        if not ann.priority_score:
            score, explanation = compute_materiality_score(
                category,
                ann_response.classification_confidence or 0.5,
                ann.filing_date
            )
        else:
            explanation = f"Priority score: {score:.3f}"
        
        companies_set.add(company.ticker if company else "Unknown")
        categories_set.add(category)
        
        # Generate summary
        summary = ann.description or ann.title
        if len(summary) > 200:
            summary = summary[:200] + "..."
        
        item = DigestItemResponse(
            announcement=ann_response,
            priority_score=score,
            priority_explanation=explanation,
            summary=summary,
            is_routine=score < 0.4
        )
        
        if score >= 0.4:
            important_items.append(item)
        else:
            routine_items.append(item)
    
    # Sort by priority
    important_items.sort(key=lambda x: x.priority_score, reverse=True)
    routine_items.sort(key=lambda x: x.priority_score, reverse=True)
    
    return DigestResponse(
        period_start=start_time,
        period_end=end_time,
        total_announcements=len(announcements),
        important_items=important_items,
        routine_items=routine_items,
        companies_covered=len(companies_set),
        categories_found=sorted(categories_set),
        generated_at=datetime.utcnow(),
        is_demo=DEMO_MODE
    )


@router.get("/categories")
async def get_categories():
    """Get all announcement categories with descriptions."""
    return {"categories": CATEGORY_DESCRIPTIONS}

