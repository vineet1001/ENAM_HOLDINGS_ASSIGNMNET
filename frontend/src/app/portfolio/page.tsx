'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Header } from '@/components/Header';
import { api } from '@/lib/api';
import { LivePortfolioHistory, PortfolioResponse, PortfoliosResponse } from '@/types';
import {
  ArrowDown,
  ArrowUp,
  Edit2,
  LayoutGrid,
  List,
  Plus,
  Trash2,
  Search,
  Star
} from 'lucide-react';
import Link from 'next/link';
import { Sheet } from '@/components/Sheet';
import { Sparkline } from '@/components/PriceChart';
import { PortfolioBuilder } from '@/components/PortfolioBuilder';
import { useQuickLook } from '@/components/QuickLook';
import { useToast } from '@/components/Toast';
import { changeTone, inr, PORTFOLIO_CHANGED_EVENT, readStored, signedPct, writeStored } from '@/lib/ui';

type SortKey = 'ticker' | 'sector' | 'weight' | 'latest_price' | 'daily_change_pct' | 'alert_count';
type ViewMode = 'list' | 'heatmap';

interface Row {
  ticker: string;
  name: string;
  sector: string | null;
  exchange: string;
  weight: number | null;
  latest_price: number | null;
  daily_change_pct: number | null;
  alert_count: number;
  latest_announcement: string | null;
  is_watchlist: boolean;
  spark: number[];
}

const VIEW_KEY = 'finn.portfolioView';

// Tile tint grows with the size of the move, up to a cap of ±3%.
function heatStyle(change: number | null): React.CSSProperties {
  if (change === null || change === 0) return { backgroundColor: '#161c28' };
  const strength = Math.min(Math.abs(change) / 3, 1);
  const rgb = change > 0 ? '16, 185, 129' : '244, 63, 94';
  return { backgroundColor: `rgba(${rgb}, ${0.1 + strength * 0.4})` };
}

export default function PortfolioPage() {
  const toast = useToast();
  const openQuickLook = useQuickLook();
  const [mock, setMock] = useState<PortfolioResponse | null>(null);
  const [portfolios, setPortfolios] = useState<PortfoliosResponse | null>(null);
  const [live, setLive] = useState<LivePortfolioHistory | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [selectedSector, setSelectedSector] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>('list');
  const [sortKey, setSortKey] = useState<SortKey>('daily_change_pct');
  const [sortDescending, setSortDescending] = useState(true);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingCurrent, setEditingCurrent] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);
  const [newTicker, setNewTicker] = useState('');
  const [suggestions, setSuggestions] = useState<Array<{ ticker: string; name: string; exchange: string; in_portfolio: boolean }>>([]);
  const [isAdding, setIsAdding] = useState(false);
  const requestId = useRef(0);

  const activePortfolio = portfolios?.portfolios.find((p) => p.id === portfolios.active_id) || null;
  const isCustom = activePortfolio !== null;

  const loadAll = useCallback(async () => {
    const current = ++requestId.current;
    setLoading(true);
    setLoadError(null);
    try {
      const [mockRes, portfoliosRes] = await Promise.all([api.getPortfolio(), api.getPortfolios()]);
      if (current !== requestId.current) return;
      setMock(mockRes);
      setPortfolios(portfoliosRes);
    } catch (err: any) {
      if (current === requestId.current) setLoadError(err.message || 'Could not reach the FINN API');
      if (current === requestId.current) setLoading(false);
      return;
    }
    // Prices can take a few seconds cold, so the holdings show first.
    setLoading(false);
    try {
      const liveRes = await api.getLivePortfolioHistory('1M');
      if (current !== requestId.current) return;
      setLive(liveRes);
      setLiveError(null);
    } catch (err: any) {
      if (current === requestId.current) {
        setLive(null);
        setLiveError(err.message || 'Live prices are unavailable');
      }
    }
  }, []);

  useEffect(() => {
    setView(readStored<ViewMode>(VIEW_KEY, 'list'));
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    const term = newTicker.trim();
    if (!showAddModal || !term) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      api.searchCompanies(term)
        .then((res) => {
          if (!cancelled) setSuggestions(res.results.slice(0, 5));
        })
        .catch(() => {});
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [newTicker, showAddModal]);

  const portfolioChanged = async () => {
    setLive(null);
    setSelectedSector('All');
    setConfirmDelete(false);
    window.dispatchEvent(new Event(PORTFOLIO_CHANGED_EVENT));
    await loadAll();
  };

  const switchPortfolio = async (value: string) => {
    try {
      await api.setActivePortfolio(value ? Number(value) : null);
      await portfolioChanged();
    } catch (err: any) {
      toast({ message: err.message || 'Could not switch portfolio', tone: 'error' });
    }
  };

  const handleDeletePortfolio = async () => {
    if (!activePortfolio) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    try {
      await api.deletePortfolio(activePortfolio.id);
      toast({ message: `Deleted ${activePortfolio.name}` });
      await portfolioChanged();
    } catch (err: any) {
      toast({ message: err.message || 'Could not delete the portfolio', tone: 'error' });
    }
  };

  const changeView = (next: ViewMode) => {
    setView(next);
    writeStored(VIEW_KEY, next);
  };

  const addTicker = async (ticker: string) => {
    setIsAdding(true);
    try {
      await api.addToPortfolio(ticker);
      setNewTicker('');
      setShowAddModal(false);
      toast({ message: `Added ${ticker} to the portfolio` });
      await portfolioChanged();
    } catch (err: any) {
      toast({ message: err.message || 'Failed to add ticker to portfolio', tone: 'error' });
    } finally {
      setIsAdding(false);
    }
  };

  const handleAddCompany = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTicker.trim()) addTicker(newTicker.trim().toUpperCase());
  };

  const handleRemoveCompany = async (row: Row) => {
    try {
      await api.removeFromPortfolio(row.ticker);
      await portfolioChanged();
      toast({
        message: `Removed ${row.ticker}`,
        actionLabel: 'Undo',
        onAction: async () => {
          try {
            await api.addToPortfolio(row.ticker, row.is_watchlist);
            await portfolioChanged();
          } catch (err: any) {
            toast({ message: err.message || `Could not restore ${row.ticker}`, tone: 'error' });
          }
        }
      });
    } catch (err: any) {
      toast({ message: err.message || 'Failed to remove ticker', tone: 'error' });
    }
  };

  // Live prices overlay whichever portfolio is active; the mock's seeded prices are only a fallback.
  const rows = useMemo<Row[]>(() => {
    const liveByTicker = new Map((live?.companies || []).map((c) => [c.ticker, c]));

    if (activePortfolio) {
      return activePortfolio.holdings.map((h) => {
        const quote = liveByTicker.get(h.ticker);
        return {
          ticker: h.ticker,
          name: h.name,
          sector: quote?.sector ?? null,
          exchange: quote?.exchange ?? h.exchange.split(' + ')[0],
          weight: h.weight,
          latest_price: quote?.latest_close ?? null,
          daily_change_pct: quote?.daily_change_pct ?? null,
          alert_count: 0,
          latest_announcement: null,
          is_watchlist: false,
          spark: quote?.spark || []
        };
      });
    }

    const equalWeight = mock?.companies.length ? 100 / mock.companies.length : null;
    return (mock?.companies || []).map((c) => {
      const quote = liveByTicker.get(c.ticker);
      return {
        ticker: c.ticker,
        name: c.name,
        sector: c.sector,
        exchange: c.exchange,
        weight: equalWeight,
        latest_price: live ? quote?.latest_close ?? null : c.latest_price,
        daily_change_pct: live ? quote?.daily_change_pct ?? null : c.daily_change_pct,
        alert_count: c.alert_count,
        latest_announcement: c.latest_announcement,
        is_watchlist: c.is_watchlist,
        spark: quote?.spark || []
      };
    });
  }, [activePortfolio, mock, live]);

  const columns: Array<{ key: SortKey; label: string; numeric?: boolean }> = [
    { key: 'ticker', label: 'Company' },
    ...(rows.some((r) => r.sector) ? [{ key: 'sector' as SortKey, label: 'Sector' }] : []),
    { key: 'weight', label: 'Weight', numeric: true },
    { key: 'latest_price', label: 'Close', numeric: true },
    { key: 'daily_change_pct', label: 'Change', numeric: true },
    ...(!isCustom ? [{ key: 'alert_count' as SortKey, label: 'Alerts', numeric: true }] : []),
  ];

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDescending(!sortDescending);
    } else {
      setSortKey(key);
      setSortDescending(columns.find((c) => c.key === key)?.numeric ?? false);
    }
  };

  const visibleRows = useMemo(() => {
    const term = searchQuery.toLowerCase();
    const filtered = rows.filter((r) => {
      const matchesSector = selectedSector === 'All' || r.sector === selectedSector;
      return matchesSector && (r.ticker.toLowerCase().includes(term) || r.name.toLowerCase().includes(term));
    });
    return filtered.sort((a, b) => {
      const left = a[sortKey];
      const right = b[sortKey];
      // Missing values stay at the bottom whichever way the column is sorted.
      if (left === null) return right === null ? 0 : 1;
      if (right === null) return -1;
      const order = typeof left === 'number' && typeof right === 'number'
        ? left - right
        : String(left).localeCompare(String(right));
      return sortDescending ? -order : order;
    });
  }, [rows, selectedSector, searchQuery, sortKey, sortDescending]);

  const sectors = ['All', ...Array.from(new Set(rows.map((r) => r.sector).filter((s): s is string => !!s))).sort()];
  const gainers = visibleRows.filter((r) => (r.daily_change_pct ?? 0) > 0).length;
  const decliners = visibleRows.filter((r) => (r.daily_change_pct ?? 0) < 0).length;
  const hasWatchlist = rows.some((r) => r.is_watchlist);
  const asOf = live?.as_of
    ? new Date(live.as_of).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;
  const weightText = (row: Row) => (row.weight === null ? '—' : `${row.weight.toFixed(row.weight % 1 === 0 ? 0 : 2)}%`);
  const priceDigits = (row: Row) => (row.latest_price !== null && row.latest_price < 1000 ? 2 : 0);

  return (
    <div className="flex-1 flex flex-col bg-[#0a0d14]">
      <Header
        isDemo={!live && !isCustom}
        dataFreshness={asOf ? `Latest close: ${asOf}` : 'Loading prices'}
        onRefresh={loadAll}
        isRefreshing={loading}
      />

      <main className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto w-full">
        {/* Portfolio switcher: the active one drives the whole app */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-white tracking-tight">Portfolio</h1>
            <p className="text-xs text-slate-400 mt-0.5 font-mono">
              {visibleRows.length} holdings · {gainers} up · {decliners} down
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div role="group" aria-label="Portfolio view" className="flex items-center bg-[#111520] border border-[#1e2433] rounded-lg p-1">
              <button
                onClick={() => changeView('list')}
                aria-pressed={view === 'list'}
                aria-label="List view"
                className={`p-1.5 rounded ${view === 'list' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              >
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => changeView('heatmap')}
                aria-pressed={view === 'heatmap'}
                aria-label="Heatmap view"
                className={`p-1.5 rounded ${view === 'heatmap' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={() => {
                setEditingCurrent(false);
                setBuilderOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors shadow-sm font-mono"
            >
              <Plus className="w-4 h-4" />
              Create portfolio
            </button>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-[#111520] border border-[#1e2433] flex items-center gap-2 flex-wrap">
          <label htmlFor="active-portfolio" className="text-[11px] font-mono text-slate-400 shrink-0">Showing</label>
          <select
            id="active-portfolio"
            value={portfolios?.active_id ?? ''}
            onChange={(e) => switchPortfolio(e.target.value)}
            className="flex-1 min-w-[170px] bg-[#0a0d14] border border-[#1e2433] rounded-lg px-2.5 py-2 text-base md:text-xs text-slate-200 focus:outline-none focus:border-blue-500"
          >
            <option value="">Mock portfolio (equal weights)</option>
            {(portfolios?.portfolios || []).map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.holdings.length} holdings)</option>
            ))}
          </select>
          {activePortfolio ? (
            <>
              <button
                onClick={() => {
                  setEditingCurrent(true);
                  setBuilderOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#2a3449] text-slate-300 hover:text-white text-xs font-mono"
              >
                <Edit2 className="w-3.5 h-3.5" />
                Edit
              </button>
              <button
                onClick={handleDeletePortfolio}
                onBlur={() => setConfirmDelete(false)}
                aria-label={confirmDelete ? `Confirm delete ${activePortfolio.name}` : `Delete ${activePortfolio.name}`}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-mono transition-colors ${
                  confirmDelete
                    ? 'bg-rose-500/15 text-rose-300 border-rose-500/40 font-semibold'
                    : 'border-[#2a3449] text-slate-400 hover:text-rose-400'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                {confirmDelete ? 'Confirm delete' : 'Delete'}
              </button>
            </>
          ) : (
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#2a3449] text-slate-300 hover:text-white text-xs font-mono"
            >
              <Plus className="w-3.5 h-3.5" />
              Add company
            </button>
          )}
          <p className="w-full text-[10px] font-mono text-slate-500">
            The portfolio shown here also drives the Daily Briefing graph, price moves and filings.
          </p>
        </div>

        {/* Filters and Search */}
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          {sectors.length > 1 ? (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 -mx-4 px-4 md:mx-0 md:px-0 text-xs">
              {sectors.map((sec) => (
                <button
                  key={sec}
                  onClick={() => setSelectedSector(sec)}
                  aria-pressed={selectedSector === sec}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors whitespace-nowrap border ${
                    selectedSector === sec
                      ? 'bg-blue-600/20 text-blue-400 border-blue-500/40 font-semibold'
                      : 'bg-[#111520] text-slate-400 border-[#1e2433] hover:text-slate-200'
                  }`}
                >
                  {sec}
                </button>
              ))}
            </div>
          ) : <span />}

          <div className="relative md:min-w-[220px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              placeholder="Filter by name or ticker..."
              aria-label="Filter holdings by name or ticker"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#111520] border border-[#1e2433] rounded-lg pl-8 pr-3 py-2 text-base md:text-xs text-slate-200 placeholder-slate-400 focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>
        </div>

        {/* Where the prices came from, and what's missing */}
        <div className="flex items-center justify-between gap-x-4 gap-y-1 flex-wrap text-[10px] font-mono">
          <span className={live ? 'text-slate-500' : 'text-amber-400'}>
            {live
              ? `Yahoo Finance · latest close ${asOf}`
              : liveError
              ? `Live prices are unavailable: ${liveError}${isCustom ? '' : ' Showing demo prices from 2024.'}`
              : 'Loading live prices...'}
          </span>
          {hasWatchlist && (
            <span className="inline-flex items-center gap-1 text-slate-400">
              <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
              On your watchlist
            </span>
          )}
        </div>
        {live && live.unavailable.length > 0 && (
          <p className="text-[11px] font-mono text-amber-400">
            Yahoo Finance has no recent prices for: {live.unavailable.join(', ')}. These are left out of the portfolio graph.
          </p>
        )}

        {loadError ? (
          <div className="p-6 rounded-xl bg-[#111520] border border-rose-500/30 text-center space-y-3">
            <p className="text-xs text-rose-300 font-mono">Could not load the portfolio: {loadError}</p>
            <button onClick={loadAll} className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium">
              Try again
            </button>
          </div>
        ) : loading && !mock ? (
          <div className="space-y-2" aria-label="Loading portfolio">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-14 rounded-lg bg-[#111520] border border-[#1e2433] animate-pulse" />
            ))}
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="p-8 rounded-xl bg-[#111520] border border-[#1e2433] text-center text-xs text-slate-400 font-mono">
            No companies match the selected filter.
          </div>
        ) : view === 'heatmap' ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-2">
              {visibleRows.map((r) => (
                <button
                  key={r.ticker}
                  onClick={() => openQuickLook(r.ticker)}
                  style={heatStyle(r.daily_change_pct)}
                  title={`${r.name}: ${signedPct(r.daily_change_pct)}`}
                  className="p-3 rounded-lg border border-[#1e2433] hover:border-slate-400 transition-colors text-left font-mono min-h-[76px]"
                >
                  <div className="text-xs font-bold text-white truncate">{r.ticker}</div>
                  <div className="text-sm font-semibold text-white mt-1 whitespace-nowrap">{signedPct(r.daily_change_pct)}</div>
                  <div className="text-[10px] text-slate-300 truncate font-sans mt-0.5">
                    {weightText(r)}{r.sector ? ` · ${r.sector}` : ''}
                  </div>
                </button>
              ))}
            </div>
            <p className="text-[10px] font-mono text-slate-500">
              Tint strength shows the size of the latest daily move, capped at ±3%. Tap a tile for its chart and filings.
            </p>
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <ul className="md:hidden divide-y divide-[#1e2433] border border-[#1e2433] rounded-xl bg-[#111520] overflow-hidden">
              <li className="flex items-center gap-2 px-3 py-2 overflow-x-auto no-scrollbar text-[11px] font-mono text-slate-400">
                <span className="shrink-0">Sort</span>
                {columns.filter((c) => c.key !== 'sector').map((col) => (
                  <button
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    aria-pressed={sortKey === col.key}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded border whitespace-nowrap ${
                      sortKey === col.key ? 'border-blue-500/40 text-blue-400' : 'border-[#1e2433]'
                    }`}
                  >
                    {col.label}
                    {sortKey === col.key && (sortDescending ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />)}
                  </button>
                ))}
              </li>
              {visibleRows.map((r) => (
                <li key={r.ticker}>
                  <button onClick={() => openQuickLook(r.ticker)} className="w-full flex items-center gap-3 px-3 py-3 text-left active:bg-[#161c28]">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 font-mono">
                        {r.is_watchlist && <Star aria-label="On watchlist" className="w-3 h-3 text-amber-400 fill-amber-400 shrink-0" />}
                        <span className="text-xs font-bold text-white truncate">{r.ticker}</span>
                        {r.alert_count > 0 && (
                          <span className="text-[10px] px-1.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30 whitespace-nowrap">
                            {r.alert_count} alert{r.alert_count > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate">
                        <span className="font-mono text-slate-300">{weightText(r)}</span> · {r.name}
                      </div>
                    </div>
                    <Sparkline values={r.spark} />
                    <div className="text-right font-mono shrink-0 w-[84px]">
                      <div className="text-xs font-medium text-white">{inr(r.latest_price, priceDigits(r))}</div>
                      <div className={`text-[11px] ${changeTone(r.daily_change_pct)}`}>{signedPct(r.daily_change_pct)}</div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>

            {/* Desktop table */}
            <div className="hidden md:block border border-[#1e2433] rounded-xl overflow-hidden bg-[#111520] shadow-sm">
              <table className="w-full text-xs text-left">
                <thead className="bg-[#0a0d14] text-slate-400 font-mono uppercase text-[10px] border-b border-[#1e2433]">
                  <tr>
                    {columns.map((col) => (
                      <th
                        key={col.key}
                        aria-sort={sortKey === col.key ? (sortDescending ? 'descending' : 'ascending') : 'none'}
                        className={`py-1.5 px-3 ${col.numeric ? 'text-right' : ''}`}
                      >
                        <button
                          onClick={() => handleSort(col.key)}
                          className={`inline-flex items-center gap-1 py-1.5 uppercase hover:text-slate-200 ${sortKey === col.key ? 'text-blue-400' : ''}`}
                        >
                          {col.label}
                          {sortKey === col.key && (sortDescending ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />)}
                        </button>
                      </th>
                    ))}
                    <th className="py-3 px-3">30D</th>
                    {!isCustom && <th className="py-3 px-3">Latest Filing</th>}
                    <th className="py-3 px-3"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1e2433] font-mono tabular-nums">
                  {visibleRows.map((r) => (
                    <tr
                      key={r.ticker}
                      onClick={() => openQuickLook(r.ticker)}
                      className="hover:bg-[#161c28]/60 transition-colors cursor-pointer group"
                    >
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          {r.is_watchlist && <Star aria-label="On watchlist" className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" />}
                          <div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openQuickLook(r.ticker);
                              }}
                              className="font-bold text-white group-hover:text-blue-400 transition-colors"
                            >
                              {r.ticker}
                            </button>
                            <div className="text-[11px] text-slate-400 truncate max-w-[220px] font-sans">{r.name}</div>
                          </div>
                        </div>
                      </td>
                      {columns.some((c) => c.key === 'sector') && (
                        <td className="py-2.5 px-3 text-slate-300">
                          {r.sector && (
                            <span className="px-2 py-0.5 rounded bg-[#0a0d14] border border-[#1e2433] text-[10px] whitespace-nowrap">{r.sector}</span>
                          )}
                        </td>
                      )}
                      <td className="py-2.5 px-3 text-right text-slate-200">{weightText(r)}</td>
                      <td className="py-2.5 px-3 text-right text-white font-medium">{inr(r.latest_price, 2)}</td>
                      <td className={`py-2.5 px-3 text-right font-medium whitespace-nowrap ${changeTone(r.daily_change_pct)}`}>{signedPct(r.daily_change_pct)}</td>
                      {!isCustom && (
                        <td className="py-2.5 px-3 text-right">
                          {r.alert_count > 0 ? (
                            <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] whitespace-nowrap">{r.alert_count} active</span>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>
                      )}
                      <td className="py-2.5 px-3"><Sparkline values={r.spark} /></td>
                      {!isCustom && (
                        <td className="py-2.5 px-3 text-slate-300 font-sans max-w-[220px] truncate">{r.latest_announcement || 'No recent filings'}</td>
                      )}
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <Link
                            href={`/research?ticker=${encodeURIComponent(r.ticker)}`}
                            className="px-2.5 py-1 rounded bg-blue-600/10 text-blue-400 hover:bg-blue-600/20 border border-blue-500/30 transition-colors text-[11px]"
                          >
                            Research
                          </Link>
                          {!isCustom && (
                            <button
                              onClick={() => handleRemoveCompany(r)}
                              aria-label={`Remove ${r.ticker} from portfolio`}
                              title="Remove from portfolio"
                              className="p-1.5 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>

      <PortfolioBuilder
        open={builderOpen}
        editing={editingCurrent ? activePortfolio : null}
        onClose={() => setBuilderOpen(false)}
        onSaved={portfolioChanged}
      />

      {/* Add a company to the mock portfolio */}
      <Sheet open={showAddModal} onClose={() => setShowAddModal(false)} label="Add company to mock portfolio" maxWidth="md:max-w-md">
        <div className="px-4 pb-6 md:p-6">
          <h3 className="text-base font-semibold text-white">Add Company to Mock Portfolio</h3>
          <p className="text-xs text-slate-400 mt-1">Search any NSE or BSE listed company.</p>

          <form onSubmit={handleAddCompany} className="mt-4 space-y-3 text-xs">
            <div>
              <label htmlFor="add-ticker" className="block text-slate-300 font-medium mb-1">Symbol or Name</label>
              <input
                id="add-ticker"
                autoFocus
                type="text"
                required
                autoComplete="off"
                placeholder="e.g., PIDILITIND"
                value={newTicker}
                onChange={(e) => setNewTicker(e.target.value)}
                className="w-full bg-[#0a0d14] border border-[#1e2433] rounded-lg px-3 py-2 text-base md:text-xs text-slate-200 font-mono focus:outline-none focus:border-blue-500"
              />
            </div>

            {suggestions.length > 0 && (
              <ul className="divide-y divide-[#1e2433] border border-[#1e2433] rounded-lg bg-[#0a0d14]">
                {suggestions.map((s) => (
                  <li key={s.ticker}>
                    <button
                      type="button"
                      disabled={s.in_portfolio || isAdding}
                      onClick={() => addTicker(s.ticker)}
                      className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-[#161c28] disabled:opacity-50 disabled:hover:bg-transparent"
                    >
                      <span className="min-w-0">
                        <span className="block font-mono font-bold text-slate-100">{s.ticker}</span>
                        <span className="block text-[11px] text-slate-400 truncate">{s.name}</span>
                      </span>
                      <span className="text-[10px] font-mono text-slate-400 shrink-0">
                        {s.in_portfolio ? 'Already held' : `${s.exchange} · Add +`}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-[#1e2433]">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-3 py-2 rounded-lg border border-[#1e2433] text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isAdding}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors disabled:opacity-50"
              >
                {isAdding ? 'Adding...' : 'Add to Portfolio'}
              </button>
            </div>
          </form>
        </div>
      </Sheet>
    </div>
  );
}
