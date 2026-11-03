"""Saved model output, so a question about the same documents is only ever paid for once."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ResearchInsight(Base):
    """One saved analysis. The signature changes when the underlying documents or numbers do."""

    __tablename__ = "research_insights"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    view: Mapped[str] = mapped_column(String(50), nullable=False)
    query_key: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    signature: Mapped[str] = mapped_column(String(300), nullable=False)
    answer_json: Mapped[str] = mapped_column(Text, nullable=False)
    model: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, server_default=func.now()
    )

    __table_args__ = (
        Index("ix_research_insight_key", "company_id", "view", "query_key", "signature", unique=True),
    )


class FilingExtraction(Base):
    """Structured facts read from one filing, such as results numbers or an executive's background."""

    __tablename__ = "filing_extractions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    pdf_url: Mapped[str] = mapped_column(String(1000), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(30), nullable=False)
    answer_json: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, server_default=func.now()
    )

    __table_args__ = (Index("ix_filing_extraction_key", "pdf_url", "kind", unique=True),)


class AppSetting(Base):
    """A small key-value store for user preferences such as alert settings."""

    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value_json: Mapped[str] = mapped_column(Text, nullable=False)
