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
  insight?: FilingInsight | null;
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

export interface FilingSummaryData {
  overview: string;
  overview_verified: boolean;
  key_points: Array<{ text: string; page: number | null; verified: boolean }>;
  figures: Array<{ label: string; value: string; period: string; page: number | null }>;
  unverified_count: number;
}

export interface OptimiseStats {
  return_pct: number;
  risk_pct: number;
  sharpe: number | null;
}

export interface OptimiseResult {
  objective: string;
  tickers: string[];
  sessions: number;
  start: string;
  end: string;
  cap_pct: number;
  risk_free_pct: number;
  suggested: OptimiseStats & { weights: Record<string, number> };
  current?: OptimiseStats;
  equal: OptimiseStats;
  frontier: Array<{ risk_pct: number; return_pct: number }>;
  stocks: Array<{ ticker: string; return_pct: number; risk_pct: number }>;
  left_out: Array<{ ticker: string; reason: string }>;
}

export interface FilingResultRow {
  metric: string;
  current: number;
  previous: number | null;
  year_ago: number | null;
  qoq_pct: number | null;
  yoy_pct: number | null;
  page: number | null;
  calculated: boolean;
  printed_together?: boolean | null;
}

export interface FilingResults {
  periods: { current: string; previous: string; year_ago: string };
  unit: string;
  basis: string;
  rows: FilingResultRow[];
}

export interface FilingPerson {
  person: string;
  role: string;
  change: string;
  effective_date: string;
  background: string;
  previous_roles: string[];
  education: string;
  page: number | null;
  linkedin_search: string;
}

export interface FilingInsight {
  status: 'pending' | 'done' | 'unreadable' | 'withheld' | 'failed';
  results?: FilingResults;
  people?: FilingPerson[];
  headline: string | null;
  note: string | null;
  summary: FilingSummaryData | null;
  model: string | null;
  pages_total: number | null;
  pages_read: number | null;
}

export interface AiProviderSetting {
  id: string;
  name: string;
  key_url: string;
  note: string;
  default_model: string;
  model: string;
  default_strong_model: string;
  strong_model: string;
  has_key: boolean;
  key_hint: string | null;
  is_active: boolean;
}

export interface AiSettings {
  active_provider: string;
  providers: AiProviderSetting[];
  can_edit: boolean;
  needs_token: boolean;
}

export interface AiStatus {
  configured: boolean;
  provider: string;
  model: string;
  paused_seconds: number;
  last_error: string | null;
  filings_waiting: number;
  last_sync: { at: string; filings_added: number; alerts_triggered: number; errors: string[] } | null;
}

export interface AlertSourceSite {
  name: string;
  url: string;
  category: string;
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
  related_announcement_id?: number | null;
  related_announcement_category?: string | null;
  source_url?: string | null;
  source_sites?: AlertSourceSite[];
  filing_title?: string | null;
  insight?: FilingInsight | null;
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
  pages?: number | null;
  is_demo?: boolean;
}

export interface DocumentState {
  state: 'preparing' | 'ready' | 'failed' | 'none';
  ready: number;
  failed: number;
  total: number;
  annual_reports: number;
  transcripts: number;
  presentations?: number;
}

export interface DocumentSourceRef {
  title: string;
  type?: string;
  period?: string | null;
  page?: number | null;
  url?: string | null;
}

export interface CheckedText {
  text: string;
  numbers_matched: boolean;
  unmatched: string[];
}

export interface ResearchPoint extends CheckedText {
  source?: DocumentSourceRef | null;
}

export interface GuidanceItem {
  id?: string;
  metric: string;
  statement: string;
  target: string;
  target_period: string;
  speaker: string;
  call: string;
  document: string;
  kind?: 'call' | 'presentation';
  quote: string;
  page: number;
  url: string | null;
}

export interface NarrativeItem {
  promise: GuidanceItem;
  verdict: string;
  delivered: CheckedText;
  reasoning: CheckedText;
  source: DocumentSourceRef | null;
  from_numbers: boolean;
}

export interface PortfolioDocument {
  id: number;
  document_type: string;
  title: string;
  financial_period: string | null;
  source_url: string | null;
  status: string;
  page_count: number | null;
  error_message: string | null;
}

export interface PortfolioDocuments {
  portfolio: string;
  companies: Array<{ ticker: string; name: string; state: DocumentState; documents: PortfolioDocument[] }>;
}

export interface DocumentSearchResult extends DocumentSourceRef {
  document_id: number;
  text: string;
}

export interface SummaryItem {
  text: string;
  page: number | null;
  url: string | null;
  verified?: boolean;
  unmatched?: string[];
}

export interface SummaryFigure {
  label: string;
  value: string;
  period: string;
  page: number | null;
  url: string | null;
}

export interface DocumentSummaryContent {
  mode: 'ai' | 'extract';
  // Without a key: the document's own sentences.
  sentences?: SummaryItem[];
  // With a key.
  headline?: string;
  overview?: string;
  overview_verified?: boolean;
  key_points?: SummaryItem[];
  figures?: SummaryFigure[];
  figures_dropped?: number;
  risks?: SummaryItem[];
  sections?: { first_page: number; last_page: number; summary: string; points: SummaryItem[]; url: string | null }[];
  pages_read?: number;
  calls?: number;
  model?: string;
}

export interface DocumentSummaryState {
  document_id: number;
  ai_configured: boolean;
  parts: number;
  pages_available: number;
  page_count: number | null;
  calls_needed: number;
  status: 'none' | 'running' | 'done' | 'failed' | 'unreadable';
  progress: { done: number; total: number } | null;
  summary: DocumentSummaryContent | null;
  error: string | null;
}

export interface StockOverride {
  ticker: string;
  name: string;
  price_threshold: number | null;
  volume_multiple: number | null;
}

export interface AlertPreferences {
  price_enabled: boolean;
  price_threshold: number;
  price_direction: 'both' | 'above' | 'below';
  volume_enabled: boolean;
  volume_multiple: number;
  volume_lookback: number;
  categories: string[];
  overrides: StockOverride[];
  other_rules: string[];
  alert_lookback_days: number;
  sync_minutes: number;
  digest_default_hours: number;
  digest_focus_categories: string[];
  move_watch_percent: number;
  all_categories: string[];
  digest_windows: number[];
  limits: Record<'price_threshold' | 'volume_multiple' | 'volume_lookback' | 'alert_lookback_days' | 'sync_minutes' | 'move_watch_percent', [number, number]>;
  can_edit_notifications: boolean;
  ai_enabled: boolean;
}

export interface AlertPreviewCompany {
  ticker: string;
  name: string;
  changes: number[];
  volume_multiples: number[];
}

export interface NotificationStatus {
  configured: boolean;
  token_hint: string | null;
  chat_id: string | null;
  last_error: string | null;
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

export type LiveRange = '1M' | '3M' | '6M' | '1Y';

export interface LiveCompany {
  ticker: string;
  name: string;
  sector: string | null;
  symbol: string;
  exchange: string;
  weight: number | null;
  spark: number[];
  has_data: boolean;
  latest_close: number | null;
  daily_change_pct: number | null;
  range_change_pct: number | null;
  latest_date: string | null;
}

export interface LivePortfolioHistory {
  portfolio: { id: number | null; name: string; is_custom: boolean };
  view: 'portfolio' | 'company';
  ticker: string | null;
  name: string;
  range: LiveRange;
  unit: 'INDEX' | 'INR';
  points: Array<{ date: string; value: number }>;
  start_value: number;
  latest_value: number;
  change_pct: number | null;
  as_of: string;
  companies: LiveCompany[];
  unavailable: string[];
  method: string;
  source: string;
  fetched_at: string;
  is_stale: boolean;
}

export interface CustomPortfolioHolding {
  ticker: string;
  name: string;
  exchange: string;
  weight: number;
}

export interface CustomPortfolio {
  id: number;
  name: string;
  is_active: boolean;
  holdings: CustomPortfolioHolding[];
}

export interface PortfoliosResponse {
  portfolios: CustomPortfolio[];
  active_id: number | null;
  mock_holdings: number;
}

export interface ListedCompany {
  ticker: string;
  name: string;
  exchanges: string[];
  nse_symbol: string | null;
  bse_code: string | null;
}

export interface LiveFiling {
  id: number;
  ticker: string;
  symbol: string;
  exchange: string;
  company_name: string;
  title: string;
  nse_category: string;
  category: string;
  confidence: number;
  priority_score: number;
  filed_at: string;
  pdf_url: string | null;
  file_size: string | null;
  announcement_id: number | null;
  insight: FilingInsight | null;
}

export interface LiveFilingsResponse {
  filings: LiveFiling[];
  failed: string[];
  lookback_days: number;
  source: string;
  fetched_at: string;
  is_stale: boolean;
}

export interface SystemHealth {
  status: string;
  version: string;
  demo_mode: boolean;
  llm_configured: boolean;
  database: string;
  timestamp: string;
}

