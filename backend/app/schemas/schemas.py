"""Pydantic schemas for API request/response validation."""
from datetime import datetime, date
from typing import Optional
from pydantic import BaseModel, Field


# ─── Company ────────────────────────────────────────────────────────
class CompanyBase(BaseModel):
    ticker: str
    name: str
    sector: str | None = None
    industry: str | None = None
    exchange: str = "NSE"
    yahoo_symbol: str | None = None
    market_cap_category: str | None = None

class CompanyCreate(CompanyBase):
    pass

class CompanyResponse(CompanyBase):
    id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime | None = None
    in_portfolio: bool = False
    is_watchlist: bool = False
    latest_price: float | None = None
    daily_change_pct: float | None = None
    latest_price_date: str | None = None
    alert_count: int = 0
    latest_announcement: str | None = None

    class Config:
        from_attributes = True

class CompanySearchResult(BaseModel):
    ticker: str
    name: str
    sector: str | None = None
    exchange: str = "NSE"
    in_portfolio: bool = False


# ─── Portfolio ──────────────────────────────────────────────────────
class PortfolioAddRequest(BaseModel):
    ticker: str
    is_watchlist: bool = False

class PortfolioResponse(BaseModel):
    companies: list[CompanyResponse]
    total: int
    sectors: list[str]
    last_updated: datetime | None = None


# ─── Price ──────────────────────────────────────────────────────────
class PriceBarResponse(BaseModel):
    date: date
    open: float
    high: float
    low: float
    close: float
    adj_close: float | None = None
    volume: int
    source: str
    is_demo: bool
    daily_change_pct: float | None = None

    class Config:
        from_attributes = True

class PriceDataResponse(BaseModel):
    ticker: str
    prices: list[PriceBarResponse]
    latest: PriceBarResponse | None = None
    data_freshness: str
    is_stale: bool = False


# ─── Announcement ──────────────────────────────────────────────────
class AnnouncementResponse(BaseModel):
    id: int
    company_ticker: str = ""
    company_name: str = ""
    title: str
    description: str | None = None
    exchange: str | None = None
    category: str | None = None
    classification_confidence: float | None = None
    classification_method: str | None = None
    classification_explanation: str | None = None
    filing_date: datetime
    source_url: str | None = None
    document_url: str | None = None
    is_demo: bool
    status: str = "new"
    priority_score: float | None = None

    class Config:
        from_attributes = True

class AnnouncementListResponse(BaseModel):
    announcements: list[AnnouncementResponse]
    total: int
    filters_applied: dict = {}


# ─── Alert ──────────────────────────────────────────────────────────
class AlertRuleCreate(BaseModel):
    name: str
    rule_type: str = Field(..., pattern="^(price_movement|unusual_volume|material_announcement)$")
    company_id: int | None = None
    threshold_value: float | None = None
    threshold_direction: str | None = Field(None, pattern="^(above|below|both)$")
    volume_multiplier: float | None = None
    volume_lookback_days: int | None = None
    announcement_categories: list[str] | None = None
    is_enabled: bool = True

class AlertRuleUpdate(BaseModel):
    name: str | None = None
    threshold_value: float | None = None
    threshold_direction: str | None = None
    volume_multiplier: float | None = None
    volume_lookback_days: int | None = None
    announcement_categories: list[str] | None = None
    is_enabled: bool | None = None

class AlertRuleResponse(BaseModel):
    id: int
    name: str
    rule_type: str
    company_id: int | None = None
    company_ticker: str | None = None
    threshold_value: float | None = None
    threshold_direction: str | None = None
    volume_multiplier: float | None = None
    volume_lookback_days: int | None = None
    announcement_categories: list[str] | None = None
    is_enabled: bool
    created_at: datetime
    updated_at: datetime | None = None

    class Config:
        from_attributes = True

class AlertEventResponse(BaseModel):
    id: int
    alert_rule_id: int
    rule_name: str = ""
    rule_type: str = ""
    company_id: int
    company_ticker: str = ""
    company_name: str = ""
    triggered_at: datetime
    trigger_value: str
    observed_value: str
    threshold_value: str
    is_acknowledged: bool
    acknowledged_at: datetime | None = None
    is_demo: bool

    class Config:
        from_attributes = True


# ─── Financial ─────────────────────────────────────────────────────
class FinancialMetricResponse(BaseModel):
    metric_name: str
    value: float | None
    unit: str = "crores"
    currency: str = "INR"
    is_directly_reported: bool = True
    derivation_notes: str | None = None
    confidence: float = 1.0
    is_demo: bool = False

class QuarterlyComparisonRow(BaseModel):
    metric: str
    current_quarter: float | None
    previous_quarter: float | None
    year_ago_quarter: float | None
    qoq_change: float | None = None
    qoq_pct: float | None = None
    yoy_change: float | None = None
    yoy_pct: float | None = None
    unit: str = "₹ Crores"

class QuarterlyComparisonResponse(BaseModel):
    company_ticker: str
    company_name: str
    current_period: str
    previous_period: str
    year_ago_period: str
    reporting_basis: str = "consolidated"
    metrics: list[QuarterlyComparisonRow]
    ebitda_margin_current: float | None = None
    ebitda_margin_previous: float | None = None
    ebitda_margin_yago: float | None = None
    source: str | None = None
    is_demo: bool = False
    extraction_confidence: float = 1.0


# ─── Digest ────────────────────────────────────────────────────────
class DigestRequest(BaseModel):
    hours: int = 24
    start_time: datetime | None = None
    end_time: datetime | None = None

class DigestItemResponse(BaseModel):
    announcement: AnnouncementResponse
    priority_score: float
    priority_explanation: str
    summary: str | None = None
    is_routine: bool = False

class DigestResponse(BaseModel):
    period_start: datetime
    period_end: datetime
    total_announcements: int
    important_items: list[DigestItemResponse]
    routine_items: list[DigestItemResponse]
    companies_covered: int
    categories_found: list[str]
    generated_at: datetime
    is_demo: bool = False


# ─── Document ──────────────────────────────────────────────────────
class SourceDocumentResponse(BaseModel):
    id: int
    company_ticker: str = ""
    document_type: str
    title: str
    financial_period: str | None = None
    publication_date: date | None = None
    source_url: str | None = None
    status: str
    page_count: int | None = None
    ingested_at: datetime | None = None
    processed_at: datetime | None = None
    is_demo: bool
    chunk_count: int = 0

    class Config:
        from_attributes = True


# ─── Research ──────────────────────────────────────────────────────
class ResearchRequest(BaseModel):
    query: str | None = None
    research_type: str = "custom"
    document_ids: list[int] | None = None

class ResearchResponse(BaseModel):
    session_id: int
    company_ticker: str
    research_type: str
    status: str
    summary: str | None = None
    key_observations: list[str] = []
    data: dict = {}
    risks_caveats: list[str] = []
    missing_info: list[str] = []
    citations: list[dict] = []
    created_at: datetime
    completed_at: datetime | None = None


# ─── Guidance ──────────────────────────────────────────────────────
class GuidanceStatementResponse(BaseModel):
    id: int
    company_ticker: str = ""
    statement_date: date | None = None
    statement_text: str
    metric_name: str | None = None
    target_value_low: float | None = None
    target_value_high: float | None = None
    target_unit: str | None = None
    target_period: str | None = None
    is_quantitative: bool = False
    status: str = "current"
    actual_value: float | None = None
    variance_pct: float | None = None
    assessment_notes: str | None = None

    class Config:
        from_attributes = True


# ─── Health ────────────────────────────────────────────────────────
class HealthResponse(BaseModel):
    status: str = "ok"
    version: str = "1.0.0"
    demo_mode: bool
    llm_configured: bool
    database: str = "connected"
    timestamp: datetime


# ─── Metrics Summary ──────────────────────────────────────────────
class MetricsSummaryResponse(BaseModel):
    total_companies: int
    portfolio_companies: int
    total_price_bars: int
    total_announcements: int
    total_alert_rules: int
    total_alert_events: int
    total_documents: int
    demo_mode: bool

