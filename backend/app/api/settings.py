"""AI platform settings. Anyone can see what's configured; only the owner can change it."""
import asyncio
import hmac
import ipaddress
from typing import Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import config
from app.core.database import get_db
from app.api.portfolios import ensure_company
from app.services import ai_settings, alert_settings, filing_ai, live_data, live_sync, notifications
from app.services.active_portfolio import active_portfolio

router = APIRouter(prefix="/api/settings", tags=["settings"])

LOCAL_HOSTNAMES = {"localhost", "127.0.0.1", "::1"}


class AiSettingsInput(BaseModel):
    # Plain strings, checked by hand: FastAPI's validation errors repeat the rejected value,
    # and a rejected value here could be someone's key.
    api_key: Optional[str] = None
    model: Optional[str] = None
    strong_model: Optional[str] = None
    activate: bool = False


def _is_loopback(host: str) -> bool:
    try:
        return ipaddress.ip_address(host.strip()).is_loopback
    except ValueError:
        return False


def _is_local_request(request: Request) -> bool:
    """True only for a browser on the machine running FINN, including through the Next.js proxy."""
    if request.client is None or not _is_loopback(request.client.host):
        return False
    # The proxy connects from localhost, so the original visitor is in this header.
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded and not all(_is_loopback(hop) for hop in forwarded.split(",")):
        return False
    # Stops a website open in the same browser from quietly calling this API.
    origin = request.headers.get("origin")
    return not origin or urlparse(origin).hostname in LOCAL_HOSTNAMES


def _can_edit(request: Request, token: Optional[str]) -> bool:
    if config.ADMIN_TOKEN:
        return bool(token) and hmac.compare_digest(token, config.ADMIN_TOKEN)
    return _is_local_request(request)


def require_owner(request: Request, x_finn_admin_token: Optional[str] = Header(default=None)) -> None:
    if not _can_edit(request, x_finn_admin_token):
        detail = (
            "The admin token is missing or wrong."
            if config.ADMIN_TOKEN
            else "Keys can only be changed on the computer running FINN. Set FINN_ADMIN_TOKEN to allow it from elsewhere."
        )
        raise HTTPException(status_code=403, detail=detail)


class NotificationInput(BaseModel):
    bot_token: Optional[str] = None
    chat_id: Optional[str] = None


@router.get("/alerts")
async def get_alert_preferences(
    request: Request, x_finn_admin_token: Optional[str] = Header(default=None), db: AsyncSession = Depends(get_db)
):
    return {
        **await alert_settings.get_preferences(db),
        "can_edit_notifications": _can_edit(request, x_finn_admin_token),
        "ai_enabled": filing_ai.ai_status()["configured"],
    }


@router.get("/alerts/preview")
async def preview_alert_thresholds(lookback: int = Query(20, ge=5, le=120), db: AsyncSession = Depends(get_db)):
    _, holdings = await active_portfolio(db)
    if not holdings:
        return {"companies": []}
    symbols = [h["yahoo"] for h in holdings]
    try:
        closes = (await asyncio.to_thread(live_data.get_closes, symbols))[0]
        volumes = (await asyncio.to_thread(live_data.get_volumes, symbols))[0]
    except live_data.LiveDataUnavailable as exc:
        raise HTTPException(status_code=503, detail=f"Yahoo Finance is unavailable: {exc}")
    return {"companies": alert_settings.preview_history(holdings, closes, volumes, lookback)}


# Thresholds sit alongside rules and portfolios, which this single-investor app leaves open.
# Only notification credentials are restricted, because they're secrets.
@router.put("/alerts")
async def save_alert_preferences(body: dict, db: AsyncSession = Depends(get_db)):
    try:
        await alert_settings.save_preferences(db, body, ensure_company)
    except alert_settings.InvalidPreference as exc:
        await db.rollback()
        raise HTTPException(status_code=422, detail=str(exc))
    # The new thresholds apply to the latest data straight away.
    await db.close()
    evaluation = await live_sync.sync_live_alerts()
    return {"new_alerts": evaluation["total_triggered"]}


@router.get("/notifications", dependencies=[Depends(require_owner)])
async def get_notifications():
    return notifications.status()


@router.put("/notifications", dependencies=[Depends(require_owner)])
async def save_notifications(body: NotificationInput):
    try:
        notifications.save(body.bot_token, body.chat_id)
    except notifications.InvalidNotificationSetting as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return notifications.status()


@router.delete("/notifications", dependencies=[Depends(require_owner)])
async def clear_notifications():
    notifications.clear()
    return notifications.status()


@router.post("/notifications/test", dependencies=[Depends(require_owner)])
async def test_notifications():
    sent, message = await notifications.send("FINN test: alerts will arrive here.")
    return {"ok": sent, "message": message}


@router.get("/ai")
async def get_ai_settings(request: Request, x_finn_admin_token: Optional[str] = Header(default=None)):
    can_edit = _can_edit(request, x_finn_admin_token)
    return {
        **ai_settings.settings_status(include_hints=can_edit),
        "can_edit": can_edit,
        "needs_token": bool(config.ADMIN_TOKEN) and not can_edit,
    }


@router.put("/ai/{provider_id}", dependencies=[Depends(require_owner)])
async def update_ai_settings(provider_id: str, body: AiSettingsInput, db: AsyncSession = Depends(get_db)):
    try:
        await ai_settings.save_settings(db, provider_id, body.api_key, body.model, body.activate, body.strong_model)
    except ai_settings.InvalidSetting as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return ai_settings.settings_status(include_hints=True)


@router.delete("/ai/{provider_id}/key", dependencies=[Depends(require_owner)])
async def delete_ai_key(provider_id: str, db: AsyncSession = Depends(get_db)):
    try:
        await ai_settings.remove_key(db, provider_id)
    except ai_settings.InvalidSetting as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return ai_settings.settings_status(include_hints=True)


@router.post("/ai/{provider_id}/test", dependencies=[Depends(require_owner)])
async def test_ai_settings(provider_id: str, body: AiSettingsInput):
    try:
        return await ai_settings.test_connection(provider_id, body.api_key, body.model)
    except ai_settings.InvalidSetting as exc:
        raise HTTPException(status_code=422, detail=str(exc))
