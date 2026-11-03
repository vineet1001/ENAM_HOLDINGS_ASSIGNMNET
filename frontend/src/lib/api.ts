import {
  PortfolioResponse,
  Company,
  PriceDataResponse,
  Announcement,
  DigestResponse,
  AlertRule,
  AlertEvent,
  QuarterlyComparisonResponse,
  ResearchResponse,
  SourceDocument,
  ManagementChangeEnrichment,
  SystemHealth,
  LiveRange,
  LivePortfolioHistory,
  LiveFilingsResponse,
  AiSettings,
  AiStatus,
  FilingInsight,
  ListedCompany,
  CustomPortfolio,
  PortfoliosResponse,
  DocumentState,
  PortfolioDocuments,
  DocumentSearchResult,
  DocumentSummaryState,
  AlertPreferences,
  AlertPreviewCompany,
  NotificationStatus,
  OptimiseResult
} from '@/types';

export interface PortfolioInput {
  name: string;
  holdings: Array<{ ticker: string; weight: number }>;
  activate?: boolean;
}

function adminHeaders(adminToken: string): Record<string, string> {
  return adminToken ? { 'X-Finn-Admin-Token': adminToken } : {};
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const errorBody = await res.text();
    let detail = errorBody;
    try {
      const parsed = JSON.parse(errorBody);
      detail = parsed.detail || errorBody;
    } catch {}
    throw new Error(detail || `API request failed with status ${res.status}`);
  }

  return res.json();
}

export const api = {
  // Health
  getHealth: () => fetchJson<SystemHealth>('/health'),

  // Portfolio & Companies
  getPortfolio: () => fetchJson<PortfolioResponse>('/portfolio'),
  addToPortfolio: (ticker: string, is_watchlist = false) =>
    fetchJson<{ message: string; company_id: number }>('/portfolio', {
      method: 'POST',
      body: JSON.stringify({ ticker, is_watchlist }),
    }),
  removeFromPortfolio: (ticker: string) =>
    fetchJson<{ message: string }>(`/portfolio/${ticker}`, {
      method: 'DELETE',
    }),
  searchCompanies: (query: string) =>
    fetchJson<{ results: Array<{ ticker: string; name: string; sector: string | null; exchange: string; in_portfolio: boolean }>; total: number; universe_available: boolean }>(
      `/companies/search?q=${encodeURIComponent(query)}`
    ),
  getCompany: (ticker: string) => fetchJson<Company>(`/companies/${ticker}`),
  getCompanyPrices: (ticker: string, days = 60) =>
    fetchJson<PriceDataResponse>(`/companies/${ticker}/prices?days=${days}`),
  ingestMarketData: (ticker: string) =>
    fetchJson<{ ticker: string; status: string; message: string; bars_added: number }>(
      `/companies/${ticker}/ingest`,
      { method: 'POST' }
    ),

  // Announcements & Digest
  getAnnouncements: (params?: { category?: string; company_ticker?: string; status?: string; limit?: number; is_demo?: boolean }) => {
    const q = new URLSearchParams();
    if (params?.is_demo !== undefined) q.append('is_demo', String(params.is_demo));
    if (params?.category) q.append('category', params.category);
    if (params?.company_ticker) q.append('company_ticker', params.company_ticker);
    if (params?.status) q.append('status', params.status);
    if (params?.limit) q.append('limit', params.limit.toString());
    return fetchJson<{ announcements: Announcement[]; total: number }>(`/announcements?${q.toString()}`);
  },
  getDigest: (hours = 168) => fetchJson<DigestResponse>(`/digest?hours=${hours}`),
  updateAnnouncementStatus: (id: number, status: 'new' | 'read' | 'saved' | 'dismissed') =>
    fetchJson<{ message: string }>(`/announcements/${id}/status?status=${status}`, {
      method: 'PATCH',
    }),
  getManagementEnrichment: (announcementId: number) =>
    fetchJson<ManagementChangeEnrichment>(`/management-change/${announcementId}`),

  // Financials & Quarterly Results
  getFinancials: (ticker: string) =>
    fetchJson<QuarterlyComparisonResponse>(`/companies/${ticker}/financials`),
  getGuidance: (ticker: string) =>
    fetchJson<{ company_ticker: string; guidance: any[]; total: number }>(`/companies/${ticker}/guidance`),

  // Alerts
  getAlertRules: () => fetchJson<{ rules: AlertRule[]; total: number }>('/alerts/rules'),
  createAlertRule: (rule: Partial<AlertRule>) =>
    fetchJson<{ message: string; id: number }>('/alerts/rules', {
      method: 'POST',
      body: JSON.stringify(rule),
    }),
  updateAlertRule: (id: number, rule: Partial<AlertRule>) =>
    fetchJson<{ message: string }>(`/alerts/rules/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(rule),
    }),
  deleteAlertRule: (id: number) =>
    fetchJson<{ message: string }>(`/alerts/rules/${id}`, {
      method: 'DELETE',
    }),
  evaluateAlerts: () =>
    fetchJson<{ price_alerts_triggered: number; volume_alerts_triggered: number; announcement_alerts_triggered: number; total_triggered: number }>(
      '/alerts/evaluate',
      { method: 'POST' }
    ),
  syncAlerts: () =>
    fetchJson<{ total_triggered: number; price_alerts_triggered: number; volume_alerts_triggered: number; announcement_alerts_triggered: number; filings_added: number; errors: string[] }>(
      '/alerts/sync',
      { method: 'POST' }
    ),
  getAiStatus: () => fetchJson<AiStatus>('/ai/status'),
  createFilingSummary: (announcementId: number) =>
    fetchJson<FilingInsight>(`/filings/${announcementId}/summary`, { method: 'POST' }),
  getAlertEvents: (params?: { acknowledged?: boolean; rule_type?: string; limit?: number; include_demo?: boolean }) => {
    const q = new URLSearchParams();
    if (params?.include_demo) q.append('include_demo', 'true');
    if (params?.acknowledged !== undefined) q.append('acknowledged', String(params.acknowledged));
    if (params?.rule_type) q.append('rule_type', params.rule_type);
    if (params?.limit !== undefined) q.append('limit', params.limit.toString());
    return fetchJson<{ events: AlertEvent[]; total: number }>(`/alerts/events?${q.toString()}`);
  },
  acknowledgeAlert: (id: number) =>
    fetchJson<{ message: string }>(`/alerts/events/${id}/acknowledge`, {
      method: 'PATCH',
    }),

  // Live data (free sources: Yahoo Finance prices, NSE filings)
  getLivePortfolioHistory: (range: LiveRange, ticker?: string) => {
    const q = new URLSearchParams({ range });
    if (ticker) q.append('ticker', ticker);
    return fetchJson<LivePortfolioHistory>(`/live/portfolio-history?${q.toString()}`);
  },
  getLiveFilings: (ticker?: string) =>
    fetchJson<LiveFilingsResponse>(`/live/filings${ticker ? `?ticker=${encodeURIComponent(ticker)}` : ''}`),
  getLiveCompanyPrices: (ticker: string, days = 60) =>
    fetchJson<PriceDataResponse>(`/live/companies/${encodeURIComponent(ticker)}/prices?days=${days}`),

  // Every NSE and BSE listed company
  searchListedCompanies: (query: string) =>
    fetchJson<{ results: ListedCompany[]; total: number }>(`/universe/search?q=${encodeURIComponent(query)}`),
  ensureCompany: (ticker: string) =>
    fetchJson<{ ticker: string; name: string; exchange: string }>(
      `/companies/${encodeURIComponent(ticker)}/ensure`,
      { method: 'POST' }
    ),

  // AI platforms and keys
  getAiSettings: (adminToken = '') =>
    fetchJson<AiSettings>('/settings/ai', { headers: adminHeaders(adminToken) }),
  saveAiSettings: (provider: string, body: { api_key?: string; model?: string; strong_model?: string; activate?: boolean }, adminToken = '') =>
    fetchJson<AiSettings>(`/settings/ai/${provider}`, {
      method: 'PUT',
      headers: adminHeaders(adminToken),
      body: JSON.stringify(body),
    }),
  removeAiKey: (provider: string, adminToken = '') =>
    fetchJson<AiSettings>(`/settings/ai/${provider}/key`, { method: 'DELETE', headers: adminHeaders(adminToken) }),
  testAiSettings: (provider: string, body: { api_key?: string; model?: string }, adminToken = '') =>
    fetchJson<{ ok: boolean; message: string }>(`/settings/ai/${provider}/test`, {
      method: 'POST',
      headers: adminHeaders(adminToken),
      body: JSON.stringify(body),
    }),

  // What counts as unusual, and where alerts are sent
  getAlertPreferences: () => fetchJson<AlertPreferences>('/settings/alerts'),
  saveAlertPreferences: (body: AlertPreferences) =>
    fetchJson<{ new_alerts: number }>('/settings/alerts', { method: 'PUT', body: JSON.stringify(body) }),
  getAlertPreview: (lookback: number) =>
    fetchJson<{ companies: AlertPreviewCompany[] }>(`/settings/alerts/preview?lookback=${lookback}`),
  getNotifications: () => fetchJson<NotificationStatus>('/settings/notifications'),
  saveNotifications: (body: { bot_token?: string; chat_id?: string }) =>
    fetchJson<NotificationStatus>('/settings/notifications', { method: 'PUT', body: JSON.stringify(body) }),
  clearNotifications: () => fetchJson<NotificationStatus>('/settings/notifications', { method: 'DELETE' }),
  testNotifications: () => fetchJson<{ ok: boolean; message: string }>('/settings/notifications/test', { method: 'POST' }),

  optimisePortfolio: (body: { holdings: Array<{ ticker: string; weight: number }>; objective: string; max_weight: number; years: number }) =>
    fetchJson<OptimiseResult>('/portfolios/optimise', { method: 'POST', body: JSON.stringify(body) }),

  // Custom portfolios
  getPortfolios: () => fetchJson<PortfoliosResponse>('/portfolios'),
  createPortfolio: (body: PortfolioInput) =>
    fetchJson<CustomPortfolio>('/portfolios', { method: 'POST', body: JSON.stringify(body) }),
  updatePortfolio: (id: number, body: PortfolioInput) =>
    fetchJson<CustomPortfolio>(`/portfolios/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deletePortfolio: (id: number) =>
    fetchJson<{ message: string }>(`/portfolios/${id}`, { method: 'DELETE' }),
  setActivePortfolio: (portfolioId: number | null) =>
    fetchJson<{ active_id: number | null }>('/portfolios-active', {
      method: 'PUT',
      body: JSON.stringify({ portfolio_id: portfolioId }),
    }),

  // Research & Documents
  getCompanyDocuments: (ticker: string) =>
    fetchJson<{ documents: SourceDocument[]; total: number; state: DocumentState }>(`/companies/${ticker}/documents`),
  fetchCompanyDocuments: (ticker: string) =>
    fetchJson<{ state: DocumentState }>(`/companies/${ticker}/documents/fetch`, { method: 'POST' }),
  getPortfolioDocuments: () => fetchJson<PortfolioDocuments>('/documents'),
  searchDocument: (id: number, query: string) =>
    fetchJson<{ results: DocumentSearchResult[]; total_pages: number | null }>(`/sources/${id}/pages?q=${encodeURIComponent(query)}`),
  getDocumentSummary: (id: number) => fetchJson<DocumentSummaryState>(`/sources/${id}/summary`),
  startDocumentSummary: (id: number) => fetchJson<DocumentSummaryState>(`/sources/${id}/summary`, { method: 'POST' }),
  getSourceDocument: (id: number) =>
    fetchJson<{ document: any; chunks: any[]; total_chunks: number }>(`/sources/${id}`),
  runResearch: (ticker: string, research_type: string, query?: string) =>
    fetchJson<ResearchResponse>(`/companies/${ticker}/research`, {
      method: 'POST',
      body: JSON.stringify({ research_type, query }),
    }),
};

