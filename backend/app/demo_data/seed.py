"""
Comprehensive demo data seeder for the FINN application.

Populates the database with realistic but clearly simulated data for
23 Indian NSE companies — 18 in the default portfolio and 5 research-
universe entries. All generated records are flagged is_demo=True.
"""

from __future__ import annotations

import json
import logging
import random
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

# ── Model imports ──────────────────────────────────────────────────────
from app.models.company import Company, PortfolioMembership
from app.models.price import PriceBar
from app.models.announcement import Announcement, AnnouncementClassification
from app.models.financial import FinancialPeriod, FinancialMetric, GuidanceStatement
from app.models.alert import AlertRule, AlertEvent
from app.models.document import SourceDocument, DocumentChunk

logger = logging.getLogger(__name__)

PORTFOLIO_COMPANIES: List[Dict[str, Any]] = [
    {"ticker": "RELIANCE",   "yahoo_symbol": "RELIANCE.NS",   "name": "Reliance Industries Ltd",       "sector": "Oil & Gas",      "industry": "Conglomerate",    "market_cap_category": "large", "base_price": 2500.0, "avg_volume": 8_500_000},
    {"ticker": "HDFCBANK",   "yahoo_symbol": "HDFCBANK.NS",   "name": "HDFC Bank Ltd",                 "sector": "Banking",        "industry": "Private Banking", "market_cap_category": "large", "base_price": 1650.0, "avg_volume": 7_200_000},
    {"ticker": "ICICIBANK",  "yahoo_symbol": "ICICIBANK.NS",  "name": "ICICI Bank Ltd",                "sector": "Banking",        "industry": "Private Banking", "market_cap_category": "large", "base_price": 1050.0, "avg_volume": 9_000_000},
    {"ticker": "SBIN",       "yahoo_symbol": "SBIN.NS",       "name": "State Bank of India",           "sector": "Banking",        "industry": "Public Banking",  "market_cap_category": "large", "base_price": 620.0,  "avg_volume": 15_000_000},
    {"ticker": "AXISBANK",   "yahoo_symbol": "AXISBANK.NS",   "name": "Axis Bank Ltd",                 "sector": "Banking",        "industry": "Private Banking", "market_cap_category": "large", "base_price": 1100.0, "avg_volume": 6_000_000},
    {"ticker": "INFY",       "yahoo_symbol": "INFY.NS",       "name": "Infosys Ltd",                   "sector": "IT Services",    "industry": "IT Consulting",   "market_cap_category": "large", "base_price": 1450.0, "avg_volume": 8_000_000},
    {"ticker": "TCS",        "yahoo_symbol": "TCS.NS",        "name": "Tata Consultancy Services Ltd", "sector": "IT Services",    "industry": "IT Consulting",   "market_cap_category": "large", "base_price": 3500.0, "avg_volume": 3_500_000},
    {"ticker": "WIPRO",      "yahoo_symbol": "WIPRO.NS",      "name": "Wipro Ltd",                     "sector": "IT Services",    "industry": "IT Consulting",   "market_cap_category": "large", "base_price": 460.0,  "avg_volume": 10_000_000},
    {"ticker": "LT",         "yahoo_symbol": "LT.NS",         "name": "Larsen & Toubro Ltd",           "sector": "Engineering",    "industry": "EPC / Infra",     "market_cap_category": "large", "base_price": 3200.0, "avg_volume": 3_000_000},
    {"ticker": "BHARTIARTL", "yahoo_symbol": "BHARTIARTL.NS", "name": "Bharti Airtel Ltd",             "sector": "Telecom",        "industry": "Telecom Services","market_cap_category": "large", "base_price": 1550.0, "avg_volume": 5_500_000},
    {"ticker": "ITC",        "yahoo_symbol": "ITC.NS",        "name": "ITC Ltd",                       "sector": "FMCG",           "industry": "Tobacco / FMCG",  "market_cap_category": "large", "base_price": 470.0,  "avg_volume": 12_000_000},
    {"ticker": "HINDUNILVR", "yahoo_symbol": "HINDUNILVR.NS", "name": "Hindustan Unilever Ltd",        "sector": "FMCG",           "industry": "Personal Care",   "market_cap_category": "large", "base_price": 2550.0, "avg_volume": 2_500_000},
    {"ticker": "MARUTI",     "yahoo_symbol": "MARUTI.NS",     "name": "Maruti Suzuki India Ltd",       "sector": "Automobile",     "industry": "Passenger Cars",  "market_cap_category": "large", "base_price": 11200.0,"avg_volume": 800_000},
    {"ticker": "TATAMOTORS", "yahoo_symbol": "TATAMOTORS.NS", "name": "Tata Motors Ltd",               "sector": "Automobile",     "industry": "Auto / CV",       "market_cap_category": "large", "base_price": 780.0,  "avg_volume": 11_000_000},
    {"ticker": "SUNPHARMA",  "yahoo_symbol": "SUNPHARMA.NS",  "name": "Sun Pharma Industries Ltd",     "sector": "Pharma",         "industry": "Pharmaceuticals", "market_cap_category": "large", "base_price": 1680.0, "avg_volume": 4_000_000},
    {"ticker": "TATASTEEL",  "yahoo_symbol": "TATASTEEL.NS",  "name": "Tata Steel Ltd",                "sector": "Metals",         "industry": "Steel",           "market_cap_category": "large", "base_price": 145.0,  "avg_volume": 20_000_000},
    {"ticker": "NTPC",       "yahoo_symbol": "NTPC.NS",       "name": "NTPC Ltd",                      "sector": "Power",          "industry": "Power Generation","market_cap_category": "large", "base_price": 360.0,  "avg_volume": 14_000_000},
    {"ticker": "TITAN",      "yahoo_symbol": "TITAN.NS",      "name": "Titan Company Ltd",             "sector": "Consumer Goods", "industry": "Jewellery / Watch","market_cap_category": "large", "base_price": 3300.0, "avg_volume": 2_800_000},
]

RESEARCH_COMPANIES: List[Dict[str, Any]] = [
    {"ticker": "ADANIPORTS",  "yahoo_symbol": "ADANIPORTS.NS",  "name": "Adani Ports and SEZ Ltd",  "sector": "Infrastructure","industry": "Port / Logistics",  "market_cap_category": "large", "base_price": 1180.0, "avg_volume": 7_500_000},
    {"ticker": "TRENT",       "yahoo_symbol": "TRENT.NS",       "name": "Trent Ltd",                "sector": "Retail",       "industry": "Fashion Retail",    "market_cap_category": "mid",   "base_price": 5200.0, "avg_volume": 1_200_000},
    {"ticker": "BEL",         "yahoo_symbol": "BEL.NS",         "name": "Bharat Electronics Ltd",   "sector": "Defence",      "industry": "Defence Electronics","market_cap_category": "large", "base_price": 260.0,  "avg_volume": 16_000_000},
    {"ticker": "DMART",       "yahoo_symbol": "DMART.NS",       "name": "Avenue Supermarts Ltd",    "sector": "Retail",       "industry": "Hypermarket",       "market_cap_category": "large", "base_price": 3800.0, "avg_volume": 900_000},
    {"ticker": "ZOMATO",      "yahoo_symbol": "ZOMATO.NS",      "name": "Zomato Ltd",               "sector": "Food Tech",    "industry": "Food Delivery",     "market_cap_category": "large", "base_price": 200.0,  "avg_volume": 25_000_000},
]

WATCHLIST_INDICES = {4, 7, 10, 15, 17}  # AXISBANK, WIPRO, ITC, TATASTEEL, TITAN

def _trading_days(start: date, end: date) -> List[date]:
    days: List[date] = []
    cur = start
    while cur <= end:
        if cur.weekday() < 5:  # Mon-Fri
            days.append(cur)
        cur += timedelta(days=1)
    return days

def _round2(v: float) -> float:
    return round(v, 2)

def _generate_price_bars(
    company_id: int,
    ticker: str,
    base_price: float,
    avg_volume: int,
    trading_dates: List[date],
    rng: random.Random,
    *,
    large_move_dates: Optional[Dict[str, List[int]]] = None,
    high_volume_dates: Optional[Dict[str, List[int]]] = None,
) -> List[PriceBar]:
    bars: List[PriceBar] = []
    prev_close = base_price

    lm_indices = set(large_move_dates.get(ticker, [])) if large_move_dates else set()
    hv_indices = set(high_volume_dates.get(ticker, [])) if high_volume_dates else set()

    for idx, day in enumerate(trading_dates):
        if idx in lm_indices:
            pct = rng.uniform(0.032, 0.058) * rng.choice([-1, 1])
        else:
            pct = rng.gauss(0.0005, 0.014)

        close = _round2(prev_close * (1.0 + pct))
        gap = rng.gauss(0.0, 0.003)
        open_price = _round2(prev_close * (1.0 + gap))

        intra_range = abs(close - open_price) + prev_close * rng.uniform(0.002, 0.012)
        high = _round2(max(open_price, close) + rng.uniform(0.0, intra_range * 0.5))
        low = _round2(min(open_price, close) - rng.uniform(0.0, intra_range * 0.5))

        low = max(low, _round2(prev_close * 0.85))
        high = max(high, max(open_price, close))
        low = min(low, min(open_price, close))

        if idx in hv_indices:
            volume = int(avg_volume * rng.uniform(2.2, 3.5))
        else:
            volume = int(avg_volume * rng.uniform(0.6, 1.4))

        bar = PriceBar(
            company_id=company_id,
            date=day,
            open=open_price,
            high=high,
            low=low,
            close=close,
            adj_close=close,
            volume=volume,
            source="demo",
            is_demo=True,
        )
        bars.append(bar)
        prev_close = close

    return bars

_SAMPLE_ANNOUNCEMENTS: List[Dict[str, Any]] = [
    # Results
    {"ticker": "RELIANCE", "category": "results", "title": "Reliance Industries Ltd - Outcome of Board Meeting - Financial Results for the Quarter and Half Year ended September 30, 2024", "date": "2024-10-18 17:30:00", "summary": "Board approved Q2 FY25 results. Revenue ₹2,35,481 Cr, PAT ₹19,101 Cr (+10.2% YoY). EBITDA margins improved to 17.8%."},
    {"ticker": "INFY",     "category": "results", "title": "Infosys Ltd - Financial Results for the Quarter and Half Year ended September 30, 2024 (Q2 FY25)", "date": "2024-10-17 16:45:00", "summary": "Revenue $4,894 Mn (+3.7% QoQ in CC). Operating margin 21.1%. Large deal TCV $2.4 Bn. Revised FY25 revenue growth guidance to 3.75%–4.5%."},
    {"ticker": "TCS",      "category": "results", "title": "Tata Consultancy Services Ltd - Board Meeting Outcome - Un-audited Financial Results for the Quarter ended September 30, 2024", "date": "2024-10-10 18:00:00", "summary": "Revenue ₹64,259 Cr (+7.6% YoY). PAT ₹12,380 Cr (+8.7%). Operating margin 24.3%. TCV $8.6 Bn for the quarter."},
    {"ticker": "HDFCBANK", "category": "results", "title": "HDFC Bank Ltd - Outcome of Board Meeting - Unaudited Financial Results for the Quarter and Half Year ended September 30, 2024", "date": "2024-10-19 14:15:00", "summary": "NII ₹30,110 Cr (+10.1% YoY). PAT ₹16,821 Cr (+5.3%). NIM at 3.46%. GNPA 1.24%, NNPA 0.37%."},
    {"ticker": "TATAMOTORS", "category": "results", "title": "Tata Motors Ltd - Un-audited Financial Results for the Quarter ended September 30, 2024", "date": "2024-10-25 18:30:00", "summary": "Revenue ₹1,01,450 Cr (+6%). JLR revenue £7.0 Bn. EBITDA margin 14.2%. Net auto debt reduced to ₹44,300 Cr."},
    {"ticker": "ICICIBANK","category": "results", "title": "ICICI Bank Ltd - Financial Results for Quarter and Half Year ended September 30, 2024", "date": "2024-10-26 15:45:00", "summary": "NII ₹20,048 Cr (+9.5% YoY). PAT ₹11,746 Cr (+14.5%). GNPA improved to 1.97%. ROA 2.36%."},
    # M&A
    {"ticker": "RELIANCE", "category": "M&A", "title": "Reliance Industries Ltd - Acquisition of 73% Stake in Karkinos Healthcare Pvt Ltd", "date": "2024-11-05 11:20:00", "summary": "Reliance to acquire 73% stake in Karkinos Healthcare for ₹1,200 Cr to strengthen healthcare vertical."},
    {"ticker": "ZOMATO",   "category": "M&A", "title": "Zomato Ltd - Acquisition of Paytm's Movie & Events Ticketing Business", "date": "2024-10-28 10:15:00", "summary": "Zomato acquires Paytm's entertainment ticketing vertical for ₹2,048 Cr. Expected to add 15 Mn monthly transacting users."},
    {"ticker": "TITAN",    "category": "M&A", "title": "Titan Company Ltd - Acquisition of Remaining 27.18% Stake in CaratLane", "date": "2024-11-12 13:00:00", "summary": "Titan acquires remaining stake in CaratLane for ₹4,621 Cr, making it a wholly owned subsidiary."},
    # Management Change
    {"ticker": "INFY",     "category": "management_change", "title": "Infosys Ltd - Appointment of Mr. Jayesh Sanghrajka as Chief Financial Officer", "date": "2024-11-01 09:30:00", "summary": "Board appointed Jayesh Sanghrajka as CFO w.e.f. November 15, 2024, succeeding Nilanjan Roy."},
    {"ticker": "TCS",      "category": "management_change", "title": "Tata Consultancy Services Ltd - Designation of Mr. K Krithivasan as Chief Executive Officer and Managing Director", "date": "2024-10-15 16:00:00", "summary": "Board re-designated K Krithivasan as CEO & MD effective October 15, 2024 for a period of 5 years."},
    {"ticker": "WIPRO",    "category": "management_change", "title": "Wipro Ltd - Resignation of Chief Technology Officer", "date": "2024-12-03 18:20:00", "summary": "Mr. Subha Tatavarti, CTO, tendered resignation effective December 31, 2024. Search for successor underway."},
    # Dividend
    {"ticker": "TCS",      "category": "dividend", "title": "Tata Consultancy Services Ltd - Interim Dividend of ₹10/- per Equity Share", "date": "2024-10-10 18:15:00", "summary": "Board declared interim dividend of ₹10 per share. Record date October 18, 2024."},
    {"ticker": "ITC",      "category": "dividend", "title": "ITC Ltd - Interim Dividend of ₹6.50 per Equity Share for FY 2024-25", "date": "2024-11-06 14:00:00", "summary": "Board approved interim dividend of ₹6.50 per share. Record date November 20, 2024."},
    {"ticker": "HINDUNILVR","category": "dividend", "title": "Hindustan Unilever Ltd - Second Interim Dividend for FY 2024-25", "date": "2024-11-18 15:30:00", "summary": "Board approved second interim dividend of ₹19 per share. Record date December 1, 2024."},
    # Fund Raise
    {"ticker": "BHARTIARTL","category": "fund_raise", "title": "Bharti Airtel Ltd - Board Approval for Raising Funds up to ₹21,000 Crores through QIP", "date": "2024-10-22 17:00:00", "summary": "Board approved QIP of up to ₹21,000 Cr. Proceeds for 5G capex, debt reduction and general corporate purposes."},
    {"ticker": "ZOMATO",   "category": "fund_raise", "title": "Zomato Ltd - Allotment of Equity Shares under Employee Stock Option Plan", "date": "2024-11-15 12:45:00", "summary": "Allotted 3.2 Cr equity shares under ESOP 2021. Total dilution approximately 0.37%."},
    # Litigation
    {"ticker": "TATASTEEL", "category": "litigation", "title": "Tata Steel Ltd - NCLT Order in the matter of Bhushan Steel Ltd", "date": "2024-11-22 16:10:00", "summary": "NCLT dismissed minority shareholder petition challenging the Bhushan Steel acquisition. No financial impact expected."},
    {"ticker": "SUNPHARMA", "category": "litigation", "title": "Sun Pharma Industries Ltd - Update on US FDA Inspection - Halol Facility", "date": "2024-12-05 11:00:00", "summary": "US FDA completed inspection of Halol facility with 3 observations. Company to respond within 15 business days."},
    # Insider Trading
    {"ticker": "RELIANCE", "category": "insider_trading", "title": "Reliance Industries Ltd - Disclosure under SEBI (PIT) Regulations - Acquisition of Shares by Promoter Group Entity", "date": "2024-10-30 19:00:00", "summary": "Devarshi Commercial LLP (promoter group) acquired 14,50,000 shares through open market. Total promoter holding now 50.31%."},
    {"ticker": "TITAN",    "category": "insider_trading", "title": "Titan Company Ltd - Disclosure under SEBI (PIT) Regulations - Sale of Shares by KMP", "date": "2024-12-10 17:20:00", "summary": "CFO sold 5,000 shares at ₹3,480 per share under pre-approved trading plan."},
    # Credit Rating
    {"ticker": "SBIN",     "category": "credit_rating", "title": "State Bank of India - Credit Rating - Reaffirmation by CRISIL", "date": "2024-11-08 15:00:00", "summary": "CRISIL reaffirmed SBI infrastructure bonds at AAA/Stable. Basel III Tier 2 bonds at AA+/Stable."},
    {"ticker": "LT",       "category": "credit_rating", "title": "Larsen & Toubro Ltd - CARE Ratings Reaffirmation - NCD Programme", "date": "2024-12-02 16:30:00", "summary": "CARE reaffirmed rating of CARE AAA; Stable for ₹5,000 Cr NCD programme. Strong order book and execution capabilities cited."},
    # Bonus Split
    {"ticker": "BEL",      "category": "bonus_split", "title": "Bharat Electronics Ltd - Bonus Issue in the ratio of 2:1", "date": "2024-11-25 14:00:00", "summary": "Board approved bonus issue of 2 shares for every 1 share held. Record date to be announced. Effective from January 2025."},
    {"ticker": "NTPC",     "category": "bonus_split", "title": "NTPC Ltd - Stock Split - Sub-division of Equity Shares from ₹10 to ₹5", "date": "2024-10-08 17:15:00", "summary": "Board approved sub-division of face value from ₹10 to ₹5 per share. Record date November 1, 2024."},
    # Capex
    {"ticker": "RELIANCE",  "category": "capex", "title": "Reliance Industries Ltd - Board Approval for New Energy Giga-Complex at Jamnagar", "date": "2024-12-01 10:30:00", "summary": "Board approved ₹75,000 Cr phased investment for New Energy complex including solar module, battery, electrolyser & fuel cell factories."},
    {"ticker": "BHARTIARTL","category": "capex", "title": "Bharti Airtel Ltd - 5G Rollout Capex Update - Pan India Coverage", "date": "2024-10-14 11:30:00", "summary": "Company achieved 5G coverage in 5,000+ cities. FY25 capex guidance maintained at ₹24,000–27,000 Cr."},
    # Press Release
    {"ticker": "INFY",      "category": "press_release", "title": "Infosys Ltd - Strategic Collaboration with NVIDIA for Generative AI Solutions", "date": "2024-10-08 12:00:00", "summary": "Infosys announced expanded collaboration with NVIDIA to develop industry-specific Gen AI solutions leveraging Infosys Topaz."},
    {"ticker": "WIPRO",     "category": "press_release", "title": "Wipro Ltd - Launch of Wipro ai360 Suite - Enterprise AI Platform", "date": "2024-11-20 10:00:00", "summary": "Wipro launched enterprise AI platform combining proprietary IP with partner models. Targets $1 Bn AI revenue by FY26."},
    {"ticker": "MARUTI",    "category": "press_release", "title": "Maruti Suzuki India Ltd - Monthly Sales Update - November 2024", "date": "2024-12-01 09:15:00", "summary": "Total sales 1,78,500 units (+12% YoY). Domestic PV sales 1,52,300 units. Export 26,200 units (+18% YoY)."},
    {"ticker": "TATAMOTORS","category": "press_release", "title": "Tata Motors Ltd - Global Wholesales Update - November 2024", "date": "2024-12-02 09:30:00", "summary": "JLR wholesale 1,02,500 units (+5%). Tata CV domestic sales 37,800 units. Tata PV sales (incl. EV) 48,200 units (+8%)."},
    {"ticker": "HDFCBANK",  "category": "press_release", "title": "HDFC Bank Ltd - Launch of Digital Lending Platform for MSME Sector", "date": "2024-11-10 11:00:00", "summary": "Launched end-to-end digital MSME lending platform enabling loan disbursal within 30 minutes. Target ₹50,000 Cr MSME book by FY26."},
    # AGM/EGM
    {"ticker": "RELIANCE",  "category": "agm_egm", "title": "Reliance Industries Ltd - Notice of 47th Annual General Meeting", "date": "2024-10-02 18:00:00", "summary": "AGM scheduled for October 24, 2024 via video conferencing. E-voting from October 21 to October 23, 2024."},
    {"ticker": "ICICIBANK", "category": "agm_egm", "title": "ICICI Bank Ltd - Notice of Extra-ordinary General Meeting", "date": "2024-12-08 17:30:00", "summary": "EGM to approve increase in borrowing limits to ₹2,00,000 Cr and creation of charge/mortgage on assets."},
    # Pledging
    {"ticker": "ADANIPORTS", "category": "pledging", "title": "Adani Ports and SEZ Ltd - Disclosure of Encumbrance of Shares by Promoter Group", "date": "2024-10-20 16:45:00", "summary": "S.B. Adani Family Trust revoked pledge of 1.2 Cr shares. Total promoter pledging reduced to 3.8% of total holding."},
    {"ticker": "TATASTEEL",  "category": "pledging", "title": "Tata Steel Ltd - Disclosure of Pledge by Promoter Group", "date": "2024-11-28 17:15:00", "summary": "Tata Sons created pledge of 5.5 Cr shares for financing purposes. Total promoter pledging at 2.1% of promoter holding."},
    # Earnings Call
    {"ticker": "INFY",      "category": "earnings_call", "title": "Infosys Ltd - Transcript of Earnings Conference Call - Q2 FY25", "date": "2024-10-17 20:00:00", "summary": "Management highlighted strong pipeline in financial services, reiterated focus on AI-led transformation. Attrition improved to 12.3%."},
    {"ticker": "RELIANCE",  "category": "earnings_call", "title": "Reliance Industries Ltd - Transcript of Analysts/Institutional Investor Meet - Q2 FY25", "date": "2024-10-19 19:30:00", "summary": "Discussed Jio subscriber additions (13.5 Mn in Q2), Retail store expansion plan, and New Energy Giga-factory timeline."},
    # Postal Ballot
    {"ticker": "LT",        "category": "postal_ballot", "title": "Larsen & Toubro Ltd - Postal Ballot Notice - Special Resolution", "date": "2024-11-15 15:45:00", "summary": "Postal ballot for approval of related party transactions with L&T Finance Holdings Ltd exceeding materiality threshold."},
    {"ticker": "SBIN",      "category": "postal_ballot", "title": "State Bank of India - Postal Ballot Result - Appointment of Independent Directors", "date": "2024-12-12 18:30:00", "summary": "Shareholders approved appointment of 3 independent directors with over 99.5% votes in favour."},
    # Investor Meetings
    {"ticker": "TITAN",      "category": "investor_meetings", "title": "Titan Company Ltd - Schedule of Investor / Analyst Meeting", "date": "2024-11-04 14:00:00", "summary": "Management to participate in Morgan Stanley India Summit on November 14, 2024."},
    # Unclassified
    {"ticker": "ITC",        "category": "unclassified", "title": "ITC Ltd - Compliance Certificate under Reg. 7(3) of SEBI LODR", "date": "2024-10-11 11:30:00", "summary": "Submission of certificate confirming maintenance of physical and electronic share transfer facilities."},
    # Additional results / press releases
    {"ticker": "SUNPHARMA", "category": "results",       "title": "Sun Pharma Industries Ltd - Financial Results for the Quarter ended September 30, 2024", "date": "2024-11-14 17:00:00", "summary": "Revenue ₹12,815 Cr (+11% YoY). Specialty revenue $530 Mn (+16%). EBITDA margin 27.8%. PAT ₹2,945 Cr."},
    {"ticker": "LT",        "category": "results",       "title": "Larsen & Toubro Ltd - Unaudited Financial Results for Quarter ended September 30, 2024", "date": "2024-10-23 18:15:00", "summary": "Revenue ₹55,120 Cr (+15% YoY). Order inflow ₹80,045 Cr (+22%). Order book ₹4,78,000 Cr. PAT ₹3,395 Cr (+20%)."},
    {"ticker": "DMART",     "category": "results",       "title": "Avenue Supermarts Ltd - Q2 FY25 Financial Results", "date": "2024-10-12 15:30:00", "summary": "Revenue ₹14,050 Cr (+18% YoY). EBITDA margin 8.5%. PAT ₹690 Cr (+12%). Opened 8 new stores taking total to 365."},
    {"ticker": "TRENT",     "category": "press_release", "title": "Trent Ltd - Zudio Brand Crosses 500 Store Milestone", "date": "2024-11-30 11:00:00", "summary": "Zudio format crossed 500 stores across 150+ cities. Same-store revenue growth of 22% in H1 FY25."},
    {"ticker": "DMART",     "category": "press_release", "title": "Avenue Supermarts Ltd - Store Count and Revenue Update", "date": "2024-12-15 10:00:00", "summary": "Total store count reaches 370. Revenue run-rate ahead of guidance. Online DMart Ready platform now in 28 cities."},
    {"ticker": "BEL",       "category": "press_release", "title": "Bharat Electronics Ltd - Order Win of ₹3,800 Cr from Indian Air Force", "date": "2024-10-28 12:30:00", "summary": "Received order worth ₹3,800 Cr for advanced radar systems and electronic warfare equipment from IAF."},
]

_QUARTERS = [
    {"fiscal_year": 2025, "fiscal_quarter": 2, "period_start": date(2024, 7, 1), "period_end": date(2024, 9, 30)},
    {"fiscal_year": 2025, "fiscal_quarter": 1, "period_start": date(2024, 4, 1), "period_end": date(2024, 6, 30)},
    {"fiscal_year": 2024, "fiscal_quarter": 2, "period_start": date(2023, 7, 1), "period_end": date(2023, 9, 30)},
]

_FINANCIAL_DATA = [
    # RELIANCE
    ("RELIANCE", 0, 235481.0, 41916.0, 26420.0, 19101.0),
    ("RELIANCE", 1, 228200.0, 39500.0, 24800.0, 17880.0),
    ("RELIANCE", 2, 213380.0, 37100.0, 22950.0, 17331.0),
    # INFY
    ("INFY",     0, 40620.0, 8570.0, 7820.0, 6506.0),
    ("INFY",     1, 39120.0, 8110.0, 7390.0, 6168.0),
    ("INFY",     2, 38160.0, 7940.0, 7180.0, 6026.0),
    # HDFCBANK
    ("HDFCBANK", 0, 87150.0, 29200.0, 24310.0, 16821.0),
    ("HDFCBANK", 1, 84520.0, 28100.0, 23650.0, 16175.0),
    ("HDFCBANK", 2, 78900.0, 25800.0, 20820.0, 15976.0),
    # TCS
    ("TCS",      0, 64259.0, 16705.0, 16105.0, 12380.0),
    ("TCS",      1, 62613.0, 15715.0, 15320.0, 11909.0),
    ("TCS",      2, 59692.0, 15280.0, 14760.0, 11380.0),
    # TATAMOTORS
    ("TATAMOTORS", 0, 101450.0, 14406.0, 8870.0, 5503.0),
    ("TATAMOTORS", 1, 108048.0, 15240.0, 9150.0, 5692.0),
    ("TATAMOTORS", 2, 105128.0, 13150.0, 6920.0, 3764.0),
]

_CHUNK_CONTENTS = [
    {
        "doc_title": "Reliance Industries Annual Report FY24",
        "chunk_index": 0,
        "content": "Chairman's Statement: The year witnessed Reliance achieving its highest-ever revenue of ₹9,01,064 crore and net profit of ₹69,621 crore. Our consumer businesses — Jio and Retail — now contribute over 50% of EBITDA, demonstrating the success of our diversification strategy. The New Energy business is progressing on schedule with the Jamnagar Giga-factory expected to commence operations in FY26.",
        "page_number": 4,
        "heading": "Chairman's Statement",
    },
    {
        "doc_title": "Reliance Industries Annual Report FY24",
        "chunk_index": 1,
        "content": "Financial Highlights FY24: Consolidated Revenue from Operations ₹9,01,064 Cr (+2.6% YoY). EBITDA ₹1,57,482 Cr (+10.4%). Net Profit ₹69,621 Cr (+7.9%). Capital Expenditure ₹1,32,000 Cr. Net Debt/EBITDA ratio improved to 0.27x from 0.32x. Total subscriber base (Jio) crossed 474 Mn.",
        "page_number": 18,
        "heading": "Financial Highlights",
    },
    {
        "doc_title": "Reliance Industries Annual Report FY24",
        "chunk_index": 2,
        "content": "Risk Management: Key risks identified include crude oil price volatility (mitigated through integrated operations and hedging), regulatory changes in telecom sector (mitigated through strong compliance framework), competition in retail (mitigated through omni-channel strategy and private labels). Cyber security risk managed through SOC operations and regular VAPT assessments.",
        "page_number": 85,
        "heading": "Risk Management Disclosures",
    },
    {
        "doc_title": "Infosys Annual Report FY24",
        "chunk_index": 0,
        "content": "CEO's Letter: FY24 revenues grew 1.4% in constant currency, reflecting the cautious macroeconomic environment. We won 30 large deals with TCV of $9.2 Bn. Infosys Topaz, our AI-first offering, is being adopted across 240+ clients. Operating margin was 20.7% within our guidance range of 20-22%.",
        "page_number": 6,
        "heading": "CEO's Letter to Shareholders",
    },
    {
        "doc_title": "Infosys Annual Report FY24",
        "chunk_index": 1,
        "content": "Segment Performance FY24: Financial Services contributed 28.3% of revenue ($5.12 Bn). Retail segment grew 2.8%. Life Sciences grew fastest at 4.1%. Manufacturing segment revenue was $2.35 Bn. Hi-Tech segment impacted by client-specific challenges, declining 1.2%. Europe grew faster than Americas.",
        "page_number": 42,
        "heading": "Segment Breakdown and Geographical Exposure",
    },
    {
        "doc_title": "Infosys Q2 FY25 Concall Transcript",
        "chunk_index": 0,
        "content": "Salil Parekh (CEO): We had a strong quarter with revenues at $4,894 million, a growth of 3.7% QoQ in constant currency. Large deal wins were healthy at $2.4 billion. We are seeing good momentum in financial services and manufacturing. Gen AI projects contributed approximately $100 million in revenue this quarter.",
        "page_number": 2,
        "heading": "Management Opening Remarks",
    },
    {
        "doc_title": "Infosys Q2 FY25 Concall Transcript",
        "chunk_index": 1,
        "content": "Jayesh Sanghrajka (CFO): Operating margin for Q2 was 21.1%, an improvement of 50 bps QoQ driven by operational efficiencies and utilization improvement to 83.5%. Free cash flow conversion was strong at 93% of net profit. We are revising our FY25 guidance: Revenue growth of 3.75%–4.5% in CC terms; Operating margin guidance of 20%–22% maintained.",
        "page_number": 5,
        "heading": "Financial Performance and Revised Guidance",
    },
    {
        "doc_title": "Infosys Q2 FY25 Concall Transcript",
        "chunk_index": 2,
        "content": "Q&A Session — Analyst: Can you comment on the demand environment in BFSI? Salil Parekh: We are seeing a recovery in BFSI spending. Clients are moving from cost optimization to growth programs. Mortgage-related spending has stabilized. We won 3 large BFSI deals this quarter with combined TCV of $600 Mn.",
        "page_number": 12,
        "heading": "Q&A Session - BFSI Spending Outlook",
    },
    {
        "doc_title": "HDFC Bank Annual Report FY24",
        "chunk_index": 0,
        "content": "Managing Director's Statement: The merger integration is progressing well. Net Interest Income grew 29.7% to ₹1,09,150 Cr reflecting the full-year impact of the merger. Advances grew 55.6% to ₹25,08,900 Cr. Deposits grew 25.8%. We maintained asset quality with GNPA at 1.24%. Digital transactions accounted for 96% of total transactions.",
        "page_number": 8,
        "heading": "Managing Director's Overview",
    },
    {
        "doc_title": "HDFC Bank Annual Report FY24",
        "chunk_index": 1,
        "content": "Capital Adequacy: CRAR (Basel III) stood at 18.8% vs regulatory minimum of 11.7%. Tier 1 ratio 16.3%. The bank's CET1 ratio at 15.4% provides significant buffer. Liquidity Coverage Ratio (LCR) averaged 118% during the year, well above the 100% requirement.",
        "page_number": 56,
        "heading": "Capital and Liquidity Position",
    },
    {
        "doc_title": "HDFC Bank Annual Report FY24",
        "chunk_index": 2,
        "content": "Retail Lending Portfolio: Home loans outstanding ₹6,94,000 Cr, Personal loans ₹2,12,000 Cr, Auto loans ₹1,48,000 Cr, Credit cards outstanding ₹87,500 Cr. Rural lending grew 22% YoY. MSME book reached ₹3,25,000 Cr. Total retail book constitutes 72% of advances.",
        "page_number": 72,
        "heading": "Retail Advances Composition",
    },
]

async def seed_demo_data(session: AsyncSession) -> Dict[str, Any]:
    """Seed demo data into the database. Idempotent — skips if companies exist."""
    rng = random.Random(42)

    result = await session.execute(select(Company).limit(1))
    if result.scalars().first() is not None:
        logger.info("Demo data already present - skipping seed.")
        return {"status": "skipped", "reason": "data_exists"}

    summary: Dict[str, Any] = {}

    # 1. Companies
    all_company_defs = PORTFOLIO_COMPANIES + RESEARCH_COMPANIES
    companies: List[Company] = []
    ticker_to_company: Dict[str, Company] = {}

    for cdef in all_company_defs:
        c = Company(
            ticker=cdef["ticker"],
            name=cdef["name"],
            sector=cdef["sector"],
            industry=cdef["industry"],
            exchange="NSE",
            yahoo_symbol=cdef["yahoo_symbol"],
            market_cap_category=cdef["market_cap_category"],
            is_active=True,
        )
        companies.append(c)
        ticker_to_company[cdef["ticker"]] = c

    session.add_all(companies)
    await session.flush()
    summary["companies"] = len(companies)
    ticker_to_id: Dict[str, int] = {c.ticker: c.id for c in companies}

    # 2. Portfolio Memberships
    memberships: List[PortfolioMembership] = []
    for idx, cdef in enumerate(PORTFOLIO_COMPANIES):
        pm = PortfolioMembership(
            company_id=ticker_to_id[cdef["ticker"]],
            portfolio_name="default",
            is_watchlist=idx in WATCHLIST_INDICES,
        )
        memberships.append(pm)

    session.add_all(memberships)
    await session.flush()
    summary["portfolio_memberships"] = len(memberships)

    # 3. Price Bars (60 trading days)
    trading_dates = _trading_days(date(2024, 10, 1), date(2024, 12, 31))
    large_move_dates: Dict[str, List[int]] = {
        "RELIANCE":  [12, 38],
        "HDFCBANK":  [15, 50],
        "INFY":      [11, 35, 55],
        "TCS":       [8, 42],
        "TATAMOTORS":[20, 48],
        "TATASTEEL": [25, 58],
        "SBIN":      [30],
        "BHARTIARTL":[18, 45],
        "ZOMATO":    [22, 40],
        "TRENT":     [33],
    }
    high_volume_dates: Dict[str, List[int]] = {
        "RELIANCE":  [12, 38, 55],
        "INFY":      [11, 35],
        "TCS":       [8, 42],
        "SBIN":      [30, 52],
        "TATAMOTORS":[20, 48],
        "TATASTEEL": [25, 58],
        "ZOMATO":    [22, 40, 50],
        "BEL":       [29, 44],
    }

    all_bars: List[PriceBar] = []
    for cdef in all_company_defs:
        bars = _generate_price_bars(
            company_id=ticker_to_id[cdef["ticker"]],
            ticker=cdef["ticker"],
            base_price=cdef["base_price"],
            avg_volume=cdef["avg_volume"],
            trading_dates=trading_dates,
            rng=rng,
            large_move_dates=large_move_dates,
            high_volume_dates=high_volume_dates,
        )
        all_bars.extend(bars)

    session.add_all(all_bars)
    await session.flush()
    summary["price_bars"] = len(all_bars)

    # 4. Announcements + Classifications
    announcements: List[Announcement] = []
    classifications: List[AnnouncementClassification] = []

    for adef in _SAMPLE_ANNOUNCEMENTS:
        ann_date = datetime.strptime(adef["date"], "%Y-%m-%d %H:%M:%S")
        cat = adef["category"]
        score = 0.85 if cat in ("results", "M&A", "management_change", "litigation") else 0.5
        ann = Announcement(
            company_id=ticker_to_id[adef["ticker"]],
            title=adef["title"],
            description=adef.get("summary", ""),
            exchange="NSE",
            category=cat,
            source_url=f"https://www.nseindia.com/corporate-filings/demo_{adef['ticker']}_{adef['category']}.pdf",
            filing_date=ann_date,
            is_demo=True,
            status="new",
            priority_score=score,
        )
        announcements.append(ann)

    session.add_all(announcements)
    await session.flush()

    for ann in announcements:
        cls = AnnouncementClassification(
            announcement_id=ann.id,
            category=ann.category or "unclassified",
            confidence=round(rng.uniform(0.88, 0.99), 2),
            explanation=f"Deterministic rule match on category '{ann.category}' for demonstration.",
            evidence_snippet=ann.title[:250],
            method="keyword",
            classified_at=datetime.utcnow(),
        )
        classifications.append(cls)

    session.add_all(classifications)
    await session.flush()
    summary["announcements"] = len(announcements)
    summary["announcement_classifications"] = len(classifications)

    # 5. Financial Periods & Metrics
    fin_periods: List[FinancialPeriod] = []
    period_map: Dict[Tuple[str, int], FinancialPeriod] = {}

    for fd in _FINANCIAL_DATA:
        ticker, q_idx = fd[0], fd[1]
        key = (ticker, q_idx)
        if key not in period_map:
            q_info = _QUARTERS[q_idx]
            fp = FinancialPeriod(
                company_id=ticker_to_id[ticker],
                period_type="quarterly",
                fiscal_year=q_info["fiscal_year"],
                fiscal_quarter=q_info["fiscal_quarter"],
                period_start=q_info["period_start"],
                period_end=q_info["period_end"],
                reporting_basis="consolidated",
            )
            fin_periods.append(fp)
            period_map[key] = fp

    session.add_all(fin_periods)
    await session.flush()

    fin_metrics: List[FinancialMetric] = []
    metric_names = ["revenue", "ebitda", "pbt", "pat"]

    for fd in _FINANCIAL_DATA:
        ticker, q_idx, rev, ebitda, pbt, pat = fd
        fp = period_map[(ticker, q_idx)]
        vals = [rev, ebitda, pbt, pat]
        for mname, val in zip(metric_names, vals):
            if val is not None:
                fm = FinancialMetric(
                    financial_period_id=fp.id,
                    metric_name=mname,
                    value=val,
                    unit="crores",
                    currency="INR",
                    is_directly_reported=True,
                    confidence=1.0,
                    is_demo=True,
                )
                fin_metrics.append(fm)

    session.add_all(fin_metrics)
    await session.flush()
    summary["financial_periods"] = len(fin_periods)
    summary["financial_metrics"] = len(fin_metrics)

    # 6. Alert Rules
    alert_rules: List[AlertRule] = [
        AlertRule(
            name="Global Price Movement Alert (3%)",
            rule_type="price_movement",
            company_id=None,
            threshold_value=3.0,
            threshold_direction="both",
            is_enabled=True,
        ),
        AlertRule(
            name="Global Unusual Volume Alert (2x)",
            rule_type="unusual_volume",
            company_id=None,
            volume_multiplier=2.0,
            volume_lookback_days=20,
            is_enabled=True,
        ),
        AlertRule(
            name="Results Announcement Subscription",
            rule_type="material_announcement",
            company_id=None,
            announcement_categories=json.dumps(["results"]),
            is_enabled=True,
        ),
        AlertRule(
            name="M&A Announcement Subscription",
            rule_type="material_announcement",
            company_id=None,
            announcement_categories=json.dumps(["M&A"]),
            is_enabled=True,
        ),
        AlertRule(
            name="Management Change Subscription",
            rule_type="material_announcement",
            company_id=None,
            announcement_categories=json.dumps(["management_change"]),
            is_enabled=True,
        ),
    ]

    session.add_all(alert_rules)
    await session.flush()
    summary["alert_rules"] = len(alert_rules)

    # 7. Guidance Statements
    guidance_statements: List[GuidanceStatement] = [
        GuidanceStatement(
            company_id=ticker_to_id["INFY"],
            statement_date=date(2024, 10, 17),
            statement_text="Revenue growth guidance of 3.75% - 4.5% in constant currency for FY25",
            metric_name="revenue_growth",
            target_value_low=3.75,
            target_value_high=4.5,
            target_unit="percent",
            target_period="FY25",
            is_quantitative=True,
            status="achieved",
            actual_value=5.2,
            variance_pct=15.5,
            assessment_notes="Delivered 5.2% CC growth, exceeding top end of revised guidance.",
        ),
        GuidanceStatement(
            company_id=ticker_to_id["RELIANCE"],
            statement_date=date(2024, 10, 19),
            statement_text="Targeting consolidated EBITDA margin of 18% for FY25",
            metric_name="ebitda_margin",
            target_value_low=18.0,
            target_value_high=18.0,
            target_unit="percent",
            target_period="FY25",
            is_quantitative=True,
            status="missed",
            actual_value=16.5,
            variance_pct=-8.3,
            assessment_notes="EBITDA margin reached 16.5%, below target due to O2C margin weakness.",
        ),
        GuidanceStatement(
            company_id=ticker_to_id["TCS"],
            statement_date=date(2024, 10, 10),
            statement_text="Plan to onboard 40,000 freshers across engineering campuses in FY25",
            metric_name="fresher_hiring",
            target_value_low=40000.0,
            target_value_high=40000.0,
            target_unit="headcount",
            target_period="FY25",
            is_quantitative=True,
            status="not_assessable",
            actual_value=None,
            variance_pct=None,
            assessment_notes="Full-year onboarding delivery will be assessed post Q4 FY25 completion.",
        ),
        GuidanceStatement(
            company_id=ticker_to_id["INFY"],
            statement_date=date(2024, 10, 17),
            statement_text="Operating margin band of 20% - 22% for FY25",
            metric_name="operating_margin",
            target_value_low=20.0,
            target_value_high=22.0,
            target_unit="percent",
            target_period="FY25",
            is_quantitative=True,
            status="achieved",
            actual_value=21.1,
            variance_pct=0.0,
            assessment_notes="Q2 operating margin was 21.1%, comfortably within the 20-22% band.",
        ),
    ]

    session.add_all(guidance_statements)
    await session.flush()
    summary["guidance_statements"] = len(guidance_statements)

    # 8. Source Documents
    source_docs: List[SourceDocument] = [
        SourceDocument(
            company_id=ticker_to_id["RELIANCE"],
            title="Reliance Industries Annual Report FY24",
            document_type="annual_report",
            financial_period="FY24",
            publication_date=date(2024, 6, 20),
            local_path="data/documents/demo/RELIANCE_AR_FY24.pdf",
            source_url="https://www.ril.com/ar2024/annual-report-2024.pdf",
            status="processed",
            page_count=310,
            is_demo=True,
        ),
        SourceDocument(
            company_id=ticker_to_id["INFY"],
            title="Infosys Annual Report FY24",
            document_type="annual_report",
            financial_period="FY24",
            publication_date=date(2024, 6, 15),
            local_path="data/documents/demo/INFY_AR_FY24.pdf",
            source_url="https://www.infosys.com/investors/reports-filings/annual-report/annual/Documents/infosys-ar-24.pdf",
            status="processed",
            page_count=248,
            is_demo=True,
        ),
        SourceDocument(
            company_id=ticker_to_id["INFY"],
            title="Infosys Q2 FY25 Concall Transcript",
            document_type="concall_transcript",
            financial_period="Q2 FY25",
            publication_date=date(2024, 10, 17),
            local_path="data/documents/demo/INFY_Q2FY25_Concall.pdf",
            source_url="https://www.infosys.com/investors/reports-filings/quarterly-results/2024-2025/q2/q2-transcript.pdf",
            status="processed",
            page_count=42,
            is_demo=True,
        ),
        SourceDocument(
            company_id=ticker_to_id["HDFCBANK"],
            title="HDFC Bank Annual Report FY24",
            document_type="annual_report",
            financial_period="FY24",
            publication_date=date(2024, 6, 25),
            local_path="data/documents/demo/HDFCBANK_AR_FY24.pdf",
            source_url="https://www.hdfcbank.com/content/api/contentstream-id/annual-report-2024.pdf",
            status="processed",
            page_count=386,
            is_demo=True,
        ),
    ]

    session.add_all(source_docs)
    await session.flush()
    summary["source_documents"] = len(source_docs)

    doc_title_to_id = {d.title: d.id for d in source_docs}

    # 9. Document Chunks
    chunks: List[DocumentChunk] = []
    for cdef in _CHUNK_CONTENTS:
        doc_id = doc_title_to_id.get(cdef["doc_title"])
        if doc_id is None:
            continue
        chunk = DocumentChunk(
            source_document_id=doc_id,
            chunk_index=cdef["chunk_index"],
            content=cdef["content"],
            section_heading=cdef.get("heading"),
            page_number=cdef.get("page_number"),
            chunk_type="text",
        )
        chunks.append(chunk)

    session.add_all(chunks)
    await session.flush()
    summary["document_chunks"] = len(chunks)

    # 10. Sample Alert Events
    price_rule = alert_rules[0]
    volume_rule = alert_rules[1]
    results_rule = alert_rules[2]
    ma_rule = alert_rules[3]

    alert_events: List[AlertEvent] = [
        AlertEvent(
            alert_rule_id=price_rule.id,
            company_id=ticker_to_id["INFY"],
            triggered_at=datetime(2024, 10, 18, 15, 30),
            trigger_value="price_infy_20241018",
            observed_value="-4.20% on 2024-10-18",
            threshold_value="3.0% (both)",
            is_acknowledged=False,
            is_demo=True,
            dedup_key="demo_price_infy_20241018",
        ),
        AlertEvent(
            alert_rule_id=volume_rule.id,
            company_id=ticker_to_id["RELIANCE"],
            triggered_at=datetime(2024, 11, 5, 15, 30),
            trigger_value="volume_reliance_20241105",
            observed_value="2.8x average on 2024-11-05 (vol=23,800,000)",
            threshold_value="2.0x average (20-day lookback)",
            is_acknowledged=True,
            acknowledged_at=datetime(2024, 11, 5, 17, 0),
            is_demo=True,
            dedup_key="demo_volume_reliance_20241105",
        ),
        AlertEvent(
            alert_rule_id=results_rule.id,
            company_id=ticker_to_id["TCS"],
            triggered_at=datetime(2024, 10, 10, 18, 5),
            trigger_value="ann_tcs_q2results",
            observed_value="'Tata Consultancy Services Ltd - Board Meeting Outcome - Un-audited Financial Results' classified as 'results'",
            threshold_value="Subscribed categories: results",
            is_acknowledged=True,
            acknowledged_at=datetime(2024, 10, 10, 19, 0),
            is_demo=True,
            dedup_key="demo_ann_tcs_results_20241010",
        ),
        AlertEvent(
            alert_rule_id=ma_rule.id,
            company_id=ticker_to_id["ZOMATO"],
            triggered_at=datetime(2024, 10, 28, 10, 20),
            trigger_value="ann_zomato_paytm_ma",
            observed_value="'Zomato Ltd - Acquisition of Paytm's Movie & Events Ticketing Business' classified as 'M&A'",
            threshold_value="Subscribed categories: M&A",
            is_acknowledged=False,
            is_demo=True,
            dedup_key="demo_ann_zomato_ma_20241028",
        ),
    ]

    session.add_all(alert_events)
    await session.flush()
    summary["alert_events"] = len(alert_events)

    await session.commit()
    summary["status"] = "seeded"
    logger.info("Demo data seeding completed successfully: %s", summary)
    return summary
