"""SourceDocument, DocumentChunk, ExtractedFact, and Citation ORM models."""

from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING, List, Optional

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


class SourceDocument(Base):
    """A document ingested by FINN (annual report, concall transcript, etc.)."""

    __tablename__ = "source_documents"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    document_type: Mapped[str] = mapped_column(
        String(50), nullable=False, index=True,
        comment="annual_report | quarterly_results | concall_transcript | investor_presentation | exchange_filing",
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    financial_period: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    publication_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    source_url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    local_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    file_hash: Mapped[Optional[str]] = mapped_column(
        String(128), nullable=True, unique=True, comment="SHA-256 of file content"
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="discovered",
        comment="discovered | downloading | downloaded | processing | processed | failed",
    )
    page_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    ingested_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, server_default=func.now()
    )
    processed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # ── relationships ──────────────────────────────────────────────────
    company: Mapped["Company"] = relationship(back_populates="source_documents")
    chunks: Mapped[List["DocumentChunk"]] = relationship(
        back_populates="source_document", cascade="all, delete-orphan"
    )
    extracted_facts: Mapped[List["ExtractedFact"]] = relationship(
        back_populates="source_document", cascade="all, delete-orphan"
    )
    citations: Mapped[List["Citation"]] = relationship(
        back_populates="source_document", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_sd_company_type", "company_id", "document_type"),
        Index("ix_sd_status", "status"),
    )

    def __repr__(self) -> str:
        return (
            f"<SourceDocument(id={self.id}, company_id={self.company_id}, "
            f"type='{self.document_type}', status='{self.status}')>"
        )


class DocumentChunk(Base):
    """A text/table chunk within a source document, optionally with an embedding."""

    __tablename__ = "document_chunks"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    source_document_id: Mapped[int] = mapped_column(
        ForeignKey("source_documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    section_heading: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    page_number: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    chunk_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default="text",
        comment="text | table | heading",
    )
    embedding: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="JSON array of floats"
    )
    metadata_json: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="Arbitrary JSON metadata"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, server_default=func.now()
    )

    # ── relationships ──────────────────────────────────────────────────
    source_document: Mapped["SourceDocument"] = relationship(back_populates="chunks")

    __table_args__ = (
        Index("ix_dc_doc_index", "source_document_id", "chunk_index", unique=True),
    )

    def __repr__(self) -> str:
        return (
            f"<DocumentChunk(id={self.id}, doc_id={self.source_document_id}, "
            f"idx={self.chunk_index}, type='{self.chunk_type}')>"
        )


class ExtractedFact(Base):
    """A structured fact extracted from a source document."""

    __tablename__ = "extracted_facts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    source_document_id: Mapped[int] = mapped_column(
        ForeignKey("source_documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    fact_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    fact_key: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    fact_value: Mapped[str] = mapped_column(Text, nullable=False)
    unit: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    period: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    page_number: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    extraction_method: Mapped[str] = mapped_column(
        String(30), nullable=False, comment="e.g. regex, llm, table_parse"
    )
    supporting_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, server_default=func.now()
    )

    # ── relationships ──────────────────────────────────────────────────
    source_document: Mapped["SourceDocument"] = relationship(back_populates="extracted_facts")
    company: Mapped["Company"] = relationship(back_populates="extracted_facts")

    __table_args__ = (
        Index("ix_ef_company_fact", "company_id", "fact_type", "fact_key"),
    )

    def __repr__(self) -> str:
        return (
            f"<ExtractedFact(id={self.id}, company_id={self.company_id}, "
            f"{self.fact_type}/{self.fact_key}={self.fact_value[:30]})>"
        )


class Citation(Base):
    """A citation linking a claim to a source document excerpt."""

    __tablename__ = "citations"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    claim_text: Mapped[str] = mapped_column(Text, nullable=False)
    source_document_id: Mapped[int] = mapped_column(
        ForeignKey("source_documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    page_number: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    section_heading: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    supporting_excerpt: Mapped[str] = mapped_column(Text, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, server_default=func.now()
    )

    # ── relationships ──────────────────────────────────────────────────
    source_document: Mapped["SourceDocument"] = relationship(back_populates="citations")

    def __repr__(self) -> str:
        return (
            f"<Citation(id={self.id}, doc_id={self.source_document_id}, "
            f"claim='{self.claim_text[:40]}…')>"
        )
