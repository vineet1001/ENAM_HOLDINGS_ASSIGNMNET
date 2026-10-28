"""Application configuration loaded from environment variables."""
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# Base paths
BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = BASE_DIR / "data"
DB_DIR = DATA_DIR / "db"
DOCS_DIR = DATA_DIR / "documents"

# Ensure directories exist
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_DIR.mkdir(parents=True, exist_ok=True)
DOCS_DIR.mkdir(parents=True, exist_ok=True)

# Database
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite+aiosqlite:///{DB_DIR / 'finn.db'}")
SYNC_DATABASE_URL = os.getenv("SYNC_DATABASE_URL", f"sqlite:///{DB_DIR / 'finn.db'}")

# AI Provider
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "gemini")  # gemini, openai, none
LLM_API_KEY = os.getenv("LLM_API_KEY", os.getenv("GEMINI_API_KEY", os.getenv("OPENAI_API_KEY", "")))
LLM_MODEL = os.getenv("LLM_MODEL", "gemini-2.0-flash")
LLM_STRONG_MODEL = os.getenv("LLM_STRONG_MODEL", "gemini-2.5-pro-preview-05-06")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "text-embedding-004")

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

