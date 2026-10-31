"""Alert rules and events API endpoints."""
import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.company import Company
from app.models.alert import AlertRule, AlertEvent
from app.models.announcement import Announcement
from app.schemas.schemas import (
    AlertRuleCreate, AlertRuleUpdate, AlertRuleResponse, AlertEventResponse, AlertSourceSite
)
from app.services.alert_engine import evaluate_all_alerts

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


@router.get("/rules")
async def get_alert_rules(db: AsyncSession = Depends(get_db)):
    """Get all alert rules."""
    result = await db.execute(
        select(AlertRule).order_by(AlertRule.created_at.desc())
    )
    rules = result.scalars().all()
    
    responses = []
    for rule in rules:
        company_ticker = None
        if rule.company_id:
            c = await db.get(Company, rule.company_id)
            company_ticker = c.ticker if c else None
        
        categories = None
        if rule.announcement_categories:
            try:
                categories = json.loads(rule.announcement_categories) if isinstance(rule.announcement_categories, str) else rule.announcement_categories
            except (json.JSONDecodeError, TypeError):
                categories = None
        
        responses.append(AlertRuleResponse(
            id=rule.id,
            name=rule.name,
            rule_type=rule.rule_type,
            company_id=rule.company_id,
            company_ticker=company_ticker,
            threshold_value=rule.threshold_value,
            threshold_direction=rule.threshold_direction,
            volume_multiplier=rule.volume_multiplier,
            volume_lookback_days=rule.volume_lookback_days,
            announcement_categories=categories,
            is_enabled=rule.is_enabled,
            created_at=rule.created_at,
            updated_at=rule.updated_at
        ))
    
    return {"rules": responses, "total": len(responses)}


@router.post("/rules")
async def create_alert_rule(req: AlertRuleCreate, db: AsyncSession = Depends(get_db)):
    """Create a new alert rule."""
    categories_json = None
    if req.announcement_categories:
        categories_json = json.dumps(req.announcement_categories)
    
    rule = AlertRule(
        name=req.name,
        rule_type=req.rule_type,
        company_id=req.company_id,
        threshold_value=req.threshold_value,
        threshold_direction=req.threshold_direction,
        volume_multiplier=req.volume_multiplier,
        volume_lookback_days=req.volume_lookback_days,
        announcement_categories=categories_json,
        is_enabled=req.is_enabled,
        created_at=datetime.utcnow()
    )
    db.add(rule)
    await db.flush()
    
    return {"message": "Alert rule created", "id": rule.id}


@router.patch("/rules/{rule_id}")
async def update_alert_rule(
    rule_id: int,
    req: AlertRuleUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Update an alert rule."""
    result = await db.execute(
        select(AlertRule).where(AlertRule.id == rule_id)
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Alert rule not found")
    
    if req.name is not None:
        rule.name = req.name
    if req.threshold_value is not None:
        rule.threshold_value = req.threshold_value
    if req.threshold_direction is not None:
        rule.threshold_direction = req.threshold_direction
    if req.volume_multiplier is not None:
        rule.volume_multiplier = req.volume_multiplier
    if req.volume_lookback_days is not None:
        rule.volume_lookback_days = req.volume_lookback_days
    if req.announcement_categories is not None:
        rule.announcement_categories = json.dumps(req.announcement_categories)
    if req.is_enabled is not None:
        rule.is_enabled = req.is_enabled
    
    rule.updated_at = datetime.utcnow()
    
    return {"message": f"Alert rule {rule_id} updated"}


@router.delete("/rules/{rule_id}")
async def delete_alert_rule(rule_id: int, db: AsyncSession = Depends(get_db)):
    """Delete an alert rule."""
    result = await db.execute(
        select(AlertRule).where(AlertRule.id == rule_id)
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Alert rule not found")
    
    await db.delete(rule)
    return {"message": f"Alert rule {rule_id} deleted"}


@router.post("/evaluate")
async def evaluate_alerts(db: AsyncSession = Depends(get_db)):
    """Run alert evaluation against all enabled rules."""
    result = await evaluate_all_alerts(db)
    return result


@router.get("/events")
async def get_alert_events(
    acknowledged: bool | None = None,
    company_ticker: str | None = None,
    rule_type: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db)
):
    """Get triggered alert events."""
    query = (
        select(AlertEvent)
        .join(AlertRule, AlertEvent.alert_rule_id == AlertRule.id)
        .order_by(AlertEvent.triggered_at.desc())
        .limit(limit)
    )
    
    if acknowledged is not None:
        query = query.where(AlertEvent.is_acknowledged == acknowledged)
    if company_ticker:
        query = query.join(Company, AlertEvent.company_id == Company.id).where(
            Company.ticker == company_ticker.upper()
        )
    if rule_type:
        query = query.where(AlertRule.rule_type == rule_type)
    
    result = await db.execute(query)
    events = result.scalars().all()
    
    responses = []
    for event in events:
        company = await db.get(Company, event.company_id)
        rule = await db.get(AlertRule, event.alert_rule_id)
        
        # Resolve related announcement and primary filing URL if available
        related_ann = None
        if event.related_announcement_id:
            related_ann = await db.get(Announcement, event.related_announcement_id)
        elif event.trigger_value and "announcement" in event.trigger_value:
            # Try to resolve by category or company
            ann_res = await db.execute(
                select(Announcement)
                .where(Announcement.company_id == event.company_id)
                .order_by(Announcement.filing_date.desc())
                .limit(1)
            )
            related_ann = ann_res.scalar_one_or_none()

        source_url = None
        related_category = None
        if related_ann:
            source_url = related_ann.source_url or related_ann.document_url
            related_category = related_ann.category

        # Build comprehensive real-time source sites & news aggregators
        ticker = company.ticker if company else ""
        name = company.name if company else ""
        source_sites: list[AlertSourceSite] = []

        # 1. Primary Exchange Filing
        if source_url:
            source_sites.append(AlertSourceSite(
                name="Primary Exchange Filing",
                url=source_url,
                category="filing"
            ))

        if ticker:
            # 2. Google News Live Search (Real-time financial breaking news feed)
            source_sites.append(AlertSourceSite(
                name="Live News (Google)",
                url=f"https://news.google.com/search?q={ticker}+NSE+stock+news",
                category="live_news"
            ))
            # 3. Google Finance (Live quotes, intraday volume, financial events)
            source_sites.append(AlertSourceSite(
                name="Google Finance",
                url=f"https://www.google.com/finance/quote/{ticker}:NSE",
                category="market_quote"
            ))
            # 4. NSE India Official Corporate Profile & Live Order Book
            source_sites.append(AlertSourceSite(
                name="NSE India Quote",
                url=f"https://www.nseindia.com/get-quotes/equity?symbol={ticker}",
                category="exchange"
            ))
            # 5. Moneycontrol Stock Intelligence
            source_sites.append(AlertSourceSite(
                name="Moneycontrol Feed",
                url=f"https://www.google.com/search?q={ticker}+moneycontrol+stock+news",
                category="live_news"
            ))

        responses.append(AlertEventResponse(
            id=event.id,
            alert_rule_id=event.alert_rule_id,
            rule_name=rule.name if rule else "",
            rule_type=rule.rule_type if rule else "",
            company_id=event.company_id,
            company_ticker=company.ticker if company else "",
            company_name=company.name if company else "",
            triggered_at=event.triggered_at,
            trigger_value=event.trigger_value,
            observed_value=event.observed_value,
            threshold_value=event.threshold_value,
            is_acknowledged=event.is_acknowledged,
            acknowledged_at=event.acknowledged_at,
            is_demo=event.is_demo,
            related_announcement_id=related_ann.id if related_ann else event.related_announcement_id,
            related_announcement_category=related_category,
            source_url=source_url,
            source_sites=source_sites
        ))
    
    return {"events": responses, "total": len(responses)}


@router.patch("/events/{event_id}/acknowledge")
async def acknowledge_alert(event_id: int, db: AsyncSession = Depends(get_db)):
    """Acknowledge an alert event."""
    result = await db.execute(
        select(AlertEvent).where(AlertEvent.id == event_id)
    )
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Alert event not found")
    
    event.is_acknowledged = True
    event.acknowledged_at = datetime.utcnow()
    
    return {"message": f"Alert event {event_id} acknowledged"}

