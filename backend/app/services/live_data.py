"""Live market data from free, keyless sources: Yahoo Finance prices, NSE and BSE filings
and company lists.

All arithmetic here is deterministic Python. Responses are cached so a page view never
turns into a burst of upstream calls, and the last good copy is served if a source fails.
"""
import csv
import io
import json
import re
import threading
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import httpx
import pandas as pd

from app.services.classifier import classify_announcement, compute_materiality_score
from app.services.financial_calc import pct_change

IST = timezone(timedelta(hours=5, minutes=30))
CACHE_TTL_SECONDS = 900
UNIVERSE_TTL_SECONDS = 86400
HISTORY_TTL_SECONDS = 6 * 3600
FILINGS_LOOKBACK_DAYS = 30
RANGE_DAYS = {"1M": 30, "3M": 91, "6M": 182, "1Y": 365}

# Seeded tickers that no longer trade under that symbol.
# Tata Motors' passenger-vehicle business kept the listing as TMPV after the 2025 demerger;
# Zomato's parent was renamed Eternal.
SYMBOL_ALIASES = {"TATAMOTORS": "TMPV", "ZOMATO": "ETERNAL"}

NSE_HOME = "https://www.nseindia.com/"
NSE_ANNOUNCEMENTS = "https://www.nseindia.com/api/corporate-announcements"
NSE_EQUITY_LIST = "https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv"
BSE_EQUITY_LIST = "https://api.bseindia.com/BseIndiaAPI/api/ListofScripData/w"
BSE_ANNOUNCEMENTS = "https://api.bseindia.com/BseIndiaAPI/api/AnnSubCategoryGetData/w"
BSE_ATTACHMENTS = "https://www.bseindia.com/xml-data/corpfiling/AttachLive/"

BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
    "Accept": "application/json,text/html,*/*",
    "Accept-Language": "en-US,en;q=0.9",
}
NSE_HEADERS = {**BROWSER_HEADERS, "Referer": NSE_HOME}
BSE_HEADERS = {**BROWSER_HEADERS, "Referer": "https://www.bseindia.com/", "Origin": "https://www.bseindia.com"}

UNIVERSE_CACHE_FILE = Path(__file__).resolve().parents[2] / "data" / "cache" / "listed_companies.json"

# NSE already labels each filing, which beats keyword matching wherever the label is specific.
# Vague labels such as "Updates" are left out and fall through to the keyword classifier.
NSE_CATEGORY_MAP = {
    "change in management": "management_change",
    "change in directorate": "management_change",
    "resignation of director": "management_change",
    "credit rating": "credit_rating",
    "amalgamation/merger": "M&A",
    "acquisition": "M&A",
    "scheme of arrangement": "M&A",
    "other restructuring": "M&A",
    "sale or disposal": "M&A",
    "analysts/institutional investor meet/con. call updates": "investor_meetings",
    "investor presentation": "investor_meetings",
    "shareholders meeting": "agm_egm",
    "postal ballot": "postal_ballot",
    "press release": "press_release",
    "rumour verification - regulation 30(11)": "press_release",
    "news verification": "press_release",
    "esop/esos/esps": "unclassified",
    "copy of newspaper publication": "unclassified",
    "certificate under sebi (depositories and participants) regulations, 2018": "unclassified",
    "trading window": "unclassified",
    "loss of share certificates": "unclassified",
}
EARNINGS_CALL_PATTERN = re.compile(r"transcript|earnings?\s+call|audio|video\s+recording", re.IGNORECASE)
AUDITOR_PATTERN = re.compile(r"\bauditors?\b", re.IGNORECASE)
FILING_PREFIX_PATTERN = re.compile(r"^.*?has informed the Exchange (?:regarding|about|that)\s*", re.IGNORECASE)


class LiveDataUnavailable(Exception):
    """Raised when a source failed and there is no earlier copy to fall back on."""


_cache: dict[str, tuple[float, object]] = {}
# One lock per key, so a slow company-list download never holds up a price request.
_fetch_locks: defaultdict[str, threading.Lock] = defaultdict(threading.Lock)


def _cached(key: str, fetch, ttl: int = CACHE_TTL_SECONDS):
    """Return (value, fetched_at_epoch, is_stale), refreshing the entry once its TTL expires."""
    with _fetch_locks[key]:
        entry = _cache.get(key)
        if entry and time.time() - entry[0] < ttl:
            return entry[1], entry[0], False
        try:
            value = fetch()
            _cache[key] = (time.time(), value)
            return value, _cache[key][0], False
        except Exception as exc:
            if entry:
                return entry[1], entry[0], True
            raise LiveDataUnavailable(str(exc)) from exc


def live_symbol(ticker: str) -> str:
    return SYMBOL_ALIASES.get(ticker.upper(), ticker.upper())


def yahoo_symbol_for(ticker: str, stored: Optional[str] = None) -> str:
    """Yahoo's symbol for a company: NSE symbols end in .NS, BSE scrip ids in .BO."""
    alias = SYMBOL_ALIASES.get(ticker.upper())
    if alias:
        return f"{alias}.NS"
    return stored or f"{ticker.upper()}.NS"


def exchange_of(yahoo_symbol: str) -> str:
    return "BSE" if yahoo_symbol.endswith(".BO") else "NSE"


# ---------- Prices ----------

def clean_closes(closes: pd.DataFrame) -> pd.DataFrame:
    """Drop empty tickers and the sparse rows Yahoo adds for a session with no closes yet."""
    closes = closes.dropna(axis=1, how="all")
    if closes.empty:
        return closes
    return closes.dropna(axis=0, thresh=max(1, (closes.shape[1] + 1) // 2)).sort_index()


def slice_range(closes: pd.DataFrame, range_key: str) -> pd.DataFrame:
    start = closes.index[-1] - pd.Timedelta(days=RANGE_DAYS[range_key])
    return closes[closes.index >= start]


def build_portfolio_index(
    closes: pd.DataFrame, weights: Optional[dict[str, float]] = None
) -> tuple[pd.Series, list[str]]:
    """Buy-and-hold index starting at 100: the weights are invested on day one, then left to drift.

    With no weights every stock counts equally. Stocks with no price on the first day are left
    out and the remaining weights scaled up, because adding them later would make the line jump.
    Returns the index and the columns excluded.
    """
    has_start = closes.iloc[0].notna()
    usable = closes.loc[:, has_start]
    if usable.empty:
        raise ValueError("No holding has a price at the start of this range")
    excluded = list(closes.columns[~has_start])
    rebased = usable.ffill() / usable.iloc[0] * 100.0
    if weights is None:
        return rebased.mean(axis=1), excluded
    applied = pd.Series({column: float(weights.get(column, 0.0)) for column in usable.columns})
    if applied.sum() <= 0:
        raise ValueError("No holding with a starting price has any weight")
    return rebased.mul(applied / applied.sum(), axis=1).sum(axis=1), excluded


def company_summary(closes: pd.Series) -> Optional[dict]:
    """Latest close, one-day change and change over the range for a single stock."""
    prices = closes.dropna()
    if prices.empty:
        return None
    previous = prices.iloc[-2] if len(prices) > 1 else None
    daily = pct_change(float(prices.iloc[-1]), float(previous)) if previous is not None else None
    period = pct_change(float(prices.iloc[-1]), float(prices.iloc[0]))
    return {
        "latest_close": round(float(prices.iloc[-1]), 2),
        "daily_change_pct": round(daily, 2) if daily is not None else None,
        "range_change_pct": round(period, 2) if period is not None else None,
        "latest_date": prices.index[-1].date().isoformat(),
    }


def _download_market_data(symbols: list[str]) -> dict[str, pd.DataFrame]:
    import yfinance as yf

    # auto_adjust=False keeps actual traded prices (split-adjusted, without dividend adjustment).
    frame = yf.download(symbols, period="1y", interval="1d", auto_adjust=False, progress=False, threads=True)
    if frame is None or frame.empty:
        raise RuntimeError("Yahoo Finance returned no price data")
    closes = frame["Close"]
    volumes = frame["Volume"]
    if isinstance(closes, pd.Series):
        closes = closes.to_frame(symbols[0])
        volumes = volumes.to_frame(symbols[0])
    closes = clean_closes(closes)
    if closes.empty:
        raise RuntimeError("Yahoo Finance returned no usable closes")
    return {"close": closes, "volume": volumes.reindex(closes.index)}


def _market_data(symbols: list[str]) -> tuple[dict[str, pd.DataFrame], float, bool]:
    ordered = sorted(set(symbols))
    return _cached("market:" + ",".join(ordered), lambda: _download_market_data(ordered))


def _download_history(symbols: list[str]) -> pd.DataFrame:
    """Ten years of daily closes, for scenarios and portfolio optimisation. Split-adjusted by Yahoo."""
    import yfinance as yf

    frame = yf.download(symbols, period="10y", interval="1d", auto_adjust=False, progress=False, threads=True)
    if frame is None or frame.empty:
        raise RuntimeError("Yahoo Finance returned no price history")
    closes = frame["Close"]
    if isinstance(closes, pd.Series):
        closes = closes.to_frame(symbols[0])
    # Rows aren't trimmed here, because a recently listed stock would cut everyone else's history short.
    closes = closes.dropna(axis=1, how="all").sort_index()
    if closes.empty:
        raise RuntimeError("Yahoo Finance returned no usable price history")
    return closes


def get_history(symbols: list[str]) -> tuple[pd.DataFrame, float, bool]:
    ordered = sorted(set(symbols))
    return _cached("history:" + ",".join(ordered), lambda: _download_history(ordered), ttl=HISTORY_TTL_SECONDS)


def get_closes(symbols: list[str]) -> tuple[pd.DataFrame, float, bool]:
    data, fetched_at, is_stale = _market_data(symbols)
    return data["close"], fetched_at, is_stale


def get_volumes(symbols: list[str]) -> tuple[pd.DataFrame, float, bool]:
    data, fetched_at, is_stale = _market_data(symbols)
    return data["volume"], fetched_at, is_stale


def _download_price_bars(symbol: str) -> list[dict]:
    import yfinance as yf

    history = yf.Ticker(symbol).history(period="1y", auto_adjust=False)
    if history is None or history.empty:
        raise RuntimeError(f"Yahoo Finance has no prices for {symbol}")
    history = history.dropna(subset=["Close"])
    return [
        {
            "date": index.date().isoformat(),
            "open": round(float(row["Open"]), 2),
            "high": round(float(row["High"]), 2),
            "low": round(float(row["Low"]), 2),
            "close": round(float(row["Close"]), 2),
            "adj_close": round(float(row["Close"]), 2),
            "volume": int(row["Volume"]),
            "source": "Yahoo Finance",
            "is_demo": False,
            "daily_change_pct": None,
        }
        for index, row in history.iterrows()
    ]


def get_price_bars(symbol: str) -> tuple[list[dict], float, bool]:
    return _cached(f"bars:{symbol}", lambda: _download_price_bars(symbol))


# ---------- Listed companies ----------

def merge_universe(nse_rows: list[dict], bse_rows: list[dict]) -> list[dict]:
    """Combine both exchanges' lists. ISIN identifies a security, so dual listings appear once."""
    companies: dict[str, dict] = {}
    nse_symbols = set()

    for row in nse_rows:
        cells = {key.strip(): (value or "").strip() for key, value in row.items() if key}
        symbol = cells.get("SYMBOL", "").upper()
        isin = cells.get("ISIN NUMBER", "")
        if not symbol:
            continue
        nse_symbols.add(symbol)
        companies[isin or f"NSE:{symbol}"] = {
            "ticker": symbol,
            "name": cells.get("NAME OF COMPANY", symbol),
            "isin": isin,
            "nse_symbol": symbol,
            "bse_code": None,
            "bse_id": None,
            "yahoo_symbol": f"{symbol}.NS",
            "exchanges": ["NSE"],
        }

    for row in bse_rows:
        code = str(row.get("SCRIP_CD") or "").strip()
        scrip_id = str(row.get("scrip_id") or "").strip().upper()
        isin = str(row.get("ISIN_NUMBER") or "").strip()
        if not code or not scrip_id:
            continue
        existing = companies.get(isin) if isin else None
        if existing:
            existing.update({"bse_code": code, "bse_id": scrip_id, "exchanges": ["NSE", "BSE"]})
            continue
        # A BSE id can match an unrelated NSE symbol; the numeric code is always unique.
        ticker = code if scrip_id in nse_symbols else scrip_id
        companies[isin or f"BSE:{code}"] = {
            "ticker": ticker,
            "name": str(row.get("Scrip_Name") or row.get("Issuer_Name") or scrip_id).strip(),
            "isin": isin,
            "nse_symbol": None,
            "bse_code": code,
            "bse_id": scrip_id,
            "yahoo_symbol": f"{scrip_id}.BO",
            "exchanges": ["BSE"],
        }
    return list(companies.values())


def _download_nse_list() -> list[dict]:
    response = httpx.get(NSE_EQUITY_LIST, headers=NSE_HEADERS, timeout=40.0, follow_redirects=True)
    response.raise_for_status()
    rows = list(csv.DictReader(io.StringIO(response.text)))
    if not rows:
        raise ValueError("NSE company list was empty")
    return rows


def _download_bse_list() -> list[dict]:
    response = httpx.get(
        BSE_EQUITY_LIST,
        params={"Group": "", "Scripcode": "", "industry": "", "segment": "Equity", "status": "Active"},
        headers=BSE_HEADERS, timeout=40.0, follow_redirects=True,
    )
    response.raise_for_status()
    rows = response.json()
    if not isinstance(rows, list) or not rows:
        raise ValueError("BSE company list was empty")
    return rows


def _read_universe_file() -> dict:
    try:
        return json.loads(UNIVERSE_CACHE_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _load_universe() -> list[dict]:
    saved = _read_universe_file()
    if saved and time.time() - saved.get("saved_at", 0) < UNIVERSE_TTL_SECONDS:
        return merge_universe(saved.get("nse", []), saved.get("bse", []))

    # Each list is optional: one exchange's outage shouldn't lose the other, or a saved copy.
    with ThreadPoolExecutor(max_workers=2) as pool:
        nse_future = pool.submit(_download_nse_list)
        bse_future = pool.submit(_download_bse_list)
    nse_rows = nse_future.result() if nse_future.exception() is None else saved.get("nse", [])
    bse_rows = bse_future.result() if bse_future.exception() is None else saved.get("bse", [])
    if not nse_rows and not bse_rows:
        raise RuntimeError("Could not load the NSE or BSE company lists")

    if nse_future.exception() is None and bse_future.exception() is None:
        try:
            UNIVERSE_CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
            UNIVERSE_CACHE_FILE.write_text(
                json.dumps({"saved_at": time.time(), "nse": nse_rows, "bse": bse_rows}), encoding="utf-8"
            )
        except OSError:
            pass  # A read-only host just re-downloads next time.
    return merge_universe(nse_rows, bse_rows)


def get_universe() -> list[dict]:
    return _cached("universe", _load_universe, ttl=UNIVERSE_TTL_SECONDS)[0]


def search_universe(query: str, limit: int = 20) -> list[dict]:
    """Best matches first: exact symbol, then symbol prefix, name prefix, then all words in the name."""
    text = query.strip().upper()
    words = text.split()
    if not words:
        return []

    ranked = []
    for company in get_universe():
        name = company["name"].upper()
        symbols = [s for s in (company["ticker"], company["nse_symbol"], company["bse_id"], company["bse_code"]) if s]
        if text in symbols or text == company["isin"]:
            rank = 0
        elif any(s.startswith(text) for s in symbols):
            rank = 1
        elif name.startswith(text):
            rank = 2
        elif all(word in name for word in words):
            rank = 3
        else:
            continue
        ranked.append((rank, len(name), company))
    ranked.sort(key=lambda item: (item[0], item[1], item[2]["ticker"]))
    return [item[2] for item in ranked[:limit]]


def find_listed_company(ticker: str) -> Optional[dict]:
    symbol = ticker.strip().upper()
    for company in get_universe():
        if symbol in (company["ticker"], company["nse_symbol"], company["bse_id"], company["bse_code"]):
            return company
    return None


# ---------- Filings ----------

def classify_nse_filing(nse_category: str, text: str) -> tuple[str, float]:
    """Trust the exchange's label when it is specific; otherwise fall back to keyword matching."""
    mapped = NSE_CATEGORY_MAP.get((nse_category or "").strip().lower())
    if mapped == "investor_meetings" and EARNINGS_CALL_PATTERN.search(text or ""):
        return "earnings_call", 0.9
    if mapped:
        return mapped, 0.9
    # "Appointment" would otherwise read as a management change; the brief treats auditors as routine.
    if AUDITOR_PATTERN.search(text or ""):
        return "unclassified", 0.8
    result = classify_announcement(nse_category or "", text)
    return result["category"], result["confidence"]


def clean_filing_title(text: str, fallback: str) -> str:
    """Strip NSE's "X has informed the Exchange regarding" boilerplate from a filing's text."""
    title = FILING_PREFIX_PATTERN.sub("", (text or "").strip()).strip(" '\"") or fallback or "Exchange filing"
    return title[0].upper() + title[1:]


def parse_nse_filing(row: dict, ticker: str, company_name: str, now: datetime) -> Optional[dict]:
    """Turn one NSE row into FINN's filing shape. `now` is naive IST, matching NSE's timestamps."""
    try:
        filed_at = datetime.strptime(row["sort_date"], "%Y-%m-%d %H:%M:%S")
        filing_id = int(row["seq_id"])
    except (KeyError, TypeError, ValueError):
        return None

    nse_category = row.get("desc") or ""
    text = row.get("attchmntText") or ""
    category, confidence = classify_nse_filing(nse_category, text)
    score, _ = compute_materiality_score(category, confidence, filed_at, now=now)
    pdf_url = row.get("attchmntFile") or ""

    return {
        "id": filing_id,
        "ticker": ticker,
        "symbol": row.get("symbol") or ticker,
        "exchange": "NSE",
        "company_name": company_name,
        "title": clean_filing_title(text, nse_category),
        "nse_category": nse_category,
        "category": category,
        "confidence": confidence,
        "priority_score": score,
        "filed_at": filed_at.replace(tzinfo=IST).isoformat(),
        "pdf_url": pdf_url if pdf_url.startswith("http") else None,
        "file_size": row.get("fileSize") or row.get("attFileSize"),
    }


def parse_bse_filing(row: dict, ticker: str, company_name: str, now: datetime) -> Optional[dict]:
    """Turn one BSE row into FINN's filing shape."""
    try:
        filed_at = datetime.fromisoformat(row["NEWS_DT"]).replace(microsecond=0)
        # BSE ids are UUIDs; 48 bits stays exact as a JavaScript number.
        filing_id = int(row["NEWSID"].replace("-", "")[:12], 16)
    except (KeyError, TypeError, ValueError, AttributeError):
        return None

    label = row.get("SUBCATNAME") or row.get("CATEGORYNAME") or ""
    text = row.get("HEADLINE") or row.get("NEWSSUB") or ""
    category, confidence = classify_nse_filing(label, text)
    score, _ = compute_materiality_score(category, confidence, filed_at, now=now)
    attachment = (row.get("ATTACHMENTNAME") or "").strip()

    return {
        "id": filing_id,
        "ticker": ticker,
        "symbol": str(row.get("SCRIP_CD") or ticker),
        "exchange": "BSE",
        "company_name": company_name,
        "title": clean_filing_title(text, label),
        "nse_category": label,
        "category": category,
        "confidence": confidence,
        "priority_score": score,
        "filed_at": filed_at.replace(tzinfo=IST).isoformat(),
        "pdf_url": BSE_ATTACHMENTS + attachment if attachment else None,
        "file_size": None,
    }


def _fetch_nse_rows(client: httpx.Client, symbol: str, start: datetime, end: datetime) -> list[dict]:
    params = {
        "index": "equities",
        "symbol": symbol,
        "from_date": start.strftime("%d-%m-%Y"),
        "to_date": end.strftime("%d-%m-%Y"),
    }
    response = client.get(NSE_ANNOUNCEMENTS, params=params, headers=NSE_HEADERS)
    if response.status_code in (401, 403):
        # NSE sometimes wants session cookies, which its home page sets.
        client.get(NSE_HOME, headers=NSE_HEADERS)
        response = client.get(NSE_ANNOUNCEMENTS, params=params, headers=NSE_HEADERS)
    response.raise_for_status()
    rows = response.json()
    if not isinstance(rows, list):
        raise ValueError(f"Unexpected NSE response for {symbol}")
    return rows


def _fetch_bse_rows(client: httpx.Client, code: str, start: datetime, end: datetime) -> list[dict]:
    response = client.get(
        BSE_ANNOUNCEMENTS,
        params={
            "pageno": 1, "strCat": -1, "strType": "C", "strSearch": "P", "strScrip": code,
            "strPrevDate": start.strftime("%Y%m%d"), "strToDate": end.strftime("%Y%m%d"),
        },
        headers=BSE_HEADERS,
    )
    response.raise_for_status()
    return response.json().get("Table") or []


def resolve_bse_document(client: httpx.Client, filing: dict) -> dict:
    """BSE moves older documents from its live folder to its history folder without saying so."""
    url = filing.get("pdf_url")
    if url and "/AttachLive/" in url:
        try:
            if client.head(url, headers=BSE_HEADERS).status_code == 404:
                filing["pdf_url"] = url.replace("/AttachLive/", "/AttachHis/")
        except httpx.HTTPError:
            pass  # Keep the link; downloads try both folders anyway.
    return filing


def _download_filings(holdings: list[tuple[str, str, str]]) -> dict:
    now = datetime.now(IST).replace(tzinfo=None)
    start = now - timedelta(days=FILINGS_LOOKBACK_DAYS)
    filings: dict[int, dict] = {}
    failed: list[str] = []

    with httpx.Client(timeout=20.0, follow_redirects=True) as client:
        def load(holding: tuple[str, str, str]):
            ticker, name, yahoo = holding
            try:
                if exchange_of(yahoo) == "BSE":
                    listed = find_listed_company(ticker)
                    if not listed or not listed["bse_code"]:
                        raise ValueError(f"No BSE code for {ticker}")
                    rows = _fetch_bse_rows(client, listed["bse_code"], start, now)
                    parsed = [parse_bse_filing(row, ticker, name, now) for row in rows]
                    return holding, [resolve_bse_document(client, f) for f in parsed if f]
                rows = _fetch_nse_rows(client, live_symbol(ticker), start, now)
                return holding, [parse_nse_filing(row, ticker, name, now) for row in rows]
            except Exception:
                return holding, None

        # A small pool stays polite to the exchanges while keeping a cold load to a few seconds.
        with ThreadPoolExecutor(max_workers=4) as pool:
            for (ticker, _, _), parsed_rows in pool.map(load, holdings):
                if parsed_rows is None:
                    failed.append(ticker)
                    continue
                for parsed in parsed_rows:
                    if parsed:
                        filings[parsed["id"]] = parsed

    if holdings and len(failed) == len(holdings):
        raise RuntimeError("The exchanges did not return filings for any holding")
    return {
        "filings": sorted(filings.values(), key=lambda f: f["filed_at"], reverse=True),
        "failed": sorted(failed),
    }


def get_filings(holdings: list[tuple[str, str, str]]) -> tuple[dict, float, bool]:
    ordered = sorted(set(holdings))
    return _cached("filings:" + ",".join(h[2] for h in ordered), lambda: _download_filings(ordered))
