"""Financial calculation utilities - all deterministic, no LLM involved."""
from typing import Optional
import math


def pct_change(current: float, previous: float) -> Optional[float]:
    """Calculate percentage change: ((current - previous) / |previous|) * 100.
    Returns None if previous is zero or None."""
    if previous is None or current is None:
        return None
    if previous == 0:
        return None
    return ((current - previous) / abs(previous)) * 100.0


def margin(numerator: float, denominator: float) -> Optional[float]:
    """Calculate margin as (numerator / denominator) * 100.
    Returns None if denominator is zero or None."""
    if denominator is None or numerator is None:
        return None
    if denominator == 0:
        return None
    return (numerator / denominator) * 100.0


def volume_multiple(current_volume: int, average_volume: float) -> Optional[float]:
    """Calculate volume as a multiple of average volume.
    Returns None if average_volume is zero or None."""
    if average_volume is None or average_volume == 0:
        return None
    return current_volume / average_volume


def free_cash_flow(operating_cf: float, capex: float) -> Optional[float]:
    """FCF = Operating Cash Flow - Capital Expenditure.
    Capex should be passed as a positive number."""
    if operating_cf is None or capex is None:
        return None
    return operating_cf - abs(capex)


def debt_to_equity(total_debt: float, shareholders_equity: float) -> Optional[float]:
    """Debt-to-equity ratio."""
    if total_debt is None or shareholders_equity is None:
        return None
    if shareholders_equity == 0:
        return None
    return total_debt / shareholders_equity


def cash_conversion(operating_cf: float, pat: float) -> Optional[float]:
    """Cash conversion = Operating Cash Flow / PAT * 100.
    Shows how effectively profit converts to cash."""
    if operating_cf is None or pat is None:
        return None
    if pat == 0:
        return None
    return (operating_cf / abs(pat)) * 100.0


def roce(ebit: float, capital_employed: float) -> Optional[float]:
    """Return on Capital Employed = EBIT / Capital Employed * 100."""
    if ebit is None or capital_employed is None:
        return None
    if capital_employed == 0:
        return None
    return (ebit / capital_employed) * 100.0


def roe(pat: float, equity: float) -> Optional[float]:
    """Return on Equity = PAT / Shareholders' Equity * 100."""
    if pat is None or equity is None:
        return None
    if equity == 0:
        return None
    return (pat / equity) * 100.0


def net_debt(total_debt: float, cash: float) -> Optional[float]:
    """Net Debt = Total Debt - Cash & Cash Equivalents."""
    if total_debt is None or cash is None:
        return None
    return total_debt - cash


def format_indian_number(value: float, unit: str = "crores") -> str:
    """Format a number in Indian style with unit label."""
    if value is None:
        return "N/A"
    if abs(value) >= 100000:
        return f"₹{value/100000:,.1f} Lakh Cr"
    elif abs(value) >= 100:
        return f"₹{value:,.0f} Cr"
    else:
        return f"₹{value:,.2f} Cr"


def safe_round(value: Optional[float], decimals: int = 2) -> Optional[float]:
    """Safely round a value, returning None if input is None."""
    if value is None:
        return None
    return round(value, decimals)


def format_change(value: Optional[float]) -> str:
    """Format a percentage change with sign and color hint."""
    if value is None:
        return "N/A"
    sign = "+" if value > 0 else ""
    return f"{sign}{value:.2f}%"

