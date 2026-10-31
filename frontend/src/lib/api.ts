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
  SystemHealth
} from '@/types';

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
    fetchJson<{ results: Array<{ ticker: string; name: string; sector: string; in_portfolio: boolean }>; total: number }>(
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
  getAnnouncements: (params?: { category?: string; company_ticker?: string; status?: string; limit?: number }) => {
    const q = new URLSearchParams();
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
  getAlertEvents: (params?: { acknowledged?: boolean; rule_type?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.acknowledged !== undefined) q.append('acknowledged', String(params.acknowledged));
    if (params?.rule_type) q.append('rule_type', params.rule_type);
    if (params?.limit !== undefined) q.append('limit', params.limit.toString());
    return fetchJson<{ events: AlertEvent[]; total: number }>(`/alerts/events?${q.toString()}`);
  },
  acknowledgeAlert: (id: number) =>
    fetchJson<{ message: string }>(`/alerts/events/${id}/acknowledge`, {
      method: 'PATCH',
    }),

  // Research & Documents
  getCompanyDocuments: (ticker: string) =>
    fetchJson<{ documents: SourceDocument[]; total: number }>(`/companies/${ticker}/documents`),
  getSourceDocument: (id: number) =>
    fetchJson<{ document: any; chunks: any[]; total_chunks: number }>(`/sources/${id}`),
  runResearch: (ticker: string, research_type: string, query?: string) =>
    fetchJson<ResearchResponse>(`/companies/${ticker}/research`, {
      method: 'POST',
      body: JSON.stringify({ research_type, query }),
    }),
};

