"""Sends new alerts to the investor's phone through a Telegram bot, which is free and needs no app of ours."""
import logging
import os
import re
from typing import Optional

import httpx
from dotenv import set_key, unset_key

from app.core import config

logger = logging.getLogger("finn.notifications")

TOKEN_ENV = "TELEGRAM_BOT_TOKEN"
CHAT_ENV = "TELEGRAM_CHAT_ID"
TOKEN_PATTERN = re.compile(r"^\d{4,16}:[A-Za-z0-9_-]{20,200}$")
CHAT_PATTERN = re.compile(r"^-?\d{3,20}$|^@[A-Za-z0-9_]{4,64}$")
MAX_MESSAGE_ALERTS = 20
API_BASE = "https://api.telegram.org"

_last_error: Optional[str] = None


class InvalidNotificationSetting(ValueError):
    """Messages never repeat the submitted value."""


def status() -> dict:
    token = os.environ.get(TOKEN_ENV, "")
    return {
        "configured": bool(token and os.environ.get(CHAT_ENV)),
        "token_hint": f"••••{token[-4:]}" if token else None,
        "chat_id": os.environ.get(CHAT_ENV) or None,
        "last_error": _last_error,
    }


def save(token: Optional[str], chat_id: Optional[str]) -> None:
    new_token, new_chat = (token or "").strip(), (chat_id or "").strip()
    if new_token and not TOKEN_PATTERN.fullmatch(new_token):
        raise InvalidNotificationSetting("That doesn't look like a Telegram bot token.")
    if new_chat and not CHAT_PATTERN.fullmatch(new_chat):
        raise InvalidNotificationSetting("That doesn't look like a Telegram chat id.")
    config.ENV_FILE.parent.mkdir(parents=True, exist_ok=True)
    if new_token:
        set_key(str(config.ENV_FILE), TOKEN_ENV, new_token, quote_mode="always")
        os.environ[TOKEN_ENV] = new_token
    if new_chat:
        set_key(str(config.ENV_FILE), CHAT_ENV, new_chat, quote_mode="always")
        os.environ[CHAT_ENV] = new_chat


def clear() -> None:
    global _last_error
    for name in (TOKEN_ENV, CHAT_ENV):
        if config.ENV_FILE.exists():
            unset_key(str(config.ENV_FILE), name)
        os.environ.pop(name, None)
    _last_error = None


async def send(text: str) -> tuple[bool, str]:
    """Send one message. The reply and error text are scrubbed, because the token is in the URL."""
    global _last_error
    token, chat_id = os.environ.get(TOKEN_ENV, ""), os.environ.get(CHAT_ENV, "")
    if not token or not chat_id:
        return False, "Add a bot token and chat id first."
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(
                f"{API_BASE}/bot{token}/sendMessage",
                json={"chat_id": chat_id, "text": text[:3900], "disable_web_page_preview": True},
            )
    except httpx.HTTPError as exc:
        _last_error = f"Couldn't reach Telegram ({type(exc).__name__})"
        return False, _last_error
    if response.status_code != 200:
        try:
            detail = response.json().get("description", "")
        except ValueError:
            detail = ""
        _last_error = f"Telegram error {response.status_code}: {detail}".replace(token, "••••")
        return False, _last_error
    _last_error = None
    return True, "Sent. Check Telegram."


def format_alerts(evaluation: dict) -> Optional[str]:
    """One message for a whole sync, so a busy day is one notification rather than twenty."""
    details = evaluation.get("details") or {}
    lines = []
    for item in details.get("announcement", []):
        lines.append(f"📄 {item['company']}: {item['announcement']}")
    for item in details.get("price", []):
        lines.append(f"📈 {item['company']} moved {item['change']} (your limit {item['threshold']})")
    for item in details.get("volume", []):
        lines.append(f"📊 {item['company']} volume {item['volume_multiple']} of average (your limit {item['threshold']})")
    if not lines:
        return None
    shown = lines[:MAX_MESSAGE_ALERTS]
    extra = len(lines) - len(shown)
    return f"FINN: {len(lines)} new alert{'s' if len(lines) > 1 else ''}\n\n" + "\n".join(shown) + (f"\n\n…and {extra} more" if extra > 0 else "")


async def notify_new_alerts(evaluation: dict) -> None:
    message = format_alerts(evaluation)
    if message and status()["configured"]:
        sent, detail = await send(message)
        if not sent:
            logger.warning("Alert notification failed: %s", detail)
