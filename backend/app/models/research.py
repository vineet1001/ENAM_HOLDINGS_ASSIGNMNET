"""ResearchSession and ResearchAnswer ORM models."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.company import Company


class ResearchSession(Base):
    """A research query session initiated by the user or a scheduled task."""

    __tablename__ = "research_sessions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    query: Mapped[str] = mapped_column(Text, nullable=False)
    research_type: Mapped[str] = mapped_column(
        String(50), nullable=False, index=True,
        comment=(
            "business_snapshot | financial_snapshot | trajectory | balance_sheet | "
            "cash_quality | narrative_vs_numbers | guidance | bull_bear | custom"
        ),
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending",
        comment="pending | processing | completed | failed",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, server_default=func.now()
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # ── relationships ──────────────────────────────────────────────────
    company: Mapped["Company"] = relationship(back_populates="research_sessions")
    answer: Mapped[Optional["ResearchAnswer"]] = relationship(
        back_populates="research_session", uselist=False, cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_rs_company_type", "company_id", "research_type"),
        Index("ix_rs_status", "status"),
    )

    def __repr__(self) -> str:
        return (
            f"<ResearchSession(id={self.id}, company_id={self.company_id}, "
            f"type='{self.research_type}', status='{self.status}')>"
        )


class ResearchAnswer(Base):
    """The structured answer produced by a research session."""

    __tablename__ = "research_answers"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    research_session_id: Mapped[int] = mapped_column(
        ForeignKey("research_sessions.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    answer_json: Mapped[str] = mapped_column(Text, nullable=False, comment="Full JSON response")
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    key_observations: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    risks_caveats: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    missing_info: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, server_default=func.now()
    )

    # ── relationships ──────────────────────────────────────────────────
    research_session: Mapped["ResearchSession"] = relationship(back_populates="answer")

    def __repr__(self) -> str:
        return (
            f"<ResearchAnswer(id={self.id}, session_id={self.research_session_id})>"
        )
