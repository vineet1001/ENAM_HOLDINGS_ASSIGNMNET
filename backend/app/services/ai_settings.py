"""Saves AI platform keys. They live in the git-ignored .env file, never in the tracked database."""
import os
import re
from typing import Optional

from dotenv import set_key, unset_key
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import config
from app.models.filing_insight import FilingInsight
from app.services import filing_ai

KEY_PATTERN = re.compile(r"^[\x21-\x7e]{8,512}$")
MODEL_PATTERN = re.compile(r"^[A-Za-z0-9._:/-]{1,100}$")
TEST_SCHEMA = {
    "type": "object",
    "properties": {"status": {"type": "string"}},
    "required": ["status"],
}


class InvalidSetting(ValueError):
    """The submitted key or model isn't acceptable. Messages never repeat the value."""


def _provider(provider_id: str) -> dict:
    provider = config.AI_PROVIDERS.get(provider_id)
    if provider is None:
        raise InvalidSetting("Unknown AI platform")
    return provider


def _key_hint(key: str) -> Optional[str]:
    return f"••••{key[-4:]}" if key else None


def _saved_key(provider_id: str) -> str:
    if provider_id == config.LLM_PROVIDER and config.LLM_API_KEY:
        return config.LLM_API_KEY.strip()
    return os.environ.get(config.AI_PROVIDERS[provider_id]["key_env"], "").strip()


def _saved_model(provider_id: str) -> str:
    if provider_id == config.LLM_PROVIDER:
        return config.LLM_MODEL
    provider = config.AI_PROVIDERS[provider_id]
    return os.environ.get(provider["model_env"]) or provider["default_model"]


def _saved_strong_model(provider_id: str) -> str:
    if provider_id == config.LLM_PROVIDER:
        return config.LLM_STRONG_MODEL
    provider = config.AI_PROVIDERS[provider_id]
    return os.environ.get(provider["strong_model_env"]) or provider["default_strong_model"]


def settings_status(include_hints: bool) -> dict:
    """Never includes a key. Hints are only given to someone allowed to edit them."""
    return {
        "active_provider": config.LLM_PROVIDER,
        "providers": [
            {
                "id": provider_id,
                "name": provider["name"],
                "key_url": provider["key_url"],
                "note": provider["note"],
                "default_model": provider["default_model"],
                "model": _saved_model(provider_id),
                "strong_model": _saved_strong_model(provider_id),
                "default_strong_model": provider["default_strong_model"],
                "has_key": bool(_saved_key(provider_id)),
                "key_hint": _key_hint(_saved_key(provider_id)) if include_hints else None,
                "is_active": provider_id == config.LLM_PROVIDER,
            }
            for provider_id, provider in config.AI_PROVIDERS.items()
        ],
    }


def _write_env(name: str, value: str) -> None:
    config.ENV_FILE.parent.mkdir(parents=True, exist_ok=True)
    set_key(str(config.ENV_FILE), name, value, quote_mode="always")
    os.environ[name] = value


async def _give_filings_another_chance(db: AsyncSession) -> None:
    """Filings that failed under an earlier key or platform can now be read."""
    await db.execute(
        update(FilingInsight)
        .where(FilingInsight.status.in_(("pending", "failed")))
        .values(attempts=0, status="pending", note=None)
    )
    await db.commit()


def _apply_active(provider_id: str) -> None:
    """Takes effect immediately, so no restart is needed."""
    provider = config.AI_PROVIDERS[provider_id]
    config.LLM_API_KEY = os.environ.get(provider["key_env"], "").strip()
    config.LLM_PROVIDER = provider_id
    config.LLM_MODEL = os.environ.get(provider["model_env"]) or provider["default_model"]
    config.LLM_STRONG_MODEL = os.environ.get(provider["strong_model_env"]) or provider["default_strong_model"]
    config.LLM_BASE_URL = os.getenv("LLM_BASE_URL") or provider["base_url"]
    filing_ai.reset_state()


async def save_settings(
    db: AsyncSession, provider_id: str, api_key: Optional[str], model: Optional[str], activate: bool,
    strong_model: Optional[str] = None,
) -> None:
    provider = _provider(provider_id)
    key = (api_key or "").strip()
    chosen_model = (model or "").strip()
    chosen_strong = (strong_model or "").strip()
    if chosen_strong and not MODEL_PATTERN.fullmatch(chosen_strong):
        raise InvalidSetting("That model name has characters model names don't use.")
    if key and not KEY_PATTERN.fullmatch(key):
        raise InvalidSetting("That doesn't look like an API key. Paste it again with no spaces or line breaks.")
    if chosen_model and not MODEL_PATTERN.fullmatch(chosen_model):
        raise InvalidSetting("That model name has characters model names don't use.")
    if activate and not key and not _saved_key(provider_id):
        raise InvalidSetting(f"Add a key for {provider['name']} before using it.")

    if key:
        _write_env(provider["key_env"], key)
    if chosen_model:
        _write_env(provider["model_env"], chosen_model)
    if chosen_strong:
        _write_env(provider["strong_model_env"], chosen_strong)
    if activate:
        _write_env("LLM_PROVIDER", provider_id)

    if activate or provider_id == config.LLM_PROVIDER:
        _apply_active(provider_id)
        await _give_filings_another_chance(db)


async def remove_key(db: AsyncSession, provider_id: str) -> None:
    provider = _provider(provider_id)
    if config.ENV_FILE.exists():
        unset_key(str(config.ENV_FILE), provider["key_env"])
    os.environ.pop(provider["key_env"], None)
    if provider_id == config.LLM_PROVIDER:
        config.LLM_API_KEY = ""
        filing_ai.reset_state()


async def test_connection(provider_id: str, api_key: Optional[str], model: Optional[str]) -> dict:
    """One tiny real request. Uses the typed key, or the saved one if none was typed."""
    provider = _provider(provider_id)
    key = (api_key or "").strip() or _saved_key(provider_id)
    chosen_model = (model or "").strip() or _saved_model(provider_id)
    if not key:
        return {"ok": False, "message": "Add a key first."}
    if not KEY_PATTERN.fullmatch(key):
        return {"ok": False, "message": "That doesn't look like an API key."}
    if not MODEL_PATTERN.fullmatch(chosen_model):
        return {"ok": False, "message": "That model name has characters model names don't use."}

    base_url = config.LLM_BASE_URL if provider_id == config.LLM_PROVIDER else provider["base_url"]
    try:
        await filing_ai.ai_providers.complete(
            provider_id, base_url, key, chosen_model,
            'You check API connections. Respond with JSON only.',
            'Return the JSON object {"status": "ok"}.',
            TEST_SCHEMA, 200,
        )
    except filing_ai.AIRateLimited:
        return {"ok": True, "message": f"Key accepted, but {chosen_model} is rate limited right now."}
    except filing_ai.AIUnavailable as exc:
        # Scrubbed in case a provider ever repeats the key in its error.
        return {"ok": False, "message": str(exc).replace(key, "••••")}
    return {"ok": True, "message": f"Connected. {chosen_model} answered."}
