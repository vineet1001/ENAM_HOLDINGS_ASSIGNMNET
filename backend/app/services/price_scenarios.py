"""Price scenarios from a stock's own history and reported numbers. None of it is a forecast.

Everything here is plain arithmetic, so it's the same every time and needs no model:
- a volatility range, with a check of how often such ranges actually held in the past
- moving averages, RSI and Bollinger bands
- the price at the stock's own historical low, median and high P/E
- a reverse DCF: what growth the current price assumes
"""
import calendar
import math
from datetime import date
from statistics import median
from typing import Optional

import numpy as np
import pandas as pd

from app.services import fundamentals

TRADING_DAYS = 252
HORIZONS = (("1M", 21), ("3M", 63), ("1Y", 252))
Z_68, Z_95 = 1.0, 1.96
CHART_SESSIONS = 252
CONE_SESSIONS = 63
BACKTEST_STEP = 5
MIN_BACKTEST_SAMPLES = 20
PE_OUTLIER_FACTOR = 3.0  # A year more than 3x away from the median P/E is usually a split the EPS wasn't adjusted for.
DCF_YEARS = 10
DCF_DISCOUNT_RATES = (0.10, 0.11, 0.12, 0.13, 0.14)
DCF_TERMINAL_RATES = (0.04, 0.05, 0.06)
GROWTH_SEARCH = (-0.30, 0.60)


def _round(value: Optional[float], digits: int = 2) -> Optional[float]:
    if value is None or isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    return round(float(value), digits)


# ---------- Volatility ----------

def annual_volatility(closes: pd.Series, window: int = TRADING_DAYS) -> Optional[float]:
    """Yearly volatility from daily log returns over the last year."""
    returns = np.log(closes / closes.shift(1)).dropna().tail(window)
    if len(returns) < 60:
        return None
    return float(returns.std(ddof=1) * math.sqrt(TRADING_DAYS))


def price_range(price: float, volatility: float, sessions: int, z: float) -> tuple[float, float]:
    """A band the price stays inside with the stated probability, if moves follow a lognormal pattern with no drift."""
    spread = volatility * math.sqrt(sessions / TRADING_DAYS)
    return price * math.exp(-z * spread), price * math.exp(z * spread)


def backtest_ranges(closes: pd.Series, sessions: int, window: int = TRADING_DAYS) -> Optional[dict]:
    """How often a range drawn the same way, from the data available then, actually held."""
    values = closes.dropna().to_numpy(dtype=float)
    if len(values) < window + sessions + BACKTEST_STEP * MIN_BACKTEST_SAMPLES:
        return None
    log_moves = np.diff(np.log(values))
    inside_68 = inside_95 = total = 0
    for start in range(window, len(values) - sessions, BACKTEST_STEP):
        spread = log_moves[start - window:start].std(ddof=1) * math.sqrt(sessions)
        move = abs(math.log(values[start + sessions] / values[start]))
        total += 1
        inside_68 += move <= Z_68 * spread
        inside_95 += move <= Z_95 * spread
    return {
        "samples": total,
        "inside_68": round(100 * inside_68 / total),
        "inside_95": round(100 * inside_95 / total),
    }


def volatility_view(closes: pd.Series) -> Optional[dict]:
    volatility = annual_volatility(closes)
    if volatility is None:
        return None
    price = float(closes.iloc[-1])
    ranges = []
    for label, sessions in HORIZONS:
        low_68, high_68 = price_range(price, volatility, sessions, Z_68)
        low_95, high_95 = price_range(price, volatility, sessions, Z_95)
        ranges.append({
            "horizon": label, "sessions": sessions,
            "low_68": _round(low_68), "high_68": _round(high_68),
            "low_95": _round(low_95), "high_95": _round(high_95),
            "backtest": backtest_ranges(closes, sessions),
        })

    future = pd.bdate_range(closes.index[-1], periods=CONE_SESSIONS + 1)
    cone = []
    for step, day in enumerate(future):
        low_68, high_68 = price_range(price, volatility, step, Z_68)
        low_95, high_95 = price_range(price, volatility, step, Z_95)
        cone.append({
            "date": day.date().isoformat(),
            "low_68": _round(low_68), "high_68": _round(high_68),
            "low_95": _round(low_95), "high_95": _round(high_95),
        })
    return {"annual_pct": round(volatility * 100, 1), "daily_pct": round(volatility / math.sqrt(TRADING_DAYS) * 100, 2), "ranges": ranges, "cone": cone}


# ---------- Moving averages and momentum ----------

def rsi(closes: pd.Series, period: int = 14) -> pd.Series:
    """Wilder's relative strength index."""
    change = closes.diff()
    gains = change.clip(lower=0).ewm(alpha=1 / period, adjust=False).mean()
    losses = (-change.clip(upper=0)).ewm(alpha=1 / period, adjust=False).mean()
    strength = gains / losses.replace(0, np.nan)
    return (100 - 100 / (1 + strength)).fillna(100.0)


def technicals(closes: pd.Series) -> dict:
    ma50 = closes.rolling(50).mean()
    ma200 = closes.rolling(200).mean()
    middle = closes.rolling(20).mean()
    spread = closes.rolling(20).std(ddof=0)
    upper, lower = middle + 2 * spread, middle - 2 * spread
    momentum = rsi(closes)
    price = float(closes.iloc[-1])

    signals = []
    if not math.isnan(ma200.iloc[-1]):
        gap = (price / ma200.iloc[-1] - 1) * 100
        signals.append({
            "tone": "up" if gap >= 0 else "down",
            "text": f"Price is {abs(gap):.1f}% {'above' if gap >= 0 else 'below'} its 200-day average of ₹{ma200.iloc[-1]:,.0f}",
        })
        difference = (ma50 - ma200).dropna()
        flips = difference[np.sign(difference).diff().fillna(0) != 0]
        if len(flips):
            when = flips.index[-1].date()
            golden = difference.loc[flips.index[-1]] > 0
            signals.append({
                "tone": "up" if golden else "down",
                "text": f"The 50-day average crossed {'above' if golden else 'below'} the 200-day on "
                        f"{when.strftime('%d %b %Y')}, a '{'golden' if golden else 'death'} cross'",
            })
        else:
            above = difference.iloc[-1] > 0
            signals.append({
                "tone": "up" if above else "down",
                "text": f"The 50-day average has stayed {'above' if above else 'below'} the 200-day all year",
            })
    elif not math.isnan(ma50.iloc[-1]):
        gap = (price / ma50.iloc[-1] - 1) * 100
        signals.append({"tone": "up" if gap >= 0 else "down", "text": f"Price is {abs(gap):.1f}% {'above' if gap >= 0 else 'below'} its 50-day average"})

    latest_rsi = float(momentum.iloc[-1])
    if latest_rsi >= 70:
        signals.append({"tone": "down", "text": f"RSI is {latest_rsi:.0f}: above 70, the usual reading for overbought"})
    elif latest_rsi <= 30:
        signals.append({"tone": "up", "text": f"RSI is {latest_rsi:.0f}: below 30, the usual reading for oversold"})
    else:
        signals.append({"tone": "flat", "text": f"RSI is {latest_rsi:.0f}: between 30 and 70, so not stretched either way"})

    if not math.isnan(upper.iloc[-1]):
        if price > upper.iloc[-1]:
            signals.append({"tone": "down", "text": "Price closed above its upper Bollinger band: an unusually large move for this stock"})
        elif price < lower.iloc[-1]:
            signals.append({"tone": "up", "text": "Price closed below its lower Bollinger band: an unusually large fall for this stock"})
        else:
            signals.append({"tone": "flat", "text": "Price is inside its Bollinger bands, its normal 20-day range"})

    shown = closes.index[-CHART_SESSIONS:]
    series = [
        {
            "date": day.date().isoformat(),
            "close": _round(closes[day]),
            "ma50": _round(ma50[day]),
            "ma200": _round(ma200[day]),
            "upper": _round(upper[day]),
            "lower": _round(lower[day]),
        }
        for day in shown
    ]
    return {
        "series": series,
        "ma50": _round(ma50.iloc[-1]),
        "ma200": _round(ma200.iloc[-1]),
        "rsi": round(latest_rsi, 1),
        "signals": signals,
    }


# ---------- P/E band ----------

def _period_end(label: str) -> Optional[date]:
    """'Mar 2026' as the last day of March 2026."""
    try:
        month_name, year = label.split()
        month = list(calendar.month_abbr).index(month_name[:3].title())
        return date(int(year), month, calendar.monthrange(int(year), month)[1])
    except (ValueError, IndexError):
        return None


def pe_band(data: dict, closes: pd.Series) -> dict:
    annual = data["tables"]["annual"]
    eps_row = fundamentals._row(annual, "EPS in Rs")
    periods = annual["periods"]
    if not eps_row:
        return {"available": False, "reason": "No earnings per share are reported for this company."}

    labels = {label.upper(): i for i, label in enumerate(periods)}
    ttm_index = labels.get("TTM")
    ttm_eps = eps_row[ttm_index] if ttm_index is not None and ttm_index < len(eps_row) else None
    full_years = [(i, label) for i, label in enumerate(periods) if label.upper() != "TTM"]
    if ttm_eps is None and full_years:
        ttm_eps = eps_row[full_years[-1][0]] if full_years[-1][0] < len(eps_row) else None
    if ttm_eps is None or ttm_eps <= 0:
        return {"available": False, "reason": "The company made a loss over the last year, so a P/E doesn't mean anything."}

    years = []
    for index, label in full_years:
        end = _period_end(label)
        eps = eps_row[index] if index < len(eps_row) else None
        if end is None or eps is None or eps <= 0:
            continue
        before = closes[closes.index <= pd.Timestamp(end)]
        # The history has to reach that year end; a price from weeks later isn't that year's price.
        if before.empty or (pd.Timestamp(end) - before.index[-1]).days > 10:
            continue
        price = float(before.iloc[-1])
        years.append({"period": label, "eps": _round(eps), "price": _round(price), "pe": round(price / eps, 1)})

    if len(years) < 3:
        return {"available": False, "reason": "Fewer than three years of prices and earnings line up, which is too few for a band."}

    middle = median(y["pe"] for y in years)
    kept = [y for y in years if middle / PE_OUTLIER_FACTOR <= y["pe"] <= middle * PE_OUTLIER_FACTOR]
    dropped = [y["period"] for y in years if y not in kept]
    values = [y["pe"] for y in kept]
    low, mid, high = min(values), median(values), max(values)
    price = float(closes.iloc[-1])
    return {
        "available": True,
        # Very thin earnings make P/E jump around, so a band built from them says little.
        "note": "Earnings are small next to the share price, so P/E swings widely and the band says little." if mid > 80 else None,
        "years": kept,
        "dropped": dropped,
        "ttm_eps": _round(ttm_eps),
        "current_pe": round(price / ttm_eps, 1),
        "low": {"pe": low, "price": _round(low * ttm_eps)},
        "median": {"pe": round(mid, 1), "price": _round(mid * ttm_eps)},
        "high": {"pe": high, "price": _round(high * ttm_eps)},
    }


# ---------- Reverse DCF ----------

def dcf_value(cash_flow: float, growth: float, discount: float, terminal: float, years: int = DCF_YEARS) -> float:
    """Present value of cash flow growing at `growth` for `years`, then at `terminal` for ever."""
    total, flow = 0.0, cash_flow
    for year in range(1, years + 1):
        flow *= 1 + growth
        total += flow / (1 + discount) ** year
    return total + flow * (1 + terminal) / (discount - terminal) / (1 + discount) ** years


def implied_growth(value: float, cash_flow: float, discount: float, terminal: float) -> dict:
    """The yearly growth that makes the cash flows worth exactly `value`, found by bisection."""
    low, high = GROWTH_SEARCH
    if dcf_value(cash_flow, low, discount, terminal) > value:
        return {"growth": None, "bound": "below"}
    if dcf_value(cash_flow, high, discount, terminal) < value:
        return {"growth": None, "bound": "above"}
    for _ in range(80):
        middle = (low + high) / 2
        if dcf_value(cash_flow, middle, discount, terminal) < value:
            low = middle
        else:
            high = middle
    return {"growth": round((low + high) / 2 * 100, 1), "bound": None}


def reverse_dcf(data: dict) -> dict:
    if fundamentals.is_financial_company(data):
        return {"available": False, "reason": "A lender's cash flow mostly tracks its loan book, so a cash flow valuation doesn't fit."}
    market_cap = (data.get("top_ratios") or {}).get("Market Cap")
    fcf_row = [v for v in fundamentals._row(data["tables"]["cash"], "Free Cash Flow") if v is not None]
    if not market_cap or len(fcf_row) < 3:
        return {"available": False, "reason": "Market value or three years of free cash flow aren't available."}
    base = sum(fcf_row[-3:]) / 3  # Three years together, because one year's cash can be lumpy.
    if base <= 0:
        return {"available": False, "reason": "Free cash flow averaged below zero over three years, so there's no cash flow to value."}
    debt = next((v for v in reversed(fundamentals._row(data["tables"]["balance"], "Borrowings", "Borrowing")) if v is not None), 0.0)
    value = market_cap + debt
    grid = [
        {"discount": round(d * 100), "terminal": round(t * 100), **implied_growth(value, base, d, t)}
        for d in DCF_DISCOUNT_RATES for t in DCF_TERMINAL_RATES
    ]
    history = {row["metric"]: row for row in fundamentals.trajectory(data)["growth"]}
    return {
        "available": True,
        "market_cap": round(market_cap),
        "debt": round(debt),
        "base_fcf": round(base),
        "grid": grid,
        "past_growth": {
            "revenue_5y": (history.get("Revenue") or {}).get("cagr_5y"),
            "pat_5y": (history.get("PAT") or {}).get("cagr_5y"),
        },
    }


# ---------- Everything together ----------

def build(data: Optional[dict], closes: pd.Series) -> dict:
    closes = closes.dropna()
    if len(closes) < 60:
        return {"available": False, "reason": "There isn't enough price history to work with."}
    result = {
        "available": True,
        "price": _round(closes.iloc[-1]),
        "as_of": closes.index[-1].date().isoformat(),
        "history_years": round(len(closes) / TRADING_DAYS, 1),
        "volatility": volatility_view(closes),
        "technicals": technicals(closes),
        "pe_band": pe_band(data, closes) if data else {"available": False, "reason": "Reported earnings aren't available."},
        "reverse_dcf": reverse_dcf(data) if data else {"available": False, "reason": "Reported cash flows aren't available."},
    }
    return result


def summary(result: dict) -> Optional[str]:
    if not result.get("available") or not result.get("volatility"):
        return None
    three = next(r for r in result["volatility"]["ranges"] if r["horizon"] == "3M")
    held = three["backtest"]
    text = (
        f"The stock typically moves about {result['volatility']['daily_pct']}% a day. A move of the usual size would "
        f"leave it between ₹{three['low_68']:,.0f} and ₹{three['high_68']:,.0f} in three months."
    )
    if held:
        text += f" Ranges drawn this way held {held['inside_68']}% of the time in the past, against 68% expected."
    return text
