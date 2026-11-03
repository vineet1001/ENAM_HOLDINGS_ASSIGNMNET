"""Application configuration loaded from environment variables."""
import os
from pathlib import Path
from dotenv import load_dotenv

# Base paths
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# Saved API keys live here. Git ignores this file; the database is tracked, so keys never go there.
ENV_FILE = Path(os.getenv("FINN_ENV_FILE") or BASE_DIR / ".env")
load_dotenv(ENV_FILE)
if not os.getenv("FINN_ENV_FILE"):
    load_dotenv()

DATA_DIR = BASE_DIR / "data"
DB_DIR = DATA_DIR / "db"
DOCS_DIR = Path(os.getenv("FINN_DOCS_DIR") or DATA_DIR / "documents")

# Ensure directories exist
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_DIR.mkdir(parents=True, exist_ok=True)
DOCS_DIR.mkdir(parents=True, exist_ok=True)

# Database
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite+aiosqlite:///{DB_DIR / 'finn.db'}")
SYNC_DATABASE_URL = os.getenv("SYNC_DATABASE_URL", f"sqlite:///{DB_DIR / 'finn.db'}")

# AI Provider
AI_PROVIDERS = {
    "gemini": {
        "name": "Google Gemini",
        "key_env": "GEMINI_API_KEY",
        "model_env": "GEMINI_MODEL",
        "default_model": "gemini-3.5-flash-lite",
        "strong_model_env": "GEMINI_STRONG_MODEL",
        "default_strong_model": "gemini-3.6-flash",
        "base_url": "https://generativelanguage.googleapis.com",
        "key_url": "https://aistudio.google.com/apikey",
        "note": "Has a free tier. Free-tier data may be used to improve Google's products.",
    },
    "groq": {
        "name": "Groq",
        "key_env": "GROQ_API_KEY",
        "model_env": "GROQ_MODEL",
        "default_model": "openai/gpt-oss-20b",
        "strong_model_env": "GROQ_STRONG_MODEL",
        "default_strong_model": "llama-3.3-70b-versatile",
        "base_url": "https://api.groq.com",
        "key_url": "https://console.groq.com/keys",
        "note": "Very fast, low-cost hosted open models.",
    },
    "openai": {
        "name": "OpenAI",
        "key_env": "OPENAI_API_KEY",
        "model_env": "OPENAI_MODEL",
        "default_model": "gpt-6-luna",
        "strong_model_env": "OPENAI_STRONG_MODEL",
        "default_strong_model": "gpt-6.1-terra",
        "base_url": "https://api.openai.com",
        "key_url": "https://platform.openai.com/api-keys",
        "note": "Paid API. The default is its lowest-cost model.",
    },
    "anthropic": {
        "name": "Anthropic Claude",
        "key_env": "ANTHROPIC_API_KEY",
        "model_env": "ANTHROPIC_MODEL",
        "default_model": "claude-haiku-5-5",
        "strong_model_env": "ANTHROPIC_STRONG_MODEL",
        "default_strong_model": "claude-sonnet-5-5",
        "base_url": "https://api.anthropic.com",
        "key_url": "https://platform.claude.com/settings/keys",
        "note": "Paid API. The default is its lightweight model.",
    },
}

LLM_PROVIDER = os.getenv("LLM_PROVIDER", "gemini")
if LLM_PROVIDER not in AI_PROVIDERS:
    LLM_PROVIDER = "gemini"
_active_provider = AI_PROVIDERS[LLM_PROVIDER]
LLM_API_KEY = os.getenv("LLM_API_KEY") or os.getenv(_active_provider["key_env"], "")
LLM_MODEL = os.getenv("LLM_MODEL") or os.getenv(_active_provider["model_env"]) or _active_provider["default_model"]
LLM_STRONG_MODEL = os.getenv(_active_provider["strong_model_env"]) or _active_provider["default_strong_model"]
LLM_BASE_URL = os.getenv("LLM_BASE_URL") or _active_provider["base_url"]
# When set, changing keys requires this token. Needed to manage keys on a hosted deployment.
ADMIN_TOKEN = os.getenv("FINN_ADMIN_TOKEN", "")
# Spacing between model calls, to stay inside free-tier request limits.
LLM_MIN_SECONDS_BETWEEN_CALLS = float(os.getenv("LLM_MIN_SECONDS_BETWEEN_CALLS", "5"))

# Live alerts: how far back a filing can be and still raise an alert, and how often to re-check.
ALERT_LOOKBACK_DAYS = int(os.getenv("ALERT_LOOKBACK_DAYS", "7"))
LIVE_SYNC_MINUTES = int(os.getenv("LIVE_SYNC_MINUTES", "15"))
BACKGROUND_TASKS_ENABLED = os.getenv("FINN_BACKGROUND_TASKS", "true").lower() in ("true", "1", "yes")

# Demo mode
DEMO_MODE = os.getenv("DEMO_MODE", "true").lower() in ("true", "1", "yes")

# Market data
YAHOO_FINANCE_ENABLED = os.getenv("YAHOO_FINANCE_ENABLED", "true").lower() in ("true", "1", "yes")

# Alert defaults
DEFAULT_PRICE_ALERT_THRESHOLD = float(os.getenv("DEFAULT_PRICE_ALERT_THRESHOLD", "3.0"))
DEFAULT_VOLUME_MULTIPLIER = float(os.getenv("DEFAULT_VOLUME_MULTIPLIER", "2.0"))
DEFAULT_VOLUME_LOOKBACK = int(os.getenv("DEFAULT_VOLUME_LOOKBACK", "20"))

# Digest
DEFAULT_DIGEST_HOURS = int(os.getenv("DEFAULT_DIGEST_HOURS", "24"))

# Server
API_HOST = os.getenv("API_HOST", "0.0.0.0")
API_PORT = int(os.getenv("API_PORT", "8000"))
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")

# Rate limiting
RATE_LIMIT_CALLS = int(os.getenv("RATE_LIMIT_CALLS", "60"))
RATE_LIMIT_PERIOD = int(os.getenv("RATE_LIMIT_PERIOD", "60"))

