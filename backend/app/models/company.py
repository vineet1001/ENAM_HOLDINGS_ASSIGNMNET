"""Company and PortfolioMembership ORM models."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.alert import AlertEvent, AlertRule
    from app.models.announcement import Announcement
    from app.models.document import ExtractedFact, SourceDocument
    from app.models.financial import FinancialPeriod, GuidanceStatement
    from app.models.price import PriceBar
    from app.models.research import ResearchSession


class Company(Base):
    """A publicly-traded company tracked by FINN."""

    __tablename__ = "companies"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    ticker: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    sector: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    industry: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    exchange: Mapped[str] = mapped_column(String(20), nullable=False, default="NSE")
    yahoo_symbol: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    market_cap_category: Mapped[Optional[str]] = mapped_column(
        String(10), nullable=True, comment="large | mid | small"
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        server_default=func.now(),
    )

    # ── relationships ──────────────────────────────────────────────────
    portfolio_memberships: Mapped[List["PortfolioMembership"]] = relationship(
        back_populates="company", cascade="all, delete-orphan"
    )
    price_bars: Mapped[List["PriceBar"]] = relationship(back_populates="company")
    announcements: Mapped[List["Announcement"]] = relationship(back_populates="company")
    alert_rules: Mapped[List["AlertRule"]] = relationship(back_populates="company")
    alert_events: Mapped[List["AlertEvent"]] = relationship(back_populates="company")
    financial_periods: Mapped[List["FinancialPeriod"]] = relationship(back_populates="company")
    guidance_statements: Mapped[List["GuidanceStatement"]] = relationship(back_populates="company")
    source_documents: Mapped[List["SourceDocument"]] = relationship(back_populates="company")
    extracted_facts: Mapped[List["ExtractedFact"]] = relationship(back_populates="company")
    research_sessions: Mapped[List["ResearchSession"]] = relationship(back_populates="company")

    __table_args__ = (
        Index("ix_companies_exchange", "exchange"),
        Index("ix_companies_sector", "sector"),
        Index("ix_companies_market_cap_category", "market_cap_category"),
    )

    def __repr__(self) -> str:
        return f"<Company(id={self.id}, ticker='{self.ticker}', name='{self.name}')>"


class PortfolioMembership(Base):
    """Maps a company into a named portfolio or watchlist."""

    __tablename__ = "portfolio_memberships"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    portfolio_name: Mapped[str] = mapped_column(
        String(100), nullable=False, default="default", index=True
    )
    added_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, server_default=func.now()
    )
    is_watchlist: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # ── relationships ──────────────────────────────────────────────────
    company: Mapped["Company"] = relationship(back_populates="portfolio_memberships")

    __table_args__ = (
        Index("ix_pm_company_portfolio", "company_id", "portfolio_name", unique=True),
        {"comment": "Tracks which companies belong to which portfolio/watchlist"},
    )

    def __repr__(self) -> str:
        return (
            f"<PortfolioMembership(id={self.id}, company_id={self.company_id}, "
            f"portfolio='{self.portfolio_name}', watchlist={self.is_watchlist})>"
        )
