"""AI reading of real filing documents, plus AI status for the UI."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.announcement import Announcement
from app.models.company import Company
from app.services import filing_ai, live_sync

router = APIRouter(prefix="/api", tags=["filing-ai"])


async def _load_real_filing(db: AsyncSession, announcement_id: int) -> tuple[Announcement, str]:
    announcement = await db.get(Announcement, announcement_id)
    if announcement is None:
        raise HTTPException(status_code=404, detail="Filing not found")
    if announcement.is_demo or not announcement.source_url:
        raise HTTPException(status_code=422, detail="This filing has no real document to read")
    company = await db.get(Company, announcement.company_id)
    return announcement, company.name if company else ""


async def _run(generate, db: AsyncSession, announcement_id: int) -> dict:
    announcement, company_name = await _load_real_filing(db, announcement_id)
    try:
        insight = await generate(db, announcement, company_name)
    except filing_ai.AINotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except filing_ai.AIRateLimited as exc:
        raise HTTPException(status_code=429, detail=str(exc))
    except filing_ai.AIUnavailable as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return await filing_ai.insight_payload(db, insight.pdf_url)


@router.post("/filings/{announcement_id}/headline")
async def create_headline(announcement_id: int, db: AsyncSession = Depends(get_db)):
    return await _run(filing_ai.generate_headline, db, announcement_id)


@router.post("/filings/{announcement_id}/summary")
async def create_summary(announcement_id: int, db: AsyncSession = Depends(get_db)):
    """Written on request, then saved so nobody pays for the same filing twice."""
    return await _run(filing_ai.generate_summary, db, announcement_id)


@router.get("/ai/status")
async def get_ai_status(db: AsyncSession = Depends(get_db)):
    return {
        **filing_ai.ai_status(),
        "filings_waiting": await live_sync.count_unread(db),
        "last_sync": live_sync.last_sync(),
    }
