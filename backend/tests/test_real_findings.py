"""Cases found in real Gemini output on real NSE filings."""
from app.models.filing_insight import FilingInsight
from app.services import filing_ai


def test_a_decimal_point_lost_in_extraction_still_matches():
    # NTPC's results PDF extracts as "54269 95" for 54,269.95.
    known = filing_ai.source_numbers("Revenue from operations 54269 95 445 74 54715 .69")
    assert filing_ai.unverified_numbers("Revenue of 54,269.95 crore", known) == []


def test_two_real_separate_numbers_are_not_merged_into_something_else():
    known = filing_ai.source_numbers("Employees 120 45 offices")
    assert filing_ai.unverified_numbers("Revenue of 120.46 crore", known) == ["120.46"]


def test_an_empty_headline_is_finished_not_left_reading():
    insight = FilingInsight(pdf_url="x", status="pending", attempts=0)
    filing_ai._apply_headline(insight, "  ", set())
    assert insight.status == "done" and insight.headline is None and insight.note


def test_results_headline_is_built_from_the_checked_table():
    table = {"unit": "Rs. in crore", "rows": [
        {"metric": "Revenue", "current": 332861.0, "yoy_pct": 28.6},
        {"metric": "PAT", "current": 29250.0, "yoy_pct": 32.1},
    ]}
    assert filing_ai.results_headline(table) == "Revenue 332,861.00 (+28.6% YoY) and net profit 29,250.00 (+32.1% YoY), Rs. in crore"
