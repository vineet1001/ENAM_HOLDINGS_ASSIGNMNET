"""Announcement and AnnouncementClassification ORM models."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.company import Company


class Announcement(Base):
    """A corporate filing or exchange announcement for a company."""

    __tablename__ = "announcements"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    exchange: Mapped[str] = mapped_column(String(20), nullable=False, default="NSE")
    category: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    filing_date: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    source_url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    document_url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    ingested_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, server_default=func.now()
    )
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="new",
        comment="new | read | saved | dismissed",
    )
    priority_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # ── relationships ──────────────────────────────────────────────────
    company: Mapped["Company"] = relationship(back_populates="announcements")
    classification: Mapped[Optional["AnnouncementClassification"]] = relationship(
        back_populates="announcement", uselist=False, cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint(
            "company_id", "title", "filing_date",
            name="uq_announcement_company_title_date",
        ),
        Index("ix_announcements_status", "status"),
        Index("ix_announcements_company_filing", "company_id", "filing_date"),
    )

    def __repr__(self) -> str:
        return (
            f"<Announcement(id={self.id}, company_id={self.company_id}, "
            f"title='{self.title[:40]}…', filing_date={self.filing_date})>"
        )


class AnnouncementClassification(Base):
    """LLM/keyword classification of an announcement into one of 17 categories."""

    __tablename__ = "announcement_classifications"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    announcement_id: Mapped[int] = mapped_column(
        ForeignKey("announcements.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    category: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    explanation: Mapped[str] = mapped_column(Text, nullable=False)
    evidence_snippet: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    method: Mapped[str] = mapped_column(
        String(20), nullable=False, comment="keyword | llm | hybrid"
    )
    classified_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, server_default=func.now()
    )

    # ── relationships ──────────────────────────────────────────────────
    announcement: Mapped["Announcement"] = relationship(back_populates="classification")

    def __repr__(self) -> str:
        return (
            f"<AnnouncementClassification(id={self.id}, "
            f"announcement_id={self.announcement_id}, category='{self.category}')>"
        )
