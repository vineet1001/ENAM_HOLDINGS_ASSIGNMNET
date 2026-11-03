"""Talks to whichever AI platform is active. Each returns the model's text, or raises one of three errors."""
import json
from typing import Optional

import httpx

GEMINI_API_REVISION = "2026-05-20"
REQUEST_TIMEOUT_SECONDS = 120.0


class AIRateLimited(Exception):
    """The provider's quota was hit; try again later."""

    def __init__(self, message: str, retry_after: Optional[int] = None):
        super().__init__(message)
        self.retry_after = retry_after


class AIUnavailable(Exception):
    """The provider returned an error or an unusable answer."""


def _error_message(response: httpx.Response) -> str:
    """Providers send errors as an object, or as a one-item list holding that object."""
    try:
        body = response.json()
    except ValueError:
        return ""
    if isinstance(body, list) and body:
        body = body[0]
    error = body.get("error") if isinstance(body, dict) else None
    if isinstance(error, dict):
        return error.get("message", "")
    return error if isinstance(error, str) else ""


async def _post(url: str, headers: dict, body: dict) -> dict:
    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
            response = await client.post(url, headers=headers, json=body)
    except httpx.HTTPError as exc:
        raise AIUnavailable(f"Couldn't reach the model ({type(exc).__name__})") from exc

    if response.status_code == 429:
        retry_after = response.headers.get("retry-after", "")
        raise AIRateLimited(
            "The model's free quota was reached",
            int(retry_after) if retry_after.isdigit() else None,
        )
    if response.status_code != 200:
        # The provider's own message says what's wrong, such as a rejected key or retired model.
        detail = _error_message(response) or response.text[:200]
        raise AIUnavailable(f"Model error {response.status_code}: {detail}")
    try:
        return response.json()
    except ValueError as exc:
        raise AIUnavailable("The model returned an unreadable response") from exc


def _json_instruction(schema: dict) -> str:
    return f"Respond with only a JSON object matching this JSON Schema: {json.dumps(schema)}"


async def _call_gemini(base_url, key, model, system, prompt, schema, max_tokens) -> str:
    payload = await _post(
        f"{base_url.rstrip('/')}/v1beta/interactions",
        {"x-goog-api-key": key, "Api-Revision": GEMINI_API_REVISION},
        {
            "model": model,
            "store": False,
            "system_instruction": system,
            "input": prompt,
            "response_format": {"type": "text", "mime_type": "application/json", "schema": schema},
            "generation_config": {"max_output_tokens": max_tokens},
        },
    )
    if isinstance(payload.get("output_text"), str):
        return payload["output_text"]
    for step in reversed(payload.get("steps") or []):
        blocks = step.get("content") if isinstance(step, dict) else None
        texts = [b["text"] for b in (blocks or []) if isinstance(b, dict) and isinstance(b.get("text"), str)]
        if texts:
            return "".join(texts)
    raise AIUnavailable("The model returned no text")


async def _call_groq(base_url, key, model, system, prompt, schema, max_tokens) -> str:
    payload = await _post(
        f"{base_url.rstrip('/')}/openai/v1/chat/completions",
        {"Authorization": f"Bearer {key}"},
        {
            "model": model,
            "messages": [
                {"role": "system", "content": f"{system}\n\n{_json_instruction(schema)}"},
                {"role": "user", "content": prompt},
            ],
            "response_format": {"type": "json_object"},
            "max_completion_tokens": max_tokens,
        },
    )
    try:
        text = payload["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise AIUnavailable("The model returned no text") from exc
    if not isinstance(text, str) or not text:
        raise AIUnavailable("The model returned no text")
    return text


async def _call_openai(base_url, key, model, system, prompt, schema, max_tokens) -> str:
    payload = await _post(
        f"{base_url.rstrip('/')}/v1/responses",
        {"Authorization": f"Bearer {key}"},
        {
            "model": model,
            "store": False,
            "instructions": f"{system}\n\n{_json_instruction(schema)}",
            "input": prompt,
            "text": {"format": {"type": "json_object"}},
            "max_output_tokens": max_tokens,
        },
    )
    texts = [
        block["text"]
        for item in payload.get("output") or []
        if isinstance(item, dict)
        for block in item.get("content") or []
        if isinstance(block, dict) and block.get("type") == "output_text" and isinstance(block.get("text"), str)
    ]
    if not texts:
        raise AIUnavailable("The model returned no text")
    return "".join(texts)


def _closed_schema(schema: dict) -> dict:
    """Claude's structured output requires every object to set additionalProperties: false."""
    closed = dict(schema)
    if closed.get("type") == "object":
        closed["additionalProperties"] = False
        closed["properties"] = {name: _closed_schema(value) for name, value in closed.get("properties", {}).items()}
    elif closed.get("type") == "array":
        closed["items"] = _closed_schema(closed["items"])
    return closed


async def _call_anthropic(base_url, key, model, system, prompt, schema, max_tokens) -> str:
    import anthropic

    # Retries are off because FINN does its own pacing and pauses when a quota is hit.
    client = anthropic.AsyncAnthropic(
        api_key=key, base_url=base_url or None, max_retries=0, timeout=REQUEST_TIMEOUT_SECONDS
    )
    try:
        response = await client.messages.create(
            model=model,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": prompt}],
            output_config={"effort": "low", "format": {"type": "json_schema", "schema": _closed_schema(schema)}},
        )
    except anthropic.RateLimitError as exc:
        retry_after = exc.response.headers.get("retry-after", "")
        raise AIRateLimited(
            "The model's quota was reached", int(retry_after) if retry_after.isdigit() else None
        ) from exc
    except anthropic.APIStatusError as exc:
        body = exc.body if isinstance(exc.body, dict) else {}
        error = body.get("error") if isinstance(body.get("error"), dict) else {}
        raise AIUnavailable(f"Model error {exc.status_code}: {error.get('message') or exc.message}") from exc
    except anthropic.APIConnectionError as exc:
        raise AIUnavailable(f"Couldn't reach the model ({type(exc).__name__})") from exc
    finally:
        await client.close()

    if response.stop_reason == "refusal":
        raise AIUnavailable("The model declined to read this filing")
    text = next((block.text for block in response.content if block.type == "text"), "")
    if not text:
        raise AIUnavailable("The model returned no text")
    return text


CALLERS = {
    "gemini": _call_gemini,
    "groq": _call_groq,
    "openai": _call_openai,
    "anthropic": _call_anthropic,
}


async def complete(
    provider: str, base_url: str, key: str, model: str, system: str, prompt: str, schema: dict, max_tokens: int
) -> dict:
    """Run one request on the given platform and return its JSON answer as a dict."""
    caller = CALLERS.get(provider)
    if caller is None:
        raise AIUnavailable(f"Unknown AI platform '{provider}'")
    text = await caller(base_url, key, model, system, prompt, schema, max_tokens)

    # Not every platform enforces the schema, so tolerate a fenced or padded answer.
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        raise AIUnavailable("The model returned an answer that wasn't valid JSON")
    try:
        parsed = json.loads(text[start:end + 1])
    except ValueError as exc:
        raise AIUnavailable("The model returned an answer that wasn't valid JSON") from exc
    if not isinstance(parsed, dict):
        raise AIUnavailable("The model returned an unexpected answer")
    return parsed
