"""What the model read from a filing's document. Saved so each document is only read once."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class FilingInsight(Base):
    """Keyed by document URL, because exchanges often list one PDF under several filings."""

    __tablename__ = "filing_insights"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    pdf_url: Mapped[str] = mapped_column(String(1000), unique=True, nullable=False, index=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending",
        comment="pending | done | unreadable | withheld | failed",
    )
    headline: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    summary_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    model: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    pages_total: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    pages_read: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow,
        onupdate=datetime.utcnow, server_default=func.now(),
    )
