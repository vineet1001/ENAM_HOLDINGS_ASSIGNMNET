"""User-built portfolios with chosen weights, kept apart from the seeded mock portfolio."""

from __future__ import annotations

from datetime import datetime
from typing import List

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.company import Company


class CustomPortfolio(Base):
    """A named portfolio. At most one is active; with none active the mock portfolio is used."""

    __tablename__ = "custom_portfolios"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
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

    holdings: Mapped[List["CustomPortfolioHolding"]] = relationship(
        back_populates="portfolio", cascade="all, delete-orphan"
    )


class CustomPortfolioHolding(Base):
    """One company in a custom portfolio, with its weight as a percentage."""

    __tablename__ = "custom_portfolio_holdings"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    portfolio_id: Mapped[int] = mapped_column(
        ForeignKey("custom_portfolios.id", ondelete="CASCADE"), nullable=False, index=True
    )
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    weight: Mapped[float] = mapped_column(Float, nullable=False)

    portfolio: Mapped["CustomPortfolio"] = relationship(back_populates="holdings")
    company: Mapped[Company] = relationship()

    __table_args__ = (
        Index("ix_custom_holding_unique", "portfolio_id", "company_id", unique=True),
    )
