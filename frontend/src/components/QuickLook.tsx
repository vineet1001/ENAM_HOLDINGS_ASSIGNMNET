'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Search, X, BellRing } from 'lucide-react';
import { api } from '@/lib/api';
import { Company, PriceBar } from '@/types';
import { categoryLabel } from '@/lib/ui';
import { Sheet } from '@/components/Sheet';
import { PriceChart } from '@/components/PriceChart';
import { ResultsHeadline } from '@/components/ResultsHeadline';

const QuickLookContext = createContext<(ticker: string) => void>(() => {});

export function useQuickLook() {
  return useContext(QuickLookContext);
}

interface QuickFiling {
  id: number;
  category: string | null;
  date: string;
  title: string;
  url: string | null;
}

function QuickLookBody({ ticker, onClose }: { ticker: string; onClose: () => void }) {
  const [company, setCompany] = useState<Company | null>(null);
  const [bars, setBars] = useState<PriceBar[]>([]);
  const [filings, setFilings] = useState<QuickFiling[]>([]);
  const [filingsSource, setFilingsSource] = useState('');
  const [isStale, setIsStale] = useState(false);
  const [freshness, setFreshness] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Live sources first. Seeded data is only a fallback, and it says so on screen.
    const loadPrices = () =>
      api.getLiveCompanyPrices(ticker, 60).catch(() => api.getCompanyPrices(ticker, 60));
    const loadFilings = async (): Promise<{ rows: QuickFiling[]; source: string }> => {
      try {
        const live = await api.getLiveFilings(ticker);
        return {
          source: 'Real exchange filings',
          rows: live.filings.slice(0, 5).map((f) => ({
            id: f.id, category: f.category, date: f.filed_at, title: f.title, url: f.pdf_url
          }))
        };
      } catch {
        const demo = await api.getAnnouncements({ company_ticker: ticker, limit: 5, is_demo: true });
        return {
          source: 'Demo filings, live feed unavailable',
          rows: demo.announcements.map((a) => ({
            id: a.id, category: a.category, date: a.filing_date, title: a.title, url: null
          }))
        };
      }
    };

    api.ensureCompany(ticker)
      .catch(() => null)
      .then(() => Promise.all([api.getCompany(ticker), loadPrices(), loadFilings()]))
      .then(([companyRes, priceRes, filingRes]) => {
        if (cancelled) return;
        setCompany(companyRes);
        setBars(priceRes.prices);
        setIsStale(priceRes.is_stale);
        setFreshness(priceRes.data_freshness);
        setFilings(filingRes.rows);
        setFilingsSource(filingRes.source);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || `Could not load ${ticker}`);
      });
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  return (
    <div className="px-4 pb-6 md:p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/30">
              {ticker}
            </span>
            {company?.sector && <span className="text-[11px] text-slate-400">{company.sector}</span>}
          </div>
          <h2 className="text-base font-semibold text-white mt-1 truncate">{company?.name || ' '}</h2>
        </div>
        <button onClick={onClose} aria-label="Close quick look" className="text-slate-400 hover:text-white p-2 -m-1 rounded-lg hover:bg-[#1a2030]">
          <X className="w-5 h-5" />
        </button>
      </div>

      {error ? (
        <p className="text-xs text-rose-400 font-mono">{error}</p>
      ) : !company ? (
        <div className="h-64 rounded-lg bg-[#0a0d14] border border-[#1e2433] animate-pulse" />
      ) : (
        <>
          {isStale && (
            <p className="text-[11px] font-mono text-amber-400 bg-amber-500/5 border border-amber-500/20 rounded-lg px-2.5 py-1.5">
              {freshness}{bars[0]?.is_demo ? ' · demo prices' : ''}
            </p>
          )}

          {!isStale && bars.length > 0 && !bars[0].is_demo && (
            <p className="text-[10px] font-mono text-slate-500">{freshness}</p>
          )}

          <PriceChart bars={bars} />

          <div className="flex items-center gap-2">
            <Link
              href={`/research?ticker=${ticker}`}
              onClick={onClose}
              className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors"
            >
              <Search className="w-3.5 h-3.5" />
              Open Research Desk
            </Link>
            {company.alert_count > 0 && (
              <Link
                href="/alerts"
                onClick={onClose}
                className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg border border-rose-500/30 text-rose-300 hover:bg-rose-500/10 text-xs font-mono"
              >
                <BellRing className="w-3.5 h-3.5" />
                {company.alert_count} active
              </Link>
            )}
          </div>

          <section className="space-y-2">
            <h3 className="text-[11px] font-mono font-semibold text-slate-300 uppercase tracking-wider">Latest results</h3>
            <ResultsHeadline ticker={ticker} />
          </section>

          <section className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-[11px] font-mono font-semibold text-slate-300 uppercase tracking-wider">Recent filings</h3>
              <span className="text-[10px] font-mono text-slate-500">{filingsSource}</span>
            </div>
            {filings.length === 0 ? (
              <p className="text-xs text-slate-400">No filings in the last 30 days.</p>
            ) : (
              <ul className="divide-y divide-[#1e2433] border border-[#1e2433] rounded-lg bg-[#0a0d14]">
                {filings.map((f) => (
                  <li key={f.id} className="px-3 py-2 text-xs">
                    <div className="flex items-center justify-between gap-2 text-[10px] font-mono text-slate-400">
                      <span className="uppercase">{categoryLabel(f.category)}</span>
                      <span>{new Date(f.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    </div>
                    <p className="text-slate-200 mt-0.5 leading-relaxed">{f.title}</p>
                    {f.url && (
                      <a href={f.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-1 py-0.5 text-[11px] font-mono text-blue-400 hover:text-blue-300">
                        Open filing <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export function QuickLookProvider({ children }: { children: React.ReactNode }) {
  const [ticker, setTicker] = useState<string | null>(null);
  const open = useCallback((next: string) => setTicker(next), []);
  const close = useCallback(() => setTicker(null), []);

  return (
    <QuickLookContext.Provider value={open}>
      {children}
      <Sheet open={ticker !== null} onClose={close} label={`Quick look: ${ticker}`} placement="right" maxWidth="md:max-w-lg">
        {ticker && <QuickLookBody key={ticker} ticker={ticker} onClose={close} />}
      </Sheet>
    </QuickLookContext.Provider>
  );
}
