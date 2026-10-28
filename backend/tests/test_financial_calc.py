"""Tests for deterministic financial calculation utilities."""
import pytest
from app.services.financial_calc import (
    pct_change, margin, volume_multiple, free_cash_flow,
    debt_to_equity, cash_conversion, net_debt, safe_round
)


def test_pct_change_positive():
    # 100 to 120 -> +20%
    assert pct_change(120.0, 100.0) == 20.0


def test_pct_change_negative():
    # 100 to 80 -> -20%
    assert pct_change(80.0, 100.0) == -20.0


def test_pct_change_zero_denominator():
    # Previous = 0 -> None, avoid ZeroDivisionError
    assert pct_change(50.0, 0.0) is None


def test_pct_change_none_values():
    assert pct_change(None, 100.0) is None
    assert pct_change(100.0, None) is None
    assert pct_change(None, None) is None


def test_pct_change_negative_base():
    # Loss of -100 to profit of +50: ((50 - (-100)) / |-100|) * 100 = 150%
    assert pct_change(50.0, -100.0) == 150.0


def test_margin():
    # EBITDA 25 on Revenue 100 -> 25%
    assert margin(25.0, 100.0) == 25.0
    # Zero revenue denominator
    assert margin(25.0, 0.0) is None
    assert margin(None, 100.0) is None


def test_volume_multiple():
    # 20M on 10M avg -> 2.0x
    assert volume_multiple(20000000, 10000000) == 2.0
    # Zero average
    assert volume_multiple(5000, 0) is None
    assert volume_multiple(5000, None) is None


def test_free_cash_flow():
    # OCF 500 - Capex 200 = 300
    assert free_cash_flow(500.0, 200.0) == 300.0
    # Negative Capex input handled cleanly
    assert free_cash_flow(500.0, -200.0) == 300.0
    assert free_cash_flow(None, 200.0) is None


def test_debt_to_equity():
    assert debt_to_equity(500.0, 1000.0) == 0.5
    assert debt_to_equity(500.0, 0.0) is None


def test_cash_conversion():
    # OCF 90 on PAT 100 -> 90%
    assert cash_conversion(90.0, 100.0) == 90.0
    assert cash_conversion(90.0, 0.0) is None


def test_net_debt():
    # Total Debt 1000 - Cash 300 = Net Debt 700
    assert net_debt(1000.0, 300.0) == 700.0
    assert net_debt(None, 300.0) is None


def test_safe_round():
    assert safe_round(12.3456, 2) == 12.35
    assert safe_round(None, 2) is None
