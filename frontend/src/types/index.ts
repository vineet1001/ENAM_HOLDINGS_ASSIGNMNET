export interface Company {
  id: number;
  ticker: string;
  name: string;
  sector: string | null;
  industry: string | null;
  exchange: string;
  yahoo_symbol: string | null;
  market_cap_category: string | null;
  is_active: boolean;
  in_portfolio: boolean;
  is_watchlist: boolean;
  latest_price: number | null;
  daily_change_pct: number | null;
  latest_price_date: string | null;
  alert_count: number;
  latest_announcement: string | null;
}

export interface PortfolioResponse {
  companies: Company[];
  total: number;
  sectors: string[];
  last_updated: string | null;
}

export interface PriceBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adj_close: number | null;
  volume: number;
  source: string;
  is_demo: boolean;
  daily_change_pct: number | null;
}

export interface PriceDataResponse {
  ticker: string;
  prices: PriceBar[];
  latest: PriceBar | null;
  data_freshness: string;
  is_stale: boolean;
}

export interface Announcement {
  id: number;
  company_ticker: string;
  company_name: string;
  title: string;
  description: string | null;
  exchange: string | null;
  category: string | null;
  classification_confidence: number | null;
  classification_method: string | null;
  classification_explanation: string | null;
  filing_date: string;
  source_url: string | null;
  document_url: string | null;
  is_demo: boolean;
  status: 'new' | 'read' | 'saved' | 'dismissed';
  priority_score: number | null;
}

export interface DigestItem {
  announcement: Announcement;
  priority_score: number;
  priority_explanation: string;
  summary: string | null;
  is_routine: boolean;
}

export interface DigestResponse {
  period_start: string;
  period_end: string;
  total_announcements: number;
  important_items: DigestItem[];
  routine_items: DigestItem[];
  companies_covered: number;
  categories_found: string[];
  generated_at: string;
  is_demo: boolean;
}

export interface AlertRule {
  id: number;
  name: string;
  rule_type: 'price_movement' | 'unusual_volume' | 'material_announcement';
  company_id: number | null;
  company_ticker: string | null;
  threshold_value: number | null;
  threshold_direction: 'above' | 'below' | 'both' | null;
  volume_multiplier: number | null;
  volume_lookback_days: number | null;
  announcement_categories: string[] | null;
  is_enabled: boolean;
  created_at: string;
}

export interface AlertEvent {
  id: number;
  alert_rule_id: number;
  rule_name: string;
  rule_type: string;
  company_id: number;
  company_ticker: string;
  company_name: string;
  triggered_at: string;
  trigger_value: string;
  observed_value: string;
  threshold_value: string;
  is_acknowledged: boolean;
  acknowledged_at: string | null;
  is_demo: boolean;
}

export interface QuarterlyComparisonRow {
  metric: string;
  current_quarter: number | null;
  previous_quarter: number | null;
  year_ago_quarter: number | null;
  qoq_change: number | null;
  qoq_pct: number | null;
  yoy_change: number | null;
  yoy_pct: number | null;
  unit: string;
}

export interface QuarterlyComparisonResponse {
  company_ticker: string;
  company_name: string;
  current_period: string;
  previous_period: string;
  year_ago_period: string;
  reporting_basis: string;
  metrics: QuarterlyComparisonRow[];
  ebitda_margin_current: number | null;
  ebitda_margin_previous: number | null;
  ebitda_margin_yago: number | null;
  source: string | null;
  is_demo: boolean;
  extraction_confidence: number;
}

export interface ResearchCitation {
  source: string;
  type: string;
  period?: string;
  url?: string;
  is_demo?: boolean;
}

export interface ResearchResponse {
  session_id: number;
  company_ticker: string;
  research_type: string;
  status: string;
  summary: string | null;
  key_observations: string[];
  data: Record<string, any>;
  risks_caveats: string[];
  missing_info: string[];
  citations: ResearchCitation[];
  created_at: string;
  completed_at: string | null;
}

export interface SourceDocument {
  id: number;
  company_ticker: string;
  document_type: string;
  title: string;
  financial_period: string | null;
  publication_date: string | null;
  source_url: string | null;
  status: string;
  page_count: number | null;
  ingested_at: string | null;
  processed_at: string | null;
  is_demo: boolean;
  chunk_count: number;
}

export interface ExecutiveProfile {
  person_name: string;
  role: string;
  effective_date: string;
  previous_role: string;
  career_history: Array<{ role: string; organization: string; period: string }>;
  education: string;
  verification_status: 'verified' | 'unverified';
  source_url: string;
  source_type: string;
  notes: string;
}

export interface ManagementChangeEnrichment {
  announcement_id: number;
  company_ticker: string;
  company_name: string;
  filing_title: string;
  filing_date: string;
  profile: ExecutiveProfile;
}

export interface SystemHealth {
  status: string;
  version: string;
  demo_mode: boolean;
  llm_configured: boolean;
  database: string;
  timestamp: string;
}

