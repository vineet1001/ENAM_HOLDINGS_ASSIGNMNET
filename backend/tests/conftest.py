"""Shared test setup: tests use a throwaway database copy and never touch the network or real data."""
import os
import shutil
import sqlite3
import tempfile
from pathlib import Path

# Must be set before anything from the app is imported, because config reads these at import time.
_real_db = Path(__file__).resolve().parents[1] / "data" / "db" / "finn.db"
_test_dir = tempfile.mkdtemp(prefix="finn-tests-")
_test_db = Path(_test_dir) / "finn.db"
shutil.copy(_real_db, _test_db)
try:
    with sqlite3.connect(_test_db) as _db:
        _db.execute("UPDATE custom_portfolios SET is_active = 0")
except sqlite3.OperationalError:
    pass  # The custom portfolio tables are created on first startup.
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_test_db.as_posix()}"
os.environ["SYNC_DATABASE_URL"] = f"sqlite:///{_test_db.as_posix()}"
os.environ["FINN_BACKGROUND_TASKS"] = "false"
os.environ["FINN_DOCS_DIR"] = str(Path(_test_dir) / "documents")
os.environ["LLM_API_KEY"] = ""
os.environ["LLM_PROVIDER"] = "gemini"
os.environ["FINN_ENV_FILE"] = str(Path(_test_dir) / ".env")
os.environ["LLM_MIN_SECONDS_BETWEEN_CALLS"] = "0"

import pytest  # noqa: E402

from app.services import live_data, screener  # noqa: E402

LISTED_COMPANIES = live_data.merge_universe(
    [
        {"SYMBOL": "TCS", "NAME OF COMPANY": "Tata Consultancy Services Limited", " ISIN NUMBER": "INE467B01029"},
        {"SYMBOL": "INFY", "NAME OF COMPANY": "Infosys Limited", " ISIN NUMBER": "INE009A01021"},
    ],
    [
        {"SCRIP_CD": "532540", "scrip_id": "TCS", "Scrip_Name": "Tata Consultancy Services Ltd", "ISIN_NUMBER": "INE467B01029"},
        {"SCRIP_CD": "500012", "scrip_id": "ANDHRAPET", "Scrip_Name": "Andhra Petrochemicals Ltd", "ISIN_NUMBER": "INE714B01016"},
    ],
)


@pytest.fixture(scope="session", autouse=True)
def fixed_company_lists():
    patcher = pytest.MonkeyPatch()
    patcher.setattr(live_data, "get_universe", lambda: LISTED_COMPANIES)
    patcher.setattr(screener, "get_company_data", lambda ticker, yahoo=None: None)
    patcher.setattr(screener, "CACHE_DIR", Path(_test_dir) / "screener")
    yield
    patcher.undo()
    shutil.rmtree(_test_dir, ignore_errors=True)
