"""Announcement classification using hybrid keyword + LLM pipeline."""
import re
import json
from typing import Optional
from datetime import datetime

# Category keyword patterns for deterministic classification
CATEGORY_KEYWORDS = {
    "results": [
        r"quarterly\s+results?", r"financial\s+results?", r"q[1-4]\s+(fy|results?)",
        r"board\s+meeting.*results?", r"annual\s+results?", r"un-?audited",
        r"audited\s+financial", r"statement\s+of\s+profit", r"result\s+deck",
        r"shareholder.s?\s+letter", r"standalone.*results"
    ],
    "M&A": [
        r"acqui(sition|re)", r"merger", r"demerger", r"joint\s+venture",
        r"subsidiary", r"stake\s+sale", r"amalgamation", r"takeover",
        r"strategic\s+investment", r"divestment", r"disinvest"
    ],
    "fund_raise": [
        r"rights?\s+issue", r"qip", r"qualified\s+institutional",
        r"preferential\s+allot", r"buyback", r"commercial\s+paper",
        r"fund\s*rais", r"ncd", r"debenture", r"debt\s+raise"
    ],
    "management_change": [
        r"appoint(ment|ed)", r"resign(ation|ed)", r"retire(ment|d)",
        r"director.*appoint", r"director.*resign", r"ceo|cfo|cmo|coo",
        r"managing\s+director", r"key\s+managerial", r"cessation"
    ],
    "litigation": [
        r"lawsuit", r"litigation", r"regulatory\s+order", r"fine",
        r"penalty", r"sebi\s+order", r"nclt", r"insolvency",
        r"arbitration", r"legal\s+proceedings", r"show\s+cause"
    ],
    "insider_trading": [
        r"insider\s+trad", r"promoter.*(?:buy|sell|acqui|dispos)",
        r"sast", r"substantial\s+acquisition", r"promoter.*shares?"
    ],
    "earnings_call": [
        r"earnings?\s+call", r"concall", r"conference\s+call",
        r"investor\s+call", r"analyst\s+call", r"transcript"
    ],
    "investor_meetings": [
        r"investor\s+meet", r"analyst\s+meet", r"investor\s+conference",
        r"roadshow", r"investor\s+presentation", r"investor\s+day"
    ],
    "credit_rating": [
        r"credit\s+rat", r"rating.*(?:upgrade|downgrade|reaffirm|affirm)",
        r"crisil|icra|care|india\s+ratings?|fitch", r"rating\s+action"
    ],
    "dividend": [
        r"dividend", r"interim\s+dividend", r"final\s+dividend",
        r"record\s+date.*dividend", r"special\s+dividend"
    ],
    "bonus_split": [
        r"bonus\s+(?:issue|share)", r"stock\s+split", r"sub.?division",
        r"split.*shares?", r"bonus\s+ratio"
    ],
    "capex": [
        r"capex", r"capital\s+expenditure", r"new\s+plant",
        r"capacity\s+expansion", r"new\s+facility", r"greenfield",
        r"brownfield", r"expansion\s+project"
    ],
    "press_release": [
        r"press\s+release", r"order\s+(?:win|received|bagged)",
        r"partnership", r"collaboration", r"launch",
        r"clarification.*rumour", r"media\s+release"
    ],
    "postal_ballot": [
        r"postal\s+ballot", r"e.?voting.*result", r"resolution.*postal"
    ],
    "agm_egm": [
        r"annual\s+general\s+meeting", r"agm", r"extraordinary\s+general",
        r"egm", r"general\s+meeting.*notice"
    ],
    "pledging": [
        r"pledge", r"encumbrance", r"promoter.*pledge",
        r"pledge.*release", r"unpledge"
    ],
}


def classify_announcement(title: str, description: str | None = None) -> dict:
    """Classify an announcement using keyword matching.
    
    Returns:
        dict with keys: category, confidence, explanation, method, evidence_snippet
    """
    text = f"{title} {description or ''}".lower().strip()
    
    scores: dict[str, float] = {}
    matches: dict[str, list[str]] = {}
    
    for category, patterns in CATEGORY_KEYWORDS.items():
        cat_matches = []
        for pattern in patterns:
            found = re.findall(pattern, text, re.IGNORECASE)
            if found:
                cat_matches.extend(found)
        if cat_matches:
            # Score based on number of matching patterns (not total matches)
            unique_patterns_matched = len(set(cat_matches))
            scores[category] = min(0.95, 0.6 + 0.1 * unique_patterns_matched)
            matches[category] = cat_matches
    
    if not scores:
        return {
            "category": "unclassified",
            "confidence": 0.3,
            "explanation": "No keyword patterns matched. Manual review recommended.",
            "method": "keyword",
            "evidence_snippet": text[:200]
        }
    
    # Pick highest scoring category
    best_category = max(scores, key=scores.get)
    confidence = scores[best_category]
    
    # Check for ambiguity (multiple categories with similar scores)
    sorted_scores = sorted(scores.values(), reverse=True)
    if len(sorted_scores) > 1 and sorted_scores[0] - sorted_scores[1] < 0.15:
        confidence *= 0.85  # Reduce confidence when ambiguous
    
    matched_terms = matches.get(best_category, [])
    
    return {
        "category": best_category,
        "confidence": round(confidence, 2),
        "explanation": f"Matched {len(matched_terms)} keyword pattern(s) for '{best_category}': {', '.join(set(matched_terms[:3]))}",
        "method": "keyword",
        "evidence_snippet": text[:300]
    }


# Category descriptions for UI display
CATEGORY_DESCRIPTIONS = {
    "results": "Quarterly/annual results, board meetings approving results, result decks, shareholder letters",
    "M&A": "Acquisitions, mergers, demergers, joint ventures, subsidiary investments, stake sales",
    "fund_raise": "Rights issues, QIPs, preferential allotments, buybacks, debt fundraising",
    "management_change": "Senior executive/director appointments, resignations, retirements",
    "litigation": "Lawsuits, regulatory orders, fines, warnings, insolvency proceedings",
    "insider_trading": "Promoter or insider shareholding transactions",
    "earnings_call": "Investor call notices, transcripts, recording links",
    "investor_meetings": "Investor meetings and conferences",
    "credit_rating": "Rating actions - upgrades, downgrades, reaffirmations",
    "dividend": "Dividend declarations and record dates",
    "bonus_split": "Bonus issues and stock splits",
    "capex": "Plant construction, new facilities, capacity expansion",
    "press_release": "General orders, launches, partnerships, clarifications",
    "postal_ballot": "Shareholder postal ballot notices and results",
    "agm_egm": "AGM/EGM notices and results",
    "pledging": "Promoter share pledging, release, or status changes",
    "unclassified": "Routine paperwork, not clearly categorisable"
}


# Materiality scoring weights
CATEGORY_MATERIALITY = {
    "results": 0.9,
    "M&A": 0.95,
    "fund_raise": 0.8,
    "management_change": 0.85,
    "litigation": 0.85,
    "insider_trading": 0.7,
    "earnings_call": 0.6,
    "investor_meetings": 0.4,
    "credit_rating": 0.8,
    "dividend": 0.6,
    "bonus_split": 0.65,
    "capex": 0.7,
    "press_release": 0.5,
    "postal_ballot": 0.3,
    "agm_egm": 0.35,
    "pledging": 0.75,
    "unclassified": 0.2,
}


def compute_materiality_score(
    category: str,
    confidence: float,
    filing_date: datetime,
    now: datetime | None = None
) -> tuple[float, str]:
    """Compute a transparent materiality/priority score.
    
    Score components:
    - Category weight (0-1): Based on typical financial significance
    - Confidence weight: Classification confidence
    - Recency weight (0-1): Decays over 7 days, but capped to avoid
      equating recency with materiality
    
    Returns: (score, explanation)
    """
    if now is None:
        now = datetime.utcnow()
    
    # Category weight (50% of score)
    cat_weight = CATEGORY_MATERIALITY.get(category, 0.2)
    
    # Confidence factor (20% of score)
    conf_weight = confidence
    
    # Recency factor (30% of score) - decays but doesn't dominate
    hours_old = max(0, (now - filing_date).total_seconds() / 3600)
    recency_weight = max(0.1, 1.0 - (hours_old / (7 * 24)))  # Decay over 7 days
    
    score = (cat_weight * 0.5) + (conf_weight * 0.2) + (recency_weight * 0.3)
    score = round(min(1.0, max(0.0, score)), 3)
    
    explanation = (
        f"Category '{category}' (weight={cat_weight:.1f}, 50%) + "
        f"Confidence ({confidence:.0%}, 20%) + "
        f"Recency ({recency_weight:.1%}, 30%) = {score:.3f}"
    )
    
    return score, explanation

