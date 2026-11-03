// Shared presentation helpers for the interactive UI layer.

export const ALL_CATEGORIES = [
  'results', 'M&A', 'fund_raise', 'management_change', 'litigation',
  'insider_trading', 'earnings_call', 'investor_meetings', 'credit_rating',
  'dividend', 'bonus_split', 'capex', 'press_release', 'postal_ballot',
  'agm_egm', 'pledging', 'unclassified'
];

// Categories that surface in the digest until the investor tunes them.
export const DEFAULT_FOCUS_CATEGORIES = [
  'results', 'M&A', 'fund_raise', 'management_change',
  'litigation', 'credit_rating', 'pledging', 'capex'
];

// Choices stored in this browser, which win over the server's defaults until settings are next saved.
export const DIGEST_WINDOW_KEY = 'finn.digestWindow';
export const DIGEST_FOCUS_KEY = 'finn.focusCategories';
export const BROWSER_ALERTS_KEY = 'finn.browserAlerts';

// Window events let separate parts of the app react without shared state.
export const ALERTS_CHANGED_EVENT = 'finn:alerts-changed';
export const OPEN_PALETTE_EVENT = 'finn:open-palette';
export const OPEN_MENU_EVENT = 'finn:open-menu';
export const PORTFOLIO_CHANGED_EVENT = 'finn:portfolio-changed';

// Seeded tickers that now trade under another symbol. Keep in step with SYMBOL_ALIASES in live_data.py.
const SYMBOL_ALIASES: Record<string, string> = { TATAMOTORS: 'TMPV', ZOMATO: 'ETERNAL' };

function liveSymbol(ticker: string): string {
  return SYMBOL_ALIASES[ticker] || ticker;
}

export function nseQuoteUrl(ticker: string): string {
  return `https://www.nseindia.com/get-quotes/equity?symbol=${encodeURIComponent(liveSymbol(ticker))}`;
}

// Screener's documents section lists a company's annual reports and concall transcripts.
export function screenerDocumentsUrl(ticker: string): string {
  return `https://www.screener.in/company/${encodeURIComponent(liveSymbol(ticker))}/consolidated/#documents`;
}

export function googleFinanceUrl(ticker: string): string {
  return `https://www.google.com/finance/quote/${encodeURIComponent(liveSymbol(ticker))}:NSE`;
}

export function categoryLabel(category: string | null): string {
  return (category || 'unclassified').replace(/_/g, ' ');
}

export function inr(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined) return '—';
  const sign = value < 0 ? '-' : '';
  return `${sign}₹${Math.abs(value).toLocaleString('en-IN', { maximumFractionDigits: digits })}`;
}

export function compactNumber(value: number): string {
  return value.toLocaleString('en-IN', { notation: 'compact', maximumFractionDigits: 1 });
}

// Direction always carries an arrow and a sign: the green/red pair alone fails CVD validation.
export function signedPct(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined) return '—';
  const arrow = value > 0 ? '▲' : value < 0 ? '▼' : '•';
  return `${arrow} ${value > 0 ? '+' : ''}${value.toFixed(digits)}%`;
}

export function changeTone(value: number | null | undefined): string {
  if (value === null || value === undefined || value === 0) return 'text-slate-400';
  return value > 0 ? 'text-emerald-400' : 'text-rose-400';
}

export function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function removeStored(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Storage can be unavailable (private window).
  }
}

export function writeStored(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable (private window); preferences just won't persist.
  }
}
