"""Alert evaluation engine - deterministic threshold-based checks."""
import json
from datetime import datetime
from typing import Optional
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.financial_calc import pct_change, volume_multiple


async def evaluate_price_alerts(session: AsyncSession) -> list[dict]:
    """Evaluate all enabled price movement alert rules against latest price data.
    
    Returns list of triggered alert event dicts.
    """
    from app.models.alert import AlertRule, AlertEvent
    from app.models.price import PriceBar
    from app.models.company import Company
    
    triggered = []
    
    # Get all enabled price movement rules
    rules_result = await session.execute(
        select(AlertRule).where(
            AlertRule.rule_type == "price_movement",
            AlertRule.is_enabled == True
        )
    )
    rules = rules_result.scalars().all()
    
    for rule in rules:
        # Determine which companies to check
        if rule.company_id:
            company_ids = [rule.company_id]
        else:
            # Global rule - check all portfolio companies
            from app.models.company import PortfolioMembership
            pm_result = await session.execute(
                select(PortfolioMembership.company_id)
            )
            company_ids = [r[0] for r in pm_result.all()]
        
        threshold = rule.threshold_value or 3.0
        
        for cid in company_ids:
            # Get the two most recent price bars
            prices_result = await session.execute(
                select(PriceBar)
                .where(PriceBar.company_id == cid)
                .order_by(PriceBar.date.desc())
                .limit(2)
            )
            prices = prices_result.scalars().all()
            
            if len(prices) < 2:
                continue
            
            latest = prices[0]
            prev = prices[1]
            
            change_pct = pct_change(latest.close, prev.close)
            if change_pct is None:
                continue
            
            should_trigger = False
            direction = rule.threshold_direction or "both"
            
            if direction == "both" and abs(change_pct) >= threshold:
                should_trigger = True
            elif direction == "above" and change_pct >= threshold:
                should_trigger = True
            elif direction == "below" and change_pct <= -threshold:
                should_trigger = True
            
            if should_trigger:
                # Check for duplicate
                dedup_key = f"price_{rule.id}_{cid}_{latest.date}"
                existing = await session.execute(
                    select(AlertEvent).where(
                        AlertEvent.alert_rule_id == rule.id,
                        AlertEvent.company_id == cid,
                        AlertEvent.trigger_value == dedup_key
                    )
                )
                if existing.scalar_one_or_none() is not None:
                    continue
                
                # Get company info
                company = await session.get(Company, cid)
                
                event = AlertEvent(
                    alert_rule_id=rule.id,
                    company_id=cid,
                    triggered_at=datetime.utcnow(),
                    trigger_value=dedup_key,
                    observed_value=f"{change_pct:+.2f}% on {latest.date}",
                    threshold_value=f"{threshold}% ({direction})",
                    is_acknowledged=False,
                    related_price_bar_id=latest.id,
                    is_demo=latest.is_demo,
                    dedup_key=dedup_key
                )
                session.add(event)
                triggered.append({
                    "rule": rule.name,
                    "company": company.ticker if company else str(cid),
                    "change": f"{change_pct:+.2f}%",
                    "threshold": f"{threshold}%",
                    "date": str(latest.date)
                })
    
    await session.flush()
    return triggered


async def evaluate_volume_alerts(session: AsyncSession) -> list[dict]:
    """Evaluate all enabled unusual volume alert rules.
    
    Returns list of triggered alert event dicts.
    """
    from app.models.alert import AlertRule, AlertEvent
    from app.models.price import PriceBar
    from app.models.company import Company, PortfolioMembership
    
    triggered = []
    
    rules_result = await session.execute(
        select(AlertRule).where(
            AlertRule.rule_type == "unusual_volume",
            AlertRule.is_enabled == True
        )
    )
    rules = rules_result.scalars().all()
    
    for rule in rules:
        if rule.company_id:
            company_ids = [rule.company_id]
        else:
            pm_result = await session.execute(
                select(PortfolioMembership.company_id)
            )
            company_ids = [r[0] for r in pm_result.all()]
        
        multiplier = rule.volume_multiplier or 2.0
        lookback = rule.volume_lookback_days or 20
        
        for cid in company_ids:
            # Get most recent price bar
            latest_result = await session.execute(
                select(PriceBar)
                .where(PriceBar.company_id == cid)
                .order_by(PriceBar.date.desc())
                .limit(1)
            )
            latest = latest_result.scalar_one_or_none()
            if not latest or not latest.volume:
                continue
            
            # Get average volume over lookback period (excluding latest)
            avg_result = await session.execute(
                select(func.avg(PriceBar.volume))
                .where(
                    PriceBar.company_id == cid,
                    PriceBar.date < latest.date
                )
                .order_by(PriceBar.date.desc())
                .limit(lookback)
            )
            avg_vol = avg_result.scalar_one_or_none()
            
            if not avg_vol or avg_vol == 0:
                continue
            
            vol_mult = volume_multiple(latest.volume, avg_vol)
            if vol_mult is None:
                continue
            
            if vol_mult >= multiplier:
                dedup_key = f"volume_{rule.id}_{cid}_{latest.date}"
                existing = await session.execute(
                    select(AlertEvent).where(
                        AlertEvent.alert_rule_id == rule.id,
                        AlertEvent.company_id == cid,
                        AlertEvent.trigger_value == dedup_key
                    )
                )
                if existing.scalar_one_or_none() is not None:
                    continue
                
                company = await session.get(Company, cid)
                
                event = AlertEvent(
                    alert_rule_id=rule.id,
                    company_id=cid,
                    triggered_at=datetime.utcnow(),
                    trigger_value=dedup_key,
                    observed_value=f"{vol_mult:.1f}x average on {latest.date} (vol={latest.volume:,})",
                    threshold_value=f"{multiplier}x average ({lookback}-day lookback)",
                    is_acknowledged=False,
                    related_price_bar_id=latest.id,
                    is_demo=latest.is_demo,
                    dedup_key=dedup_key
                )
                session.add(event)
                triggered.append({
                    "rule": rule.name,
                    "company": company.ticker if company else str(cid),
                    "volume_multiple": f"{vol_mult:.1f}x",
                    "threshold": f"{multiplier}x",
                    "date": str(latest.date)
                })
    
    await session.flush()
    return triggered


async def evaluate_announcement_alerts(session: AsyncSession) -> list[dict]:
    """Evaluate material announcement alert rules against unprocessed announcements.
    
    Returns list of triggered alert event dicts.
    """
    from app.models.alert import AlertRule, AlertEvent
    from app.models.announcement import Announcement, AnnouncementClassification
    from app.models.company import Company
    
    triggered = []
    
    rules_result = await session.execute(
        select(AlertRule).where(
            AlertRule.rule_type == "material_announcement",
            AlertRule.is_enabled == True
        )
    )
    rules = rules_result.scalars().all()
    
    for rule in rules:
        if not rule.announcement_categories:
            continue
        
        try:
            categories = json.loads(rule.announcement_categories) if isinstance(rule.announcement_categories, str) else rule.announcement_categories
        except (json.JSONDecodeError, TypeError):
            continue
        
        # Get classified announcements matching the subscribed categories
        from sqlalchemy.orm import joinedload
        query = (
            select(Announcement)
            .join(AnnouncementClassification, Announcement.id == AnnouncementClassification.announcement_id)
            .where(AnnouncementClassification.category.in_(categories))
        )
        
        if rule.company_id:
            query = query.where(Announcement.company_id == rule.company_id)
        
        ann_result = await session.execute(query)
        announcements = ann_result.scalars().all()
        
        for ann in announcements:
            dedup_key = f"announcement_{rule.id}_{ann.id}"
            existing = await session.execute(
                select(AlertEvent).where(
                    AlertEvent.dedup_key == dedup_key
                )
            )
            if existing.scalar_one_or_none() is not None:
                continue
            
            company = await session.get(Company, ann.company_id)
            
            event = AlertEvent(
                alert_rule_id=rule.id,
                company_id=ann.company_id,
                triggered_at=datetime.utcnow(),
                trigger_value=dedup_key,
                observed_value=f"'{ann.title}' classified as '{ann.category or 'unknown'}'",
                threshold_value=f"Subscribed categories: {', '.join(categories)}",
                is_acknowledged=False,
                related_announcement_id=ann.id,
                is_demo=ann.is_demo,
                dedup_key=dedup_key
            )
            session.add(event)
            triggered.append({
                "rule": rule.name,
                "company": company.ticker if company else str(ann.company_id),
                "announcement": ann.title,
                "category": ann.category
            })
    
    await session.flush()
    return triggered


async def evaluate_all_alerts(session: AsyncSession) -> dict:
    """Run all alert evaluations. Returns summary."""
    price_alerts = await evaluate_price_alerts(session)
    volume_alerts = await evaluate_volume_alerts(session)
    announcement_alerts = await evaluate_announcement_alerts(session)
    
    return {
        "price_alerts_triggered": len(price_alerts),
        "volume_alerts_triggered": len(volume_alerts),
        "announcement_alerts_triggered": len(announcement_alerts),
        "total_triggered": len(price_alerts) + len(volume_alerts) + len(announcement_alerts),
        "details": {
            "price": price_alerts,
            "volume": volume_alerts,
            "announcement": announcement_alerts
        }
    }

