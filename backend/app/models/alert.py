"""AlertRule and AlertEvent ORM models."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import (
    Boolean,
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
    from app.models.announcement import Announcement
    from app.models.company import Company
    from app.models.price import PriceBar


class AlertRule(Base):
    """A user-defined alert rule (price move, volume spike, material filing)."""

    __tablename__ = "alert_rules"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    rule_type: Mapped[str] = mapped_column(
        String(50), nullable=False, index=True,
        comment="price_movement | unusual_volume | material_announcement",
    )
    company_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
        comment="NULL means rule applies to all companies",
    )
    # -- price_movement parameters --
    threshold_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    threshold_direction: Mapped[Optional[str]] = mapped_column(
        String(10), nullable=True, comment="above | below | both"
    )
    # -- unusual_volume parameters --
    volume_multiplier: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    volume_lookback_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # -- material_announcement parameters --
    announcement_categories: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="JSON list of category strings"
    )
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
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
    company: Mapped[Optional["Company"]] = relationship(back_populates="alert_rules")
    events: Mapped[list["AlertEvent"]] = relationship(
        back_populates="alert_rule", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return (
            f"<AlertRule(id={self.id}, name='{self.name}', "
            f"type='{self.rule_type}', enabled={self.is_enabled})>"
        )


class AlertEvent(Base):
    """A single firing of an alert rule."""

    __tablename__ = "alert_events"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    alert_rule_id: Mapped[int] = mapped_column(
        ForeignKey("alert_rules.id", ondelete="CASCADE"), nullable=False, index=True
    )
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    triggered_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, server_default=func.now()
    )
    trigger_value: Mapped[str] = mapped_column(
        String(500), nullable=False, comment="Human-readable description of what triggered"
    )
    observed_value: Mapped[str] = mapped_column(String(200), nullable=False)
    threshold_value: Mapped[str] = mapped_column(String(200), nullable=False)
    is_acknowledged: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    acknowledged_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    related_announcement_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("announcements.id", ondelete="SET NULL"), nullable=True
    )
    related_price_bar_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("price_bars.id", ondelete="SET NULL"), nullable=True
    )
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    dedup_key: Mapped[str] = mapped_column(
        String(255), nullable=False, unique=True,
        comment="Deterministic key to prevent duplicate alerts",
    )

    # ── relationships ──────────────────────────────────────────────────
    alert_rule: Mapped["AlertRule"] = relationship(back_populates="events")
    company: Mapped["Company"] = relationship(back_populates="alert_events")
    related_announcement: Mapped[Optional["Announcement"]] = relationship(foreign_keys=[related_announcement_id])
    related_price_bar: Mapped[Optional["PriceBar"]] = relationship(foreign_keys=[related_price_bar_id])

    __table_args__ = (
        Index("ix_alert_events_triggered_at", "triggered_at"),
        Index("ix_alert_events_ack", "is_acknowledged"),
    )

    def __repr__(self) -> str:
        return (
            f"<AlertEvent(id={self.id}, rule_id={self.alert_rule_id}, "
            f"company_id={self.company_id}, ack={self.is_acknowledged})>"
        )
