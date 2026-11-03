"""A company with little or nothing reported must never break a research view."""
import pytest

from app.services import fundamentals, research_engine


def empty_tables():
    table = {"periods": [], "rows": {}, "raw_pdfs": []}
    return {"tables": {name: dict(table) for name in ("quarters", "annual", "balance", "cash", "ratios")}, "top_ratios": {}}


def one_period_tables():
    data = empty_tables()
    data["tables"]["annual"] = {"periods": ["Mar 2026"], "rows": {"Sales": [100.0], "Net Profit": [None]}, "raw_pdfs": []}
    data["tables"]["balance"] = {"periods": ["Mar 2026"], "rows": {"Borrowings": [None]}, "raw_pdfs": []}
    data["tables"]["quarters"] = {"periods": ["Sep 2026"], "rows": {"Sales": [25.0]}, "raw_pdfs": []}
    return data


@pytest.mark.parametrize("build", [empty_tables, one_period_tables])
@pytest.mark.parametrize("view", [
    fundamentals.financial_snapshot, fundamentals.trajectory, fundamentals.balance_sheet,
    fundamentals.cash_quality, fundamentals.numbers_only_bull_bear, research_engine.numbers_text,
])
def test_sparse_companies_do_not_break_a_view(build, view):
    assert view(build()) is not None


def test_a_lenders_takeaway_leads_with_the_lender_note():
    data = empty_tables()
    data["tables"]["balance"] = {"periods": ["Mar 2026"], "rows": {"Borrowings": [100.0], "Equity Capital": [10.0], "Reserves": [90.0]}, "raw_pdfs": []}
    data["tables"]["annual"] = {"periods": ["Mar 2026"], "rows": {"Financing Profit": [5.0]}, "raw_pdfs": []}
    assert fundamentals.balance_sheet(data)["observations"][0].startswith("For a lender")
