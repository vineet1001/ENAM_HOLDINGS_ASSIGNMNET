"""Tests for AI platform keys: storage, secrecy, access control and each platform's wire format."""
import json
import os
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from app.core import config
from app.main import app
from app.services import ai_providers, ai_settings, filing_ai

FAKE_KEY = "fake-key-abcdefgh-1234"


@pytest.fixture(autouse=True)
def clean_settings(tmp_path, monkeypatch):
    """A throwaway env file, with every setting put back afterwards."""
    env_file = tmp_path / ".env"
    monkeypatch.setattr(config, "ENV_FILE", env_file)
    monkeypatch.setattr(config, "ADMIN_TOKEN", "")
    monkeypatch.setattr(config, "LLM_PROVIDER", "gemini")
    monkeypatch.setattr(config, "LLM_API_KEY", "")
    monkeypatch.setattr(config, "LLM_MODEL", "gemini-3.5-flash-lite")
    monkeypatch.setattr(config, "LLM_STRONG_MODEL", "gemini-3.6-flash")
    monkeypatch.setattr(config, "LLM_BASE_URL", config.AI_PROVIDERS["gemini"]["base_url"])
    for provider in config.AI_PROVIDERS.values():
        monkeypatch.delenv(provider["key_env"], raising=False)
        monkeypatch.delenv(provider["model_env"], raising=False)
        monkeypatch.delenv(provider["strong_model_env"], raising=False)
    monkeypatch.delenv("LLM_PROVIDER", raising=False)
    yield env_file
    for provider in config.AI_PROVIDERS.values():
        os.environ.pop(provider["key_env"], None)
        os.environ.pop(provider["model_env"], None)
        os.environ.pop(provider["strong_model_env"], None)
    os.environ.pop("LLM_PROVIDER", None)


@pytest.fixture
def local():
    with TestClient(app, client=("127.0.0.1", 50000)) as client:
        yield client


@pytest.fixture
def remote():
    with TestClient(app, client=("203.0.113.9", 50000)) as client:
        yield client


# ---------- Saving and secrecy ----------

def test_key_is_saved_to_env_file_and_applies_without_restart(local, clean_settings):
    res = local.put("/api/settings/ai/gemini", json={"api_key": FAKE_KEY, "activate": True})
    assert res.status_code == 200
    assert FAKE_KEY in clean_settings.read_text()
    assert config.LLM_API_KEY == FAKE_KEY
    assert filing_ai.ai_status()["configured"] is True
    assert local.get("/api/health").json()["llm_configured"] is True


def test_full_key_is_never_returned(local):
    saved = local.put("/api/settings/ai/gemini", json={"api_key": FAKE_KEY, "activate": True})
    status = local.get("/api/settings/ai")
    for res in (saved, status):
        assert FAKE_KEY not in res.text
    gemini = next(p for p in status.json()["providers"] if p["id"] == "gemini")
    assert gemini["has_key"] is True
    assert gemini["key_hint"].endswith("1234")


def test_key_is_not_written_to_the_tracked_database(local):
    local.put("/api/settings/ai/gemini", json={"api_key": FAKE_KEY, "activate": True})
    database_path = Path(config.SYNC_DATABASE_URL.replace("sqlite:///", ""))
    assert FAKE_KEY.encode() not in database_path.read_bytes()


def test_env_file_is_ignored_by_git():
    root = Path(__file__).resolve().parents[2]
    ignored = [line.strip() for line in (root / ".gitignore").read_text().splitlines()]
    assert ".env" in ignored


@pytest.mark.parametrize("bad_key", ["short", "has spaces in the key", "line\nBREAK=injected_value", "x" * 600])
def test_bad_keys_are_rejected_without_repeating_them(local, clean_settings, bad_key):
    res = local.put("/api/settings/ai/gemini", json={"api_key": bad_key})
    assert res.status_code == 422
    assert bad_key not in res.text
    assert not clean_settings.exists() or "injected" not in clean_settings.read_text()


def test_cannot_use_a_platform_without_a_key(local):
    res = local.put("/api/settings/ai/groq", json={"activate": True})
    assert res.status_code == 422
    assert config.LLM_PROVIDER == "gemini"


def test_unknown_platform_is_rejected(local):
    assert local.put("/api/settings/ai/nope", json={"api_key": FAKE_KEY}).status_code == 422


def test_switching_platform_changes_key_model_and_address(local):
    local.put("/api/settings/ai/groq", json={"api_key": FAKE_KEY, "activate": True})
    assert config.LLM_PROVIDER == "groq"
    assert config.LLM_MODEL == config.AI_PROVIDERS["groq"]["default_model"]
    assert config.LLM_BASE_URL == config.AI_PROVIDERS["groq"]["base_url"]
    custom = local.put("/api/settings/ai/groq", json={"model": "llama-3.3-70b-versatile"}).json()
    assert config.LLM_MODEL == "llama-3.3-70b-versatile"
    assert next(p for p in custom["providers"] if p["id"] == "groq")["model"] == "llama-3.3-70b-versatile"


def test_removing_active_key_turns_ai_off(local, clean_settings):
    local.put("/api/settings/ai/gemini", json={"api_key": FAKE_KEY, "activate": True})
    assert local.delete("/api/settings/ai/gemini/key").status_code == 200
    assert FAKE_KEY not in clean_settings.read_text()
    assert filing_ai.ai_status()["configured"] is False


# ---------- Who may change keys ----------

def test_remote_visitor_can_look_but_not_change(remote):
    status = remote.get("/api/settings/ai").json()
    assert status["can_edit"] is False
    assert all(p["key_hint"] is None for p in status["providers"])
    assert remote.put("/api/settings/ai/gemini", json={"api_key": FAKE_KEY}).status_code == 403
    assert remote.post("/api/settings/ai/gemini/test", json={"api_key": FAKE_KEY}).status_code == 403
    assert remote.delete("/api/settings/ai/gemini/key").status_code == 403
    assert config.LLM_API_KEY == ""


def test_visitor_through_the_proxy_is_not_treated_as_local(local):
    res = local.put(
        "/api/settings/ai/gemini", json={"api_key": FAKE_KEY}, headers={"x-forwarded-for": "198.51.100.7"}
    )
    assert res.status_code == 403


def test_local_browser_through_the_proxy_is_allowed(local):
    res = local.put(
        "/api/settings/ai/gemini",
        json={"api_key": FAKE_KEY},
        headers={"x-forwarded-for": "::1", "origin": "http://localhost:3000"},
    )
    assert res.status_code == 200


def test_another_website_cannot_call_it_from_the_owners_browser(local):
    res = local.put("/api/settings/ai/gemini", json={"api_key": FAKE_KEY}, headers={"origin": "https://evil.example"})
    assert res.status_code == 403


def test_admin_token_is_required_once_set(local, remote, monkeypatch):
    monkeypatch.setattr(config, "ADMIN_TOKEN", "owner-secret-token")
    assert local.put("/api/settings/ai/gemini", json={"api_key": FAKE_KEY}).status_code == 403
    wrong = remote.put(
        "/api/settings/ai/gemini", json={"api_key": FAKE_KEY}, headers={"x-finn-admin-token": "wrong"}
    )
    assert wrong.status_code == 403
    good = remote.put(
        "/api/settings/ai/gemini", json={"api_key": FAKE_KEY}, headers={"x-finn-admin-token": "owner-secret-token"}
    )
    assert good.status_code == 200
    assert remote.get("/api/settings/ai").json()["needs_token"] is True


# ---------- Each platform's request and response ----------

def capture(monkeypatch, response_body, status=200, headers=None):
    seen = {}
    real_client = httpx.AsyncClient

    def handler(request):
        seen["url"] = str(request.url)
        seen["headers"] = request.headers
        seen["body"] = json.loads(request.content)
        return httpx.Response(status, json=response_body, headers=headers or {})

    monkeypatch.setattr(
        ai_providers.httpx, "AsyncClient", lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs)
    )
    return seen


SCHEMA = {"type": "object", "properties": {"headline": {"type": "string"}}, "required": ["headline"]}


@pytest.mark.asyncio
async def test_groq_request_and_response(monkeypatch):
    seen = capture(monkeypatch, {"choices": [{"message": {"content": '```json\n{"headline": "ok"}\n```'}}]})
    result = await ai_providers.complete("groq", "https://api.groq.com", FAKE_KEY, "m", "sys", "prompt", SCHEMA, 100)
    assert result == {"headline": "ok"}
    assert seen["url"] == "https://api.groq.com/openai/v1/chat/completions"
    assert seen["headers"]["authorization"] == f"Bearer {FAKE_KEY}"
    assert seen["body"]["response_format"] == {"type": "json_object"}
    assert "JSON Schema" in seen["body"]["messages"][0]["content"]


@pytest.mark.asyncio
async def test_openai_request_and_response(monkeypatch):
    seen = capture(monkeypatch, {"output": [
        {"type": "reasoning", "content": []},
        {"type": "message", "content": [{"type": "output_text", "text": '{"headline": "ok"}'}]},
    ]})
    result = await ai_providers.complete("openai", "https://api.openai.com", FAKE_KEY, "m", "sys", "prompt", SCHEMA, 100)
    assert result == {"headline": "ok"}
    assert seen["url"] == "https://api.openai.com/v1/responses"
    assert seen["body"]["store"] is False
    assert seen["body"]["max_output_tokens"] == 100


def test_claude_schema_is_closed_at_every_level():
    closed = ai_providers._closed_schema(filing_ai.SUMMARY_SCHEMA)
    assert closed["additionalProperties"] is False
    assert closed["properties"]["key_points"]["items"]["additionalProperties"] is False
    assert "additionalProperties" not in filing_ai.SUMMARY_SCHEMA  # The shared schema isn't changed.


class FakeClaudeMessages:
    def __init__(self, response, seen):
        self.response, self.seen = response, seen

    async def create(self, **kwargs):
        self.seen.update(kwargs)
        return self.response


class FakeClaudeClient:
    def __init__(self, response, seen, **init):
        seen["init"] = init
        self.messages = FakeClaudeMessages(response, seen)

    async def close(self):
        pass


class Block:
    def __init__(self, type, text=""):
        self.type, self.text = type, text


class ClaudeResponse:
    def __init__(self, content, stop_reason="end_turn"):
        self.content, self.stop_reason = content, stop_reason


@pytest.mark.asyncio
async def test_claude_uses_the_sdk_with_structured_output(monkeypatch):
    import anthropic

    seen = {}
    reply = ClaudeResponse([Block("thinking"), Block("text", '{"headline": "ok"}')])
    monkeypatch.setattr(anthropic, "AsyncAnthropic", lambda **init: FakeClaudeClient(reply, seen, **init))
    result = await ai_providers.complete("anthropic", "", FAKE_KEY, "claude-haiku-5-5", "sys", "prompt", SCHEMA, 100)
    assert result == {"headline": "ok"}
    assert seen["init"]["api_key"] == FAKE_KEY
    assert seen["init"]["max_retries"] == 0
    assert seen["output_config"]["format"]["schema"]["additionalProperties"] is False


@pytest.mark.asyncio
async def test_claude_refusal_is_reported(monkeypatch):
    import anthropic

    reply = ClaudeResponse([], stop_reason="refusal")
    monkeypatch.setattr(anthropic, "AsyncAnthropic", lambda **init: FakeClaudeClient(reply, {}, **init))
    with pytest.raises(ai_providers.AIUnavailable, match="declined"):
        await ai_providers.complete("anthropic", "", FAKE_KEY, "m", "sys", "prompt", SCHEMA, 100)


@pytest.mark.asyncio
async def test_rate_limit_carries_retry_after(monkeypatch):
    capture(monkeypatch, {}, status=429, headers={"retry-after": "42"})
    with pytest.raises(ai_providers.AIRateLimited) as caught:
        await ai_providers.complete("groq", "https://x", FAKE_KEY, "m", "sys", "prompt", SCHEMA, 100)
    assert caught.value.retry_after == 42


@pytest.mark.asyncio
async def test_non_json_answer_is_reported(monkeypatch):
    capture(monkeypatch, {"choices": [{"message": {"content": "Sorry, no."}}]})
    with pytest.raises(ai_providers.AIUnavailable, match="valid JSON"):
        await ai_providers.complete("groq", "https://x", FAKE_KEY, "m", "sys", "prompt", SCHEMA, 100)


# ---------- The Test button ----------

def test_test_button_reports_success_without_saving(local, monkeypatch, clean_settings):
    capture(monkeypatch, {"choices": [{"message": {"content": '{"status": "ok"}'}}]})
    res = local.post("/api/settings/ai/groq/test", json={"api_key": FAKE_KEY}).json()
    assert res["ok"] is True
    assert not clean_settings.exists()
    assert config.LLM_API_KEY == ""


def test_test_button_shows_the_platforms_error_and_scrubs_the_key(local, monkeypatch):
    capture(monkeypatch, {"error": {"message": f"Invalid API Key {FAKE_KEY}"}}, status=401)
    res = local.post("/api/settings/ai/groq/test", json={"api_key": FAKE_KEY})
    assert res.json()["ok"] is False
    assert "Invalid API Key" in res.json()["message"]
    assert FAKE_KEY not in res.text


def test_rate_limited_key_still_counts_as_accepted(local, monkeypatch):
    capture(monkeypatch, {}, status=429)
    assert local.post("/api/settings/ai/groq/test", json={"api_key": FAKE_KEY}).json()["ok"] is True


def test_test_button_needs_a_key(local):
    assert local.post("/api/settings/ai/groq/test", json={}).json()["ok"] is False
