"""PriceBar ORM model – end-of-day market data."""

from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.company import Company


class PriceBar(Base):
    """One end-of-day OHLCV bar for a company."""

    __tablename__ = "price_bars"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    open: Mapped[float] = mapped_column(Float, nullable=False)
    high: Mapped[float] = mapped_column(Float, nullable=False)
    low: Mapped[float] = mapped_column(Float, nullable=False)
    close: Mapped[float] = mapped_column(Float, nullable=False)
    adj_close: Mapped[float] = mapped_column(Float, nullable=False)
    volume: Mapped[int] = mapped_column(BigInteger, nullable=False)
    source: Mapped[str] = mapped_column(String(50), nullable=False, default="yahoo")
    retrieved_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, server_default=func.now()
    )
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # ── relationships ──────────────────────────────────────────────────
    company: Mapped["Company"] = relationship(back_populates="price_bars")

    __table_args__ = (
        UniqueConstraint("company_id", "date", "source", name="uq_pricebar_company_date_source"),
        Index("ix_price_bars_company_date", "company_id", "date"),
    )

    def __repr__(self) -> str:
        return (
            f"<PriceBar(id={self.id}, company_id={self.company_id}, "
            f"date={self.date}, close={self.close})>"
        )
