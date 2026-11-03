"""Standardised financials and document links from screener.in, for any listed company.

The numbers come from Screener's tables of company filings. Its links lead to the primary documents,
which FINN then reads itself; Screener's own commentary and AI summaries are never used.
"""
import json
import re
import threading
import time
from pathlib import Path
from typing import Optional

import httpx
from bs4 import BeautifulSoup

from app.core import config
from app.services.live_data import BROWSER_HEADERS, LiveDataUnavailable, _cached, find_listed_company, live_symbol

BASE_URL = "https://www.screener.in/company"
TABLE_SECTIONS = {
    "quarters": "quarters",
    "profit-loss": "annual",
    "balance-sheet": "balance",
    "cash-flow": "cash",
    "ratios": "ratios",
}
CACHE_TTL_SECONDS = 12 * 3600
MIN_SECONDS_BETWEEN_REQUESTS = 1.5
CACHE_DIR = config.DATA_DIR / "cache" / "screener"
MONTHS = {m: i + 1 for i, m in enumerate(("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"))}

_request_lock = threading.Lock()
_last_request_at = 0.0


def parse_number(text: str) -> Optional[float]:
    cleaned = (text or "").replace(",", "").replace("%", "").replace("\xa0", " ").strip()
    try:
        return float(cleaned)
    except ValueError:
        return None


def _clean_label(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").replace("\xa0", " ").replace("+", "")).strip()


def _parse_table(section) -> dict:
    table = section.find("table") if section else None
    if table is None or table.find("thead") is None or table.find("tbody") is None:
        return {"periods": [], "rows": {}, "raw_pdfs": []}
    periods = [th.get_text(strip=True) for th in table.find("thead").find_all("th")][1:]
    rows: dict[str, list[Optional[float]]] = {}
    raw_pdfs: list[Optional[str]] = []
    for tr in table.find("tbody").find_all("tr"):
        cells = tr.find_all("td")
        if not cells:
            continue
        label = _clean_label(cells[0].get_text(" ", strip=True))
        if label.lower() == "raw pdf":
            for cell in cells[1:]:
                link = cell.find("a")
                href = link.get("href") if link else None
                raw_pdfs.append(f"https://www.screener.in{href}" if href and href.startswith("/") else href)
            continue
        rows[label] = [parse_number(c.get_text(strip=True)) for c in cells[1:]]
    return {"periods": periods, "rows": rows, "raw_pdfs": raw_pdfs}


def _concall_date(label: str) -> Optional[str]:
    match = re.match(r"([A-Z][a-z]{2})\s+(\d{4})", label or "")
    if not match or match.group(1) not in MONTHS:
        return None
    return f"{match.group(2)}-{MONTHS[match.group(1)]:02d}-01"


def parse_page(html: str) -> dict:
    """Turn a Screener company page into plain data. No network, so it's easy to test."""
    soup = BeautifulSoup(html, "html.parser")

    tables = {}
    for section_id, name in TABLE_SECTIONS.items():
        tables[name] = _parse_table(soup.find("section", id=section_id))

    top_ratios = {}
    for item in soup.select("#top-ratios li"):
        name = item.find("span", class_="name")
        number = item.find("span", class_="number")
        if name and number:
            top_ratios[_clean_label(name.get_text())] = parse_number(number.get_text())

    about = soup.select_one(".company-profile .about, .about")
    documents = soup.find("section", id="documents")
    annual_reports = []
    concalls = []
    if documents:
        for link in documents.select(".annual-reports a"):
            title = _clean_label(link.get_text(" ", strip=True))
            year = re.search(r"(20\d{2})", title)
            if link.get("href"):
                annual_reports.append({"title": title, "year": int(year.group(1)) if year else None, "url": link["href"]})
        for item in documents.select(".concalls li"):
            label_node = item.find("div")
            label = _clean_label(label_node.get_text(" ", strip=True)) if label_node else ""
            links = {a.get_text(strip=True): a.get("href") for a in item.find_all("a")}
            concalls.append({
                "label": label,
                "date": _concall_date(label),
                "transcript_url": links.get("Transcript"),
                "presentation_url": links.get("PPT"),
            })

    return {
        "about": re.sub(r"\s*\[\d+\]", "", about.get_text(" ", strip=True)) if about else "",
        "top_ratios": top_ratios,
        "tables": tables,
        "annual_reports": annual_reports,
        "concalls": concalls,
    }


def _throttled_get(client: httpx.Client, url: str) -> httpx.Response:
    """One request at a time with a gap between them, because this is someone else's free website."""
    global _last_request_at
    with _request_lock:
        wait = MIN_SECONDS_BETWEEN_REQUESTS - (time.time() - _last_request_at)
        if wait > 0:
            time.sleep(wait)
        _last_request_at = time.time()
        return client.get(url)


def _cache_path(symbol: str) -> Path:
    return CACHE_DIR / f"{re.sub(r'[^A-Za-z0-9_-]', '_', symbol)}.json"


def _read_cache(symbol: str, max_age: Optional[float]) -> Optional[dict]:
    path = _cache_path(symbol)
    try:
        if max_age is not None and time.time() - path.stat().st_mtime > max_age:
            return None
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def _write_cache(symbol: str, data: dict) -> None:
    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        _cache_path(symbol).write_text(json.dumps(data), encoding="utf-8")
    except OSError:
        pass  # A read-only host just fetches again next time.


def _download(symbol: str) -> Optional[dict]:
    cached = _read_cache(symbol, CACHE_TTL_SECONDS)
    if cached:
        return cached
    try:
        with httpx.Client(headers=BROWSER_HEADERS, timeout=30.0, follow_redirects=True) as client:
            # Consolidated figures first; companies with no subsidiaries only have standalone ones.
            for basis, suffix in (("consolidated", "consolidated/"), ("standalone", "")):
                response = _throttled_get(client, f"{BASE_URL}/{symbol}/{suffix}")
                if response.status_code == 404:
                    continue
                response.raise_for_status()
                parsed = parse_page(response.text)
                if parsed["tables"]["annual"]["rows"] or parsed["tables"]["quarters"]["rows"]:
                    parsed.update({"symbol": symbol, "basis": basis, "url": f"{BASE_URL}/{symbol}/{suffix}"})
                    _write_cache(symbol, parsed)
                    return parsed
    except httpx.HTTPError as exc:
        # A failed refresh keeps showing the last copy, however old.
        stale = _read_cache(symbol, None)
        if stale:
            return stale
        raise LiveDataUnavailable(f"Screener couldn't be reached ({type(exc).__name__})") from exc
    return None


def screener_symbol(ticker: str, yahoo_symbol: Optional[str] = None) -> str:
    """Screener keys NSE companies by symbol and BSE-only companies by scrip code."""
    if yahoo_symbol and yahoo_symbol.endswith(".BO"):
        try:
            listed = find_listed_company(ticker)
        except LiveDataUnavailable:
            listed = None
        if listed and listed.get("bse_code"):
            return listed["bse_code"]
    return live_symbol(ticker)


def get_company_data(ticker: str, yahoo_symbol: Optional[str] = None) -> Optional[dict]:
    """Everything Screener has on a company, or None if it isn't there. May raise LiveDataUnavailable."""
    symbol = screener_symbol(ticker, yahoo_symbol)
    return _cached(f"screener:{symbol}", lambda: _download(symbol), ttl=CACHE_TTL_SECONDS)[0]
