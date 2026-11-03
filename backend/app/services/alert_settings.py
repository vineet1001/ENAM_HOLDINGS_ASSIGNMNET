"""The investor's own definition of "unusual": thresholds, categories and per-stock overrides.

Global thresholds and overrides are stored as alert rules, so the engine has one thing to read.
Everything else lives in a small settings table.
"""
import json
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.alert import AlertRule
from app.models.company import Company
from app.models.research_insight import AppSetting

SETTINGS_KEY = "alert_preferences"
CATEGORIES = (
    "results", "M&A", "fund_raise", "management_change", "litigation", "insider_trading", "earnings_call",
    "investor_meetings", "credit_rating", "dividend", "bonus_split", "capex", "press_release",
    "postal_ballot", "agm_egm", "pledging", "unclassified",
)
DEFAULT_FOCUS = ["results", "M&A", "fund_raise", "management_change", "litigation", "credit_rating", "pledging", "capex"]
DEFAULTS = {
    "alert_lookback_days": 7,
    "sync_minutes": 15,
    "digest_default_hours": 24,
    "digest_focus_categories": DEFAULT_FOCUS,
    "move_watch_percent": 2.0,
}
LIMITS = {
    "price_threshold": (0.5, 30.0),
    "volume_multiple": (1.1, 20.0),
    "volume_lookback": (5, 120),
    "alert_lookback_days": (1, 30),
    "sync_minutes": (5, 240),
    "move_watch_percent": (0.25, 10.0),
}
DIGEST_WINDOWS = (24, 72, 168, 720)
DIRECTIONS = ("both", "above", "below")


PREVIEW_SESSIONS = 30


def preview_history(holdings: list[dict], closes, volumes, lookback: int) -> list[dict]:
    """Each holding's recent daily moves and volume multiples, worked out the same way the rules work them out.

    The page counts against these as the slider moves, so a threshold can be tried before it's saved.
    """
    rows = []
    for holding in holdings:
        symbol = holding["yahoo"]
        if symbol not in closes.columns:
            continue
        series = closes[symbol].dropna()
        changes = (series.pct_change().dropna() * 100).tail(PREVIEW_SESSIONS)
        multiples = []
        if symbol in volumes.columns:
            volume = volumes[symbol].dropna()
            volume = volume[volume > 0]
            average = volume.shift(1).rolling(lookback, min_periods=5).mean()
            multiples = [round(float(v), 2) for v in (volume / average).dropna().tail(PREVIEW_SESSIONS)]
        rows.append({
            "ticker": holding["ticker"],
            "name": holding["name"],
            "changes": [round(float(v), 2) for v in changes],
            "volume_multiples": multiples,
        })
    return rows


class InvalidPreference(ValueError):
    """A setting outside what the app can honour."""


def _in_range(name: str, value) -> float:
    low, high = LIMITS[name]
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise InvalidPreference(f"{name.replace('_', ' ').capitalize()} must be a number") from exc
    if not low <= number <= high:
        raise InvalidPreference(f"{name.replace('_', ' ').capitalize()} must be between {low} and {high}")
    return number


async def stored_preferences(db: AsyncSession) -> dict:
    row = await db.get(AppSetting, SETTINGS_KEY)
    saved = json.loads(row.value_json) if row else {}
    return {**DEFAULTS, **saved}


async def _global_rule(db: AsyncSession, rule_type: str) -> Optional[AlertRule]:
    rows = await db.execute(
        select(AlertRule)
        .where(AlertRule.rule_type == rule_type, AlertRule.company_id.is_(None))
        .order_by(AlertRule.id)
    )
    return rows.scalars().first()


def _rule_categories(rule: AlertRule) -> list[str]:
    try:
        parsed = json.loads(rule.announcement_categories or "[]")
    except ValueError:
        return []
    return parsed if isinstance(parsed, list) else []


async def get_preferences(db: AsyncSession) -> dict:
    stored = await stored_preferences(db)
    price = await _global_rule(db, "price_movement")
    volume = await _global_rule(db, "unusual_volume")

    filing_rules = (await db.execute(
        select(AlertRule).where(
            AlertRule.rule_type == "material_announcement", AlertRule.company_id.is_(None),
            AlertRule.is_enabled == True,  # noqa: E712
        )
    )).scalars().all()
    subscribed = sorted({c for rule in filing_rules for c in _rule_categories(rule)})
    extra_rules = (await db.execute(
        select(AlertRule).where(
            AlertRule.rule_type.in_(("price_movement", "unusual_volume")), AlertRule.company_id.is_(None),
            AlertRule.is_enabled == True,  # noqa: E712
            AlertRule.id.not_in([r.id for r in (price, volume) if r]),
        )
    )).scalars().all()

    override_rows = (await db.execute(
        select(AlertRule, Company.ticker, Company.name)
        .join(Company, Company.id == AlertRule.company_id)
        .where(AlertRule.rule_type.in_(("price_movement", "unusual_volume")))
    )).all()
    merged: dict[str, dict] = {}
    for rule, ticker, name in override_rows:
        entry = merged.setdefault(ticker, {"ticker": ticker, "name": name, "price_threshold": None, "volume_multiple": None})
        if rule.rule_type == "price_movement":
            entry["price_threshold"] = rule.threshold_value
        else:
            entry["volume_multiple"] = rule.volume_multiplier

    return {
        "price_enabled": bool(price and price.is_enabled),
        "price_threshold": price.threshold_value if price and price.threshold_value else 3.0,
        "price_direction": (price.threshold_direction if price else None) or "both",
        "volume_enabled": bool(volume and volume.is_enabled),
        "volume_multiple": volume.volume_multiplier if volume and volume.volume_multiplier else 2.0,
        "volume_lookback": volume.volume_lookback_days if volume and volume.volume_lookback_days else 20,
        "categories": subscribed,
        "overrides": sorted(merged.values(), key=lambda o: o["ticker"]),
        "other_rules": [r.name for r in extra_rules],
        **stored,
        "all_categories": list(CATEGORIES),
        "digest_windows": list(DIGEST_WINDOWS),
        "limits": {k: list(v) for k, v in LIMITS.items()},
    }


async def _upsert_global(db: AsyncSession, rule_type: str, name: str) -> AlertRule:
    rule = await _global_rule(db, rule_type)
    if rule is None:
        rule = AlertRule(name=name, rule_type=rule_type, is_enabled=True)
        db.add(rule)
    return rule


async def _save_categories(db: AsyncSession, chosen: list[str]) -> None:
    """One rule per category, so each alert can say which subscription raised it."""
    rules = (await db.execute(
        select(AlertRule).where(AlertRule.rule_type == "material_announcement", AlertRule.company_id.is_(None))
    )).scalars().all()
    covered = set()
    for rule in rules:
        categories = _rule_categories(rule)
        rule.is_enabled = bool(set(categories) & set(chosen))
        if rule.is_enabled:
            covered |= set(categories)
    for category in chosen:
        if category not in covered:
            db.add(AlertRule(
                name=f"{category.replace('_', ' ').capitalize()} filings",
                rule_type="material_announcement",
                announcement_categories=json.dumps([category]),
                is_enabled=True,
            ))


async def _save_overrides(db: AsyncSession, overrides: list[dict], ensure_company) -> None:
    """Replaces every per-stock rule with the submitted list. Companies not listed fall back to the global rule."""
    existing = (await db.execute(
        select(AlertRule).where(
            AlertRule.rule_type.in_(("price_movement", "unusual_volume")), AlertRule.company_id.is_not(None)
        )
    )).scalars().all()
    # A rule's alert history cascades with it, so matching rules are updated rather than recreated.
    by_key = {(rule.company_id, rule.rule_type): rule for rule in existing}
    wanted = set()
    for override in overrides:
        company = await ensure_company(db, str(override.get("ticker", "")))
        price, volume = override.get("price_threshold"), override.get("volume_multiple")
        if price not in (None, ""):
            value = _in_range("price_threshold", price)
            rule = by_key.get((company.id, "price_movement"))
            if rule is None:
                rule = AlertRule(
                    name=f"{company.ticker} price move", rule_type="price_movement", company_id=company.id,
                    threshold_direction="both",
                )
                db.add(rule)
            rule.threshold_value, rule.is_enabled = value, True
            wanted.add((company.id, "price_movement"))
        if volume not in (None, ""):
            value = _in_range("volume_multiple", volume)
            rule = by_key.get((company.id, "unusual_volume"))
            if rule is None:
                rule = AlertRule(
                    name=f"{company.ticker} volume spike", rule_type="unusual_volume", company_id=company.id,
                    volume_lookback_days=20,
                )
                db.add(rule)
            rule.volume_multiplier, rule.is_enabled = value, True
            wanted.add((company.id, "unusual_volume"))
    for key, rule in by_key.items():
        if key not in wanted:
            await db.delete(rule)


async def save_preferences(db: AsyncSession, body: dict, ensure_company) -> None:
    """Checks everything before changing anything, so a bad value can't leave settings half-saved."""
    price_threshold = _in_range("price_threshold", body.get("price_threshold", 3.0))
    volume_multiple = _in_range("volume_multiple", body.get("volume_multiple", 2.0))
    volume_lookback = int(_in_range("volume_lookback", body.get("volume_lookback", 20)))
    direction = body.get("price_direction", "both")
    if direction not in DIRECTIONS:
        raise InvalidPreference("Direction must be both, above or below")
    categories = body.get("categories", [])
    focus = body.get("digest_focus_categories", DEFAULT_FOCUS)
    for category in [*categories, *focus]:
        if category not in CATEGORIES:
            raise InvalidPreference(f"Unknown category: {category}")
    hours = int(body.get("digest_default_hours", 24))
    if hours not in DIGEST_WINDOWS:
        raise InvalidPreference("That digest window isn't available")
    stored = {
        "alert_lookback_days": int(_in_range("alert_lookback_days", body.get("alert_lookback_days", 7))),
        "sync_minutes": int(_in_range("sync_minutes", body.get("sync_minutes", 15))),
        "digest_default_hours": hours,
        "digest_focus_categories": focus,
        "move_watch_percent": _in_range("move_watch_percent", body.get("move_watch_percent", 2.0)),
    }

    price = await _upsert_global(db, "price_movement", "Global price move")
    price.threshold_value = price_threshold
    price.threshold_direction = direction
    price.is_enabled = bool(body.get("price_enabled", True))

    volume = await _upsert_global(db, "unusual_volume", "Global volume spike")
    volume.volume_multiplier = volume_multiple
    volume.volume_lookback_days = volume_lookback
    volume.is_enabled = bool(body.get("volume_enabled", True))

    await _save_categories(db, categories)
    await _save_overrides(db, body.get("overrides", []), ensure_company)

    row = await db.get(AppSetting, SETTINGS_KEY)
    if row is None:
        db.add(AppSetting(key=SETTINGS_KEY, value_json=json.dumps(stored)))
    else:
        row.value_json = json.dumps(stored)
    await db.commit()
