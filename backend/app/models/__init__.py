"""FINN ORM models – import everything so Alembic / init_db can discover tables."""

from app.models.company import Company, PortfolioMembership  # noqa: F401
from app.models.custom_portfolio import CustomPortfolio, CustomPortfolioHolding  # noqa: F401
from app.models.filing_insight import FilingInsight  # noqa: F401
from app.models.research_insight import AppSetting, FilingExtraction, ResearchInsight  # noqa: F401
from app.models.price import PriceBar  # noqa: F401
from app.models.announcement import Announcement, AnnouncementClassification  # noqa: F401
from app.models.alert import AlertRule, AlertEvent  # noqa: F401
from app.models.financial import FinancialPeriod, FinancialMetric, GuidanceStatement  # noqa: F401
from app.models.document import SourceDocument, DocumentChunk, ExtractedFact, Citation  # noqa: F401
from app.models.research import ResearchSession, ResearchAnswer  # noqa: F401

__all__ = [
    "Company",
    "PortfolioMembership",
    "PriceBar",
    "Announcement",
    "AnnouncementClassification",
    "AlertRule",
    "AlertEvent",
    "FinancialPeriod",
    "FinancialMetric",
    "GuidanceStatement",
    "SourceDocument",
    "DocumentChunk",
    "ExtractedFact",
    "Citation",
    "ResearchSession",
    "ResearchAnswer",
]
