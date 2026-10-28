"""FinancialPeriod, FinancialMetric, and GuidanceStatement ORM models."""

from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.company import Company
    from app.models.document import SourceDocument


class FinancialPeriod(Base):
    """A fiscal reporting period (quarter or year) for a company."""

    __tablename__ = "financial_periods"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    period_type: Mapped[str] = mapped_column(
        String(20), nullable=False, comment="quarterly | annual"
    )
    fiscal_year: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    fiscal_quarter: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    reporting_basis: Mapped[str] = mapped_column(
        String(20), nullable=False, default="consolidated",
        comment="consolidated | standalone",
    )
    source_document_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("source_documents.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, server_default=func.now()
    )

    # ── relationships ──────────────────────────────────────────────────
    company: Mapped["Company"] = relationship(back_populates="financial_periods")
    source_document: Mapped[Optional["SourceDocument"]] = relationship(
        foreign_keys=[source_document_id]
    )
    metrics: Mapped[list["FinancialMetric"]] = relationship(
        back_populates="financial_period", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_fp_company_year_quarter", "company_id", "fiscal_year", "fiscal_quarter"),
        Index("ix_fp_period_type", "period_type"),
    )

    def __repr__(self) -> str:
        q = f"Q{self.fiscal_quarter}" if self.fiscal_quarter else "FY"
        return (
            f"<FinancialPeriod(id={self.id}, company_id={self.company_id}, "
            f"{q} {self.fiscal_year}, basis={self.reporting_basis})>"
        )


class FinancialMetric(Base):
    """A single financial metric extracted from a reporting period."""

    __tablename__ = "financial_metrics"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    financial_period_id: Mapped[int] = mapped_column(
        ForeignKey("financial_periods.id", ondelete="CASCADE"), nullable=False, index=True
    )
    metric_name: Mapped[str] = mapped_column(
        String(50), nullable=False, index=True,
        comment="revenue | ebitda | pbt | pat | total_debt | cash | operating_cashflow | capex | equity",
    )
    value: Mapped[float] = mapped_column(Float, nullable=False)
    unit: Mapped[str] = mapped_column(String(20), nullable=False, default="crores")
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="INR")
    is_directly_reported: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    derivation_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    source_page: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # ── relationships ──────────────────────────────────────────────────
    financial_period: Mapped["FinancialPeriod"] = relationship(back_populates="metrics")

    __table_args__ = (
        Index("ix_fm_period_metric", "financial_period_id", "metric_name"),
    )

    def __repr__(self) -> str:
        return (
            f"<FinancialMetric(id={self.id}, period_id={self.financial_period_id}, "
            f"{self.metric_name}={self.value} {self.unit})>"
        )


class GuidanceStatement(Base):
    """A forward-looking management guidance or target extracted from filings."""

    __tablename__ = "guidance_statements"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    source_document_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("source_documents.id", ondelete="SET NULL"), nullable=True
    )
    statement_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    statement_text: Mapped[str] = mapped_column(Text, nullable=False)
    metric_name: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    target_value_low: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    target_value_high: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    target_unit: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    target_period: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    is_quantitative: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="current",
        comment="current | achieved | missed | superseded | not_assessable",
    )
    actual_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    actual_period_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("financial_periods.id", ondelete="SET NULL"), nullable=True
    )
    variance_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    assessment_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, server_default=func.now()
    )

    # ── relationships ──────────────────────────────────────────────────
    company: Mapped["Company"] = relationship(back_populates="guidance_statements")
    source_document: Mapped[Optional["SourceDocument"]] = relationship(
        foreign_keys=[source_document_id]
    )
    actual_period: Mapped[Optional["FinancialPeriod"]] = relationship(
        foreign_keys=[actual_period_id]
    )

    __table_args__ = (
        Index("ix_guidance_company_status", "company_id", "status"),
    )

    def __repr__(self) -> str:
        return (
            f"<GuidanceStatement(id={self.id}, company_id={self.company_id}, "
            f"metric={self.metric_name}, status='{self.status}')>"
        )
