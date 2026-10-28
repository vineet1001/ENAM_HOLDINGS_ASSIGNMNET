"""Tests for announcement classification and materiality scoring."""
import pytest
from datetime import datetime, timedelta
from app.services.classifier import (
    classify_announcement, compute_materiality_score, CATEGORY_KEYWORDS
)


def test_classify_results():
    res = classify_announcement("Infosys Ltd - Financial Results for the Quarter ended September 30, 2024")
    assert res["category"] == "results"
    assert res["confidence"] >= 0.7


def test_classify_merger_acquisition():
    res = classify_announcement("Zomato Ltd - Acquisition of Paytm's Entertainment Ticketing Business")
    assert res["category"] == "M&A"
    assert res["confidence"] >= 0.7


def test_classify_management_change():
    res = classify_announcement("Appointment of Mr. Jayesh Sanghrajka as Chief Financial Officer")
    assert res["category"] == "management_change"
    assert res["confidence"] >= 0.7


def test_classify_dividend():
    res = classify_announcement("Declaration of Interim Dividend of Rs 10 per share and Record Date")
    assert res["category"] == "dividend"
    assert res["confidence"] >= 0.7


def test_classify_unclassified():
    res = classify_announcement("General routine notice regarding holiday schedule")
    assert res["category"] == "unclassified"
    assert res["confidence"] <= 0.5


def test_materiality_score_high_for_results():
    now = datetime.utcnow()
    recent = now - timedelta(hours=2)
    score, explanation = compute_materiality_score("results", 0.95, recent, now)
    assert score >= 0.7
    assert "results" in explanation


def test_materiality_score_lower_for_unclassified():
    now = datetime.utcnow()
    old = now - timedelta(days=5)
    score, _ = compute_materiality_score("unclassified", 0.4, old, now)
    assert score < 0.4
