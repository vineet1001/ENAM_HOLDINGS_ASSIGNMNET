'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Trash2, X } from 'lucide-react';
import { api } from '@/lib/api';
import { CustomPortfolio, ListedCompany } from '@/types';
import { Sheet } from '@/components/Sheet';
import { WeightSuggestions } from '@/components/WeightSuggestions';
import { useToast } from '@/components/Toast';

interface DraftHolding {
  ticker: string;
  name: string;
  exchange: string;
  weight: string;
}

const WEIGHT_TOLERANCE = 0.01;

function ExchangeBadges({ exchanges }: { exchanges: string[] }) {
  return (
    <span className="inline-flex gap-1 shrink-0">
      {exchanges.map((exchange) => (
        <span key={exchange} className="text-[9px] font-mono px-1 rounded border border-[#2a3449] text-slate-400">
          {exchange}
        </span>
      ))}
    </span>
  );
}

// Splits 100 across `count` holdings in two decimals, with any rounding remainder on the first.
function evenSplit(count: number): string[] {
  const share = Math.floor((100 / count) * 100) / 100;
  const first = Math.round((100 - share * (count - 1)) * 100) / 100;
  return Array.from({ length: count }, (_, i) => String(i === 0 ? first : share));
}

export function PortfolioBuilder({
  open,
  editing,
  onClose,
  onSaved
}: {
  open: boolean;
  editing: CustomPortfolio | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [holdings, setHoldings] = useState<DraftHolding[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ListedCompany[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(editing?.name || '');
    setHoldings(
      (editing?.holdings || []).map((h) => ({
        ticker: h.ticker,
        name: h.name,
        exchange: h.exchange,
        weight: String(h.weight)
      }))
    );
    setQuery('');
    setResults([]);
  }, [open, editing]);

  // Debounced so typing a name doesn't send a request per keystroke.
  useEffect(() => {
    const term = query.trim();
    setSearchError(null);
    if (!term) {
      setResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      api.searchListedCompanies(term)
        .then((res) => {
          if (!cancelled) setResults(res.results.slice(0, 8));
        })
        .catch((err) => {
          if (!cancelled) {
            setResults([]);
            setSearchError(err.message || 'Company search is unavailable');
          }
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const total = useMemo(
    () => holdings.reduce((sum, h) => sum + (parseFloat(h.weight) || 0), 0),
    [holdings]
  );
  const remaining = Math.round((100 - total) * 100) / 100;
  const totalIsValid = Math.abs(remaining) <= WEIGHT_TOLERANCE;
  const hasInvalidWeight = holdings.some((h) => !(parseFloat(h.weight) > 0));

  const blocker = !name.trim()
    ? 'Give the portfolio a name'
    : holdings.length === 0
    ? 'Add at least one company'
    : hasInvalidWeight
    ? 'Every company needs a weight above 0%'
    : !totalIsValid
    ? remaining > 0
      ? `${remaining}% still to allocate`
      : `${Math.abs(remaining)}% over 100%`
    : null;

  const addCompany = (company: ListedCompany) => {
    if (holdings.some((h) => h.ticker === company.ticker)) return;
    setHoldings((prev) => [
      ...prev,
      {
        ticker: company.ticker,
        name: company.name,
        exchange: company.exchanges.join(' + '),
        // A new holding starts with whatever is left, which often finishes the portfolio.
        weight: remaining > 0 ? String(remaining) : ''
      }
    ]);
    setQuery('');
    setResults([]);
  };

  const setWeight = (ticker: string, weight: string) => {
    setHoldings((prev) => prev.map((h) => (h.ticker === ticker ? { ...h, weight } : h)));
  };

  const splitEqually = () => {
    const shares = evenSplit(holdings.length);
    setHoldings((prev) => prev.map((h, i) => ({ ...h, weight: shares[i] })));
  };

  const scaleToHundred = () => {
    if (total <= 0) return;
    const scaled = holdings.map((h) => Math.round(((parseFloat(h.weight) || 0) / total) * 10000) / 100);
    const drift = Math.round((100 - scaled.reduce((sum, w) => sum + w, 0)) * 100) / 100;
    const largest = scaled.indexOf(Math.max(...scaled));
    scaled[largest] = Math.round((scaled[largest] + drift) * 100) / 100;
    setHoldings((prev) => prev.map((h, i) => ({ ...h, weight: String(scaled[i]) })));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (blocker) return;
    setSaving(true);
    const body = {
      name: name.trim(),
      holdings: holdings.map((h) => ({ ticker: h.ticker, weight: parseFloat(h.weight) })),
      activate: true
    };
    try {
      if (editing) await api.updatePortfolio(editing.id, body);
      else await api.createPortfolio(body);
      toast({ message: `${body.name} saved and now showing across FINN` });
      onSaved();
      onClose();
    } catch (err: any) {
      toast({ message: err.message || 'Could not save the portfolio', tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const noResults = query.trim().length > 0 && !searching && !searchError && results.length === 0;

  return (
    <Sheet open={open} onClose={onClose} label={editing ? 'Edit portfolio' : 'Create portfolio'} maxWidth="md:max-w-xl">
      <form onSubmit={handleSave} className="px-4 pb-6 md:p-6 space-y-4 text-xs">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">{editing ? 'Edit Portfolio' : 'Create Portfolio'}</h3>
          <button type="button" onClick={onClose} aria-label="Close portfolio builder" className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-[#1a2030]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div>
          <label htmlFor="portfolio-name" className="block text-slate-300 font-medium mb-1">Portfolio name</label>
          <input
            id="portfolio-name"
            type="text"
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Long-term core"
            className="w-full bg-[#0a0d14] border border-[#1e2433] rounded-lg px-3 py-2 text-base md:text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <label htmlFor="portfolio-search" className="block text-slate-300 font-medium mb-1">Add any NSE or BSE company</label>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              id="portfolio-search"
              type="text"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name, symbol, BSE code or ISIN"
              className="w-full bg-[#0a0d14] border border-[#1e2433] rounded-lg pl-8 pr-3 py-2 text-base md:text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {searching && <p className="mt-1.5 text-[11px] font-mono text-slate-400 animate-pulse">Searching NSE and BSE...</p>}
          {searchError && <p className="mt-1.5 text-[11px] font-mono text-rose-300">{searchError}</p>}
          {noResults && <p className="mt-1.5 text-[11px] font-mono text-amber-400">No NSE or BSE company matches &ldquo;{query.trim()}&rdquo;.</p>}

          {results.length > 0 && (
            <ul className="mt-1.5 divide-y divide-[#1e2433] border border-[#1e2433] rounded-lg bg-[#0a0d14] max-h-56 overflow-y-auto">
              {results.map((company) => {
                const added = holdings.some((h) => h.ticker === company.ticker);
                return (
                  <li key={company.ticker}>
                    <button
                      type="button"
                      disabled={added}
                      onClick={() => addCompany(company)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[#161c28] disabled:opacity-50 disabled:hover:bg-transparent"
                    >
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-slate-100 truncate">{company.ticker}</span>
                          <ExchangeBadges exchanges={company.exchanges} />
                        </span>
                        <span className="block text-[11px] text-slate-400 truncate">{company.name}</span>
                      </span>
                      {added ? (
                        <span className="text-[10px] font-mono text-slate-400 shrink-0">Added</span>
                      ) : (
                        <Plus className="w-4 h-4 text-blue-400 shrink-0" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {holdings.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-300 font-medium">Holdings ({holdings.length})</span>
              <div className="flex items-center gap-1.5 font-mono text-[11px]">
                <button type="button" onClick={splitEqually} className="px-2 py-1 rounded border border-[#2a3449] text-slate-300 hover:text-white">
                  Split equally
                </button>
                <button type="button" onClick={scaleToHundred} disabled={total <= 0 || totalIsValid} className="px-2 py-1 rounded border border-[#2a3449] text-slate-300 hover:text-white disabled:opacity-40">
                  Scale to 100%
                </button>
              </div>
            </div>

            <ul className="divide-y divide-[#1e2433] border border-[#1e2433] rounded-lg bg-[#0a0d14]">
              {holdings.map((holding) => (
                <li key={holding.ticker} className="flex items-center gap-2 px-3 py-2">
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="font-mono font-bold text-slate-100 truncate">{holding.ticker}</span>
                      <ExchangeBadges exchanges={holding.exchange.split(' + ')} />
                    </span>
                    <span className="block text-[11px] text-slate-400 truncate">{holding.name}</span>
                  </span>
                  <div className="relative shrink-0">
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      max="100"
                      step="any"
                      value={holding.weight}
                      onChange={(e) => setWeight(holding.ticker, e.target.value)}
                      aria-label={`Weight of ${holding.ticker} in percent`}
                      className="w-20 bg-[#111520] border border-[#1e2433] rounded px-2 py-1.5 pr-5 text-right text-base md:text-xs text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                    />
                    <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 pointer-events-none">%</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setHoldings((prev) => prev.filter((h) => h.ticker !== holding.ticker))}
                    aria-label={`Remove ${holding.ticker}`}
                    className="p-1.5 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>

            <WeightSuggestions
              holdings={holdings.map((h) => ({ ticker: h.ticker, weight: parseFloat(h.weight) || 0 }))}
              onApply={(weights) => {
                setHoldings((prev) =>
                  prev.filter((h) => weights[h.ticker] > 0).map((h) => ({ ...h, weight: String(weights[h.ticker]) }))
                );
                toast({ message: 'Suggested weights applied. Save to keep them.' });
              }}
            />

            {/* Fill stops at 100%; going over turns it rose and the text states by how much */}
            <div>
              <div
                role="progressbar"
                aria-label="Total weight allocated"
                aria-valuenow={Math.round(total * 100) / 100}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-1.5 rounded-full bg-[#1e2433] overflow-hidden"
              >
                <div
                  className={`h-full rounded-full transition-all duration-150 ${total > 100 + WEIGHT_TOLERANCE ? 'bg-rose-500' : totalIsValid ? 'bg-emerald-500' : 'bg-blue-500'}`}
                  style={{ width: `${Math.min(100, total)}%` }}
                />
              </div>
              <p className="flex justify-between mt-1 font-mono text-[11px]" aria-live="polite">
                <span className={totalIsValid ? 'text-emerald-400' : total > 100 ? 'text-rose-400' : 'text-slate-400'}>
                  Total {Math.round(total * 100) / 100}%
                </span>
                {!totalIsValid && (
                  <span className={total > 100 ? 'text-rose-400' : 'text-slate-400'}>
                    {remaining > 0 ? `${remaining}% left` : `${Math.abs(remaining)}% over`}
                  </span>
                )}
              </p>
            </div>
          </div>
        )}

        <div className="pt-3 border-t border-[#1e2433] flex items-center justify-between gap-3">
          <span className="text-[11px] font-mono text-amber-400 min-w-0">{blocker || ''}</span>
          <div className="flex items-center gap-2 shrink-0">
            <button type="button" onClick={onClose} className="px-3 py-2 rounded-lg border border-[#1e2433] text-slate-400 hover:text-white">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || blocker !== null}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save portfolio'}
            </button>
          </div>
        </div>
      </form>
    </Sheet>
  );
}
