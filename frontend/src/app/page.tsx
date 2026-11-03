'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Header } from '@/components/Header';
import { api } from '@/lib/api';
import {
  Announcement,
  DigestResponse,
  DigestItem,
  LiveCompany,
  LiveFiling,
  LiveFilingsResponse,
  PortfolioResponse,
  ManagementChangeEnrichment
} from '@/types';
import {
  AlertTriangle,
  BarChart3,
  Bookmark,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  FileText,
  SlidersHorizontal,
  Sparkles,
  UserCheck,
  X
} from 'lucide-react';
import Link from 'next/link';
import { ExecutiveEnrichmentModal } from '@/components/ExecutiveEnrichmentModal';
import { AiHeadline, FilingFirstCut, FilingSummary } from '@/components/FilingAi';
import { PortfolioChart } from '@/components/PortfolioChart';
import { ResultsHeadline } from '@/components/ResultsHeadline';
import { SwipeRow } from '@/components/SwipeRow';
import { useQuickLook } from '@/components/QuickLook';
import { useToast } from '@/components/Toast';
import {
  ALL_CATEGORIES,
  DEFAULT_FOCUS_CATEGORIES,
  DIGEST_FOCUS_KEY,
  DIGEST_WINDOW_KEY,
  categoryLabel,
  changeTone,
  inr,
  nseQuoteUrl,
  readStored,
  screenerDocumentsUrl,
  signedPct,
  writeStored
} from '@/lib/ui';

const WINDOWS = [
  { label: '24h', val: 24 },
  { label: '3d', val: 72 },
  { label: '7d', val: 168 },
  { label: '30d', val: 720 },
];
const WINDOW_KEY = DIGEST_WINDOW_KEY;
const FOCUS_KEY = DIGEST_FOCUS_KEY;
const FEED_KEY = 'finn.feedSource';
const LIVE_STATUS_KEY = 'finn.liveFilingStatus';
const LIVE_REFRESH_MS = 15 * 60 * 1000;
const STATUS_LABEL: Record<string, string> = { read: 'Marked done', saved: 'Saved', dismissed: 'Dismissed' };

type TriageStatus = Announcement['status'];
type FeedSource = 'live' | 'demo';

export default function DailyBriefingPage() {
  const toast = useToast();
  const openQuickLook = useQuickLook();
  const [digest, setDigest] = useState<DigestResponse | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedHours, setSelectedHours] = useState(24);
  const [showRoutine, setShowRoutine] = useState(false);
  const [expandedItemId, setExpandedItemId] = useState<number | null>(null);
  const [cursorId, setCursorId] = useState<number | null>(null);

  // What the investor decides earns attention
  const [focusCategories, setFocusCategories] = useState<string[]>(DEFAULT_FOCUS_CATEGORIES);
  const [showFocusEditor, setShowFocusEditor] = useState(false);
  const [moveThreshold, setMoveThreshold] = useState(2);
  const [aiEnabled, setAiEnabled] = useState(false);

  // Real exchange filings. NSE items have no database row, so triage for them stays in this browser.
  const [source, setSource] = useState<FeedSource>('live');
  const [liveFeed, setLiveFeed] = useState<LiveFilingsResponse | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveLoading, setLiveLoading] = useState(true);
  const [liveStatuses, setLiveStatuses] = useState<Record<number, TriageStatus>>({});
  const [livePrices, setLivePrices] = useState<{ companies: LiveCompany[]; asOf: string } | null>(null);

  const [selectedEnrichment, setSelectedEnrichment] = useState<ManagementChangeEnrichment | null>(null);
  const requestId = useRef(0);

  // Auto-widening applies only until the investor has picked a window themselves.
  const windowChosen = useRef(false);
  const loadedHours = useRef<number | null>(null);
  const [widenedFrom, setWidenedFrom] = useState<number | null>(null);

  useEffect(() => {
    const storedWindow = readStored<number | null>(WINDOW_KEY, null);
    if (storedWindow !== null) {
      windowChosen.current = true;
      setSelectedHours(storedWindow);
    }
    setFocusCategories(readStored<string[]>(FOCUS_KEY, DEFAULT_FOCUS_CATEGORIES));
    setSource(readStored<FeedSource>(FEED_KEY, 'live'));
    setLiveStatuses(readStored<Record<number, TriageStatus>>(LIVE_STATUS_KEY, {}));
    // Alert Settings holds the defaults. A choice made on this page keeps winning until settings are saved again.
    api.getAlertPreferences()
      .then((prefs) => {
        setMoveThreshold(prefs.move_watch_percent);
        setAiEnabled(prefs.ai_enabled);
        if (storedWindow === null && prefs.digest_default_hours !== 24) {
          windowChosen.current = true;
          setSelectedHours(prefs.digest_default_hours);
        }
        if (readStored<string[] | null>(FOCUS_KEY, null) === null) setFocusCategories(prefs.digest_focus_categories);
      })
      .catch(() => {});
  }, []);

  const loadLiveFilings = useCallback(async () => {
    try {
      setLiveLoading(true);
      setLiveFeed(await api.getLiveFilings());
      setLiveError(null);
    } catch (err: any) {
      setLiveError(err.message || 'Could not reach the NSE filings feed');
    } finally {
      setLiveLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLiveFilings();
    const interval = setInterval(loadLiveFilings, LIVE_REFRESH_MS);
    return () => clearInterval(interval);
  }, [loadLiveFilings]);

  const handleLivePrices = useCallback((companies: LiveCompany[], asOf: string) => {
    setLivePrices({ companies, asOf });
  }, []);

  const loadData = useCallback(async () => {
    const current = ++requestId.current;
    try {
      setLoading(true);
      setLoadError(null);
      const [dig, port] = await Promise.all([
        api.getDigest(selectedHours),
        api.getPortfolio(),
      ]);
      // A slower response for a previous window must not overwrite the current one.
      if (current !== requestId.current) return;
      loadedHours.current = selectedHours;
      setDigest(dig);
      setPortfolio(port);
    } catch (err: any) {
      if (current === requestId.current) setLoadError(err.message || 'Could not reach the FINN API');
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }, [selectedHours]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const changeWindow = (hours: number) => {
    windowChosen.current = true;
    setWidenedFrom(null);
    setSelectedHours(hours);
    writeStored(WINDOW_KEY, hours);
  };

  const changeSource = (next: FeedSource) => {
    setSource(next);
    setCursorId(null);
    setExpandedItemId(null);
    writeStored(FEED_KEY, next);
  };

  const toggleFocusCategory = (category: string) => {
    const next = focusCategories.includes(category)
      ? focusCategories.filter((c) => c !== category)
      : [...focusCategories, category];
    setFocusCategories(next);
    writeStored(FOCUS_KEY, next);
  };

  const setItemStatus = (id: number, status: TriageStatus) => {
    setDigest((prev) => {
      if (!prev) return prev;
      const patch = (items: DigestItem[]) =>
        items.map((i) => (i.announcement.id === id ? { ...i, announcement: { ...i.announcement, status } } : i));
      return { ...prev, important_items: patch(prev.important_items), routine_items: patch(prev.routine_items) };
    });
  };

  const setLiveStatus = (id: number, status: TriageStatus) => {
    setLiveStatuses((prev) => {
      const updated = { ...prev, [id]: status };
      writeStored(LIVE_STATUS_KEY, updated);
      return updated;
    });
  };

  // Optimistic: the card moves immediately, and a failed save puts it back.
  const triage = async (item: DigestItem, status: TriageStatus) => {
    const { id, status: previous, company_ticker } = item.announcement;
    const next = previous === status ? 'new' : status;

    if (source === 'live') {
      setLiveStatus(id, next);
      if (next !== 'new') {
        toast({
          message: `${STATUS_LABEL[next]}: ${company_ticker}`,
          actionLabel: 'Undo',
          onAction: () => setLiveStatus(id, previous)
        });
      }
      return;
    }

    setItemStatus(id, next);
    try {
      await api.updateAnnouncementStatus(id, next);
      if (next !== 'new') {
        toast({
          message: `${STATUS_LABEL[next]}: ${company_ticker}`,
          actionLabel: 'Undo',
          onAction: () => {
            setItemStatus(id, previous);
            api.updateAnnouncementStatus(id, previous).catch(() => {
              setItemStatus(id, next);
              toast({ message: 'Could not undo that change', tone: 'error' });
            });
          }
        });
      }
    } catch (err: any) {
      setItemStatus(id, previous);
      toast({ message: err.message || 'Could not update the filing', tone: 'error' });
    }
  };

  const handleOpenExecutive = async (announcementId: number) => {
    try {
      setSelectedEnrichment(await api.getManagementEnrichment(announcementId));
    } catch (err: any) {
      toast({ message: err.message || 'No executive background available', tone: 'error' });
    }
  };

  // Live filings take the same card shape as demo ones, so both feeds share one triage flow.
  const liveItems = useMemo<DigestItem[]>(() => {
    const cutoff = Date.now() - selectedHours * 3600 * 1000;
    return (liveFeed?.filings || [])
      .filter((f) => new Date(f.filed_at).getTime() >= cutoff)
      .map((f) => ({
        announcement: {
          id: f.id,
          company_ticker: f.ticker,
          company_name: f.company_name,
          title: f.title,
          description: null,
          exchange: f.exchange,
          category: f.category,
          classification_confidence: f.confidence,
          classification_method: null,
          classification_explanation: null,
          filing_date: f.filed_at,
          source_url: f.pdf_url,
          document_url: null,
          is_demo: false,
          status: liveStatuses[f.id] || 'new',
          priority_score: f.priority_score
        },
        priority_score: f.priority_score,
        priority_explanation: '',
        summary: null,
        is_routine: false
      }));
  }, [liveFeed, liveStatuses, selectedHours]);

  const liveById = useMemo(() => new Map((liveFeed?.filings || []).map((f) => [f.id, f])), [liveFeed]);

  const { focusItems, routineItems, reviewedCount, filedCount } = useMemo(() => {
    const everything = source === 'live'
      ? liveItems
      : [...(digest?.important_items || []), ...(digest?.routine_items || [])];
    const all = everything.filter((i) => i.announcement.status !== 'dismissed');
    const byPriority = (a: DigestItem, b: DigestItem) => {
      const doneA = a.announcement.status === 'read' ? 1 : 0;
      const doneB = b.announcement.status === 'read' ? 1 : 0;
      return doneA - doneB
        || b.priority_score - a.priority_score
        || b.announcement.filing_date.localeCompare(a.announcement.filing_date);
    };
    const isFocus = (i: DigestItem) => focusCategories.includes(i.announcement.category || 'unclassified');
    const focus = all.filter(isFocus).sort(byPriority);
    return {
      focusItems: focus,
      routineItems: all.filter((i) => !isFocus(i)).sort(byPriority),
      reviewedCount: focus.filter((i) => i.announcement.status !== 'new').length,
      filedCount: everything.length
    };
  }, [source, liveItems, digest, focusCategories]);

  // A first visit shouldn't open on an empty screen: step out to the nearest window with something material.
  useEffect(() => {
    const feedReady = source === 'live'
      ? liveFeed !== null
      : !loading && digest !== null && loadedHours.current === selectedHours;
    if (windowChosen.current || !feedReady) return;
    if (focusItems.length > 0 || selectedHours >= 720) return;
    const next = WINDOWS[WINDOWS.findIndex((w) => w.val === selectedHours) + 1];
    setWidenedFrom((prev) => prev ?? selectedHours);
    setSelectedHours(next.val);
  }, [source, liveFeed, digest, focusItems.length, loading, selectedHours]);

  // Live closes when available, so this list always agrees with the chart above it.
  const priceRows = useMemo(() => {
    if (livePrices) {
      return livePrices.companies.map((c) => ({ ticker: c.ticker, price: c.latest_close, change: c.daily_change_pct }));
    }
    return (portfolio?.companies || []).map((c) => ({ ticker: c.ticker, price: c.latest_price, change: c.daily_change_pct }));
  }, [livePrices, portfolio]);

  const movers = useMemo(() => {
    return priceRows
      .filter((c) => c.change !== null && Math.abs(c.change) >= moveThreshold)
      .sort((a, b) => Math.abs(b.change ?? 0) - Math.abs(a.change ?? 0));
  }, [priceRows, moveThreshold]);

  // Keyboard triage: j/k move, s save, d done, x dismiss, Enter expands results
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector('[role="dialog"]')) return;
      const index = focusItems.findIndex((i) => i.announcement.id === cursorId);
      const current = focusItems[index];

      if (e.key === 'j' || e.key === 'k') {
        const next = e.key === 'j' ? Math.min(focusItems.length - 1, index + 1) : Math.max(0, index - 1);
        const nextItem = focusItems[next];
        if (!nextItem) return;
        setCursorId(nextItem.announcement.id);
        document.getElementById(`digest-${nextItem.announcement.id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else if (current && e.key === 's') {
        triage(current, 'saved');
      } else if (current && e.key === 'd') {
        triage(current, 'read');
      } else if (current && e.key === 'x') {
        triage(current, 'dismissed');
      } else if (current && e.key === 'Enter' && current.announcement.category === 'results') {
        setExpandedItemId((prev) => (prev === current.announcement.id ? null : current.announcement.id));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const formatDay = (date: Date, withYear = false) =>
    date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) });
  const periodLabel = source === 'live'
    ? (liveFeed ? `${formatDay(new Date(Date.now() - selectedHours * 3600 * 1000))} – ${formatDay(new Date(), true)}` : '')
    : (digest ? `${formatDay(new Date(digest.period_start))} – ${formatDay(new Date(digest.period_end), true)}` : '');
  const progress = focusItems.length ? (reviewedCount / focusItems.length) * 100 : 0;
  const feedLoading = source === 'live' ? liveLoading && !liveFeed : loading && !digest;
  const feedRefreshing = source === 'live' ? liveLoading : loading;
  const feedError = source === 'live' ? liveError : loadError;
  const feedLoaded = source === 'live' ? liveFeed !== null : digest !== null;
  const liveUpdated = liveFeed
    ? new Date(liveFeed.fetched_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div className="flex-1 flex flex-col bg-[#0a0d14]">
      <Header
        isDemo={source === 'demo'}
        dataFreshness={periodLabel ? `Window: ${periodLabel}` : 'Loading window'}
        onRefresh={() => {
          loadData();
          loadLiveFilings();
        }}
        isRefreshing={loading || liveLoading}
      />

      <main className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto w-full">
        {/* Briefing headline answers one question: what needs me today? */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-white tracking-tight">Daily Briefing</h1>
              <p className="text-xs text-slate-400 mt-0.5 truncate">{periodLabel || ' '}</p>
            </div>
            <div role="group" aria-label="Digest time window" className="flex items-center bg-[#111520] border border-[#1e2433] rounded-lg p-1 shrink-0 font-mono text-xs">
              {WINDOWS.map((tab) => (
                <button
                  key={tab.label}
                  onClick={() => changeWindow(tab.val)}
                  aria-pressed={selectedHours === tab.val}
                  className={`px-2.5 sm:px-3 py-1.5 rounded text-xs transition-colors ${
                    selectedHours === tab.val
                      ? 'bg-blue-600 text-white font-medium shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {!feedError && feedLoaded && (
            <div className="p-3.5 rounded-xl bg-[#111520] border border-[#1e2433]">
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <p className="text-sm text-slate-200">
                  <span className="text-lg font-bold text-white">{focusItems.length - reviewedCount}</span>
                  {' '}to review
                  <span className="text-slate-400"> · {routineItems.length} routine set aside · {filedCount} filed</span>
                </p>
                <button
                  onClick={() => setShowFocusEditor(!showFocusEditor)}
                  aria-expanded={showFocusEditor}
                  className="inline-flex items-center gap-1.5 text-[11px] font-mono text-blue-400 hover:text-blue-300 py-1"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  What matters to me
                </button>
              </div>
              <div
                role="progressbar"
                aria-label="Filings reviewed"
                aria-valuenow={reviewedCount}
                aria-valuemin={0}
                aria-valuemax={focusItems.length}
                className="h-1 mt-2.5 rounded-full bg-[#1e2433] overflow-hidden"
              >
                <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>

              {widenedFrom !== null && (
                <p className="mt-2.5 text-[11px] font-mono text-amber-400">
                  Nothing material in the last {WINDOWS.find((w) => w.val === widenedFrom)?.label}, so this shows the last {WINDOWS.find((w) => w.val === selectedHours)?.label}.
                </p>
              )}

              {showFocusEditor && (
                <div className="mt-3 pt-3 border-t border-[#1e2433] animate-fade-in">
                  <p className="text-[11px] text-slate-400 mb-2">
                    Selected categories appear in your briefing. Everything else collapses into routine.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_CATEGORIES.map((category) => {
                      const on = focusCategories.includes(category);
                      return (
                        <button
                          key={category}
                          onClick={() => toggleFocusCategory(category)}
                          aria-pressed={on}
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-mono border transition-colors ${
                            on
                              ? 'bg-blue-600/20 text-blue-300 border-blue-500/40'
                              : 'bg-[#0a0d14] text-slate-400 border-[#1e2433] hover:text-slate-200'
                          }`}
                        >
                          {on && <Check className="inline w-3 h-3 mr-1 -mt-0.5" />}
                          {categoryLabel(category)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        <PortfolioChart onCompanies={handleLivePrices} onPortfolioChange={loadLiveFilings} />

        {/* Unusual moves: the investor sets what "unusual" means */}
        {priceRows.length > 0 && (
          <section className="p-4 rounded-xl bg-[#111520] border border-[#1e2433] space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xs font-semibold text-white uppercase tracking-wider font-mono flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                Moves beyond ±{moveThreshold.toFixed(1)}%
              </h2>
              <span className="text-[11px] font-mono text-slate-400 shrink-0">{movers.length} of {priceRows.length}</span>
            </div>
            <p className={`text-[10px] font-mono ${livePrices ? 'text-slate-500' : 'text-amber-400'}`}>
              {livePrices
                ? `Latest daily close, ${new Date(livePrices.asOf).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
                : 'Demo prices from 2024: live prices are unavailable'}
            </p>
            <input
              type="range"
              min="0.25"
              max="10"
              step="0.25"
              value={moveThreshold}
              onChange={(e) => setMoveThreshold(parseFloat(e.target.value))}
              aria-label="Price move threshold in percent"
              className="finn-range"
            />
            {movers.length === 0 ? (
              <p className="text-xs text-slate-400">Nothing moved that far on the latest close. Drag left to widen the net.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {movers.map((c) => (
                  <button
                    key={c.ticker}
                    onClick={() => openQuickLook(c.ticker)}
                    className="p-2.5 rounded-lg bg-[#0a0d14] border border-[#1e2433] hover:border-blue-500/50 transition-colors text-left font-mono"
                  >
                    <div className="text-xs font-bold text-white truncate">{c.ticker}</div>
                    <div className="flex items-baseline justify-between gap-1.5 mt-0.5">
                      <span className="text-[11px] text-slate-400 truncate">{inr(c.price)}</span>
                      <span className={`text-[11px] font-semibold whitespace-nowrap ${changeTone(c.change)}`}>{signedPct(c.change, 1)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Prioritized digest feed */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xs font-semibold text-white uppercase tracking-wider font-mono flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-400" />
              What needs you
            </h2>
            <div role="group" aria-label="Filings source" className="flex items-center bg-[#111520] border border-[#1e2433] rounded-lg p-0.5 font-mono text-[11px] shrink-0">
              {(['live', 'demo'] as FeedSource[]).map((option) => (
                <button
                  key={option}
                  onClick={() => changeSource(option)}
                  aria-pressed={source === option}
                  className={`px-2.5 py-1.5 rounded capitalize transition-colors ${
                    source === option ? 'bg-blue-600 text-white font-medium' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {option === 'live' ? 'Live' : 'Demo'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap text-[10px] font-mono">
            <span className={source === 'live' ? 'text-slate-400' : 'text-amber-400'}>
              {source === 'live'
                ? `Real exchange filings${liveUpdated ? `, updated ${liveUpdated}` : ''}. Headlines come from the exchange; categories are automated and can be wrong. The filing is the source of truth.`
                : 'Sample filings from 2024, not real exchange data.'}
            </span>
            <span className="hidden md:inline text-slate-500">j/k move · s save · d done · x dismiss</span>
            <span className="md:hidden text-slate-500">Swipe: right save · left dismiss</span>
          </div>

          {source === 'live' && liveFeed && liveFeed.failed.length > 0 && (
            <p className="text-[11px] font-mono text-amber-400">The exchange didn&apos;t return filings for: {liveFeed.failed.join(', ')}.</p>
          )}
          {source === 'live' && (liveFeed?.is_stale || (liveError && liveFeed)) && (
            <p className="text-[11px] font-mono text-amber-400">Couldn&apos;t refresh from the exchange, so this is the last good copy.</p>
          )}

          {feedError && !feedLoaded ? (
            <div className="p-6 rounded-xl bg-[#111520] border border-rose-500/30 text-center space-y-3">
              <p className="text-xs text-rose-300 font-mono">
                {source === 'live' ? 'Live filings are unavailable' : 'Could not load the briefing'}: {feedError}
              </p>
              <div className="flex items-center justify-center gap-2">
                <button onClick={source === 'live' ? loadLiveFilings : loadData} className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium">
                  Try again
                </button>
                {source === 'live' && (
                  <button onClick={() => changeSource('demo')} className="px-3 py-2 rounded-lg border border-[#2a3449] text-slate-300 hover:text-white text-xs font-medium">
                    Show demo filings
                  </button>
                )}
              </div>
            </div>
          ) : feedLoading ? (
            <div className="space-y-3" aria-label="Loading filings">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-28 rounded-xl bg-[#111520] border border-[#1e2433] animate-pulse" />
              ))}
            </div>
          ) : feedLoaded && focusItems.length === 0 ? (
            <div className="p-8 rounded-xl bg-[#111520] border border-[#1e2433] text-center space-y-2">
              <p className="text-sm text-slate-200 font-medium">Nothing material in this window.</p>
              {selectedHours < 720 && (
                <button
                  onClick={() => changeWindow(WINDOWS[WINDOWS.findIndex((w) => w.val === selectedHours) + 1].val)}
                  className="text-xs text-blue-400 hover:text-blue-300 font-mono py-1"
                >
                  Look further back &rarr;
                </button>
              )}
            </div>
          ) : (
            <div className={`space-y-3 transition-opacity ${feedRefreshing ? 'opacity-50' : ''}`}>
              {focusItems.map((item) => (
                <DigestCard
                  key={item.announcement.id}
                  item={item}
                  live={source === 'live' ? liveById.get(item.announcement.id) : undefined}
                  aiEnabled={aiEnabled}
                  isCursor={cursorId === item.announcement.id}
                  isExpanded={expandedItemId === item.announcement.id}
                  onToggleExpand={() => setExpandedItemId(expandedItemId === item.announcement.id ? null : item.announcement.id)}
                  onTriage={(status) => triage(item, status)}
                  onOpenExecutive={() => handleOpenExecutive(item.announcement.id)}
                  onQuickLook={() => openQuickLook(item.announcement.company_ticker)}
                />
              ))}
            </div>
          )}

          {/* Routine announcements stay out of the way until asked for */}
          {routineItems.length > 0 && (
            <div className="pt-1">
              <button
                onClick={() => setShowRoutine(!showRoutine)}
                aria-expanded={showRoutine}
                className="w-full flex items-center justify-between p-3.5 rounded-xl bg-[#0a0d14] border border-[#1e2433] text-xs font-mono text-slate-400 hover:text-slate-200 hover:bg-[#111520] transition-all"
              >
                <span>Routine &amp; procedural ({routineItems.length})</span>
                {showRoutine ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showRoutine && (
                <ul className="mt-2 divide-y divide-[#1e2433] rounded-xl bg-[#111520] border border-[#1e2433] animate-fade-in">
                  {routineItems.map((item) => (
                    <li key={item.announcement.id} className="px-3.5 py-2.5 flex items-start gap-3 text-xs">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-[11px] font-mono">
                          <button onClick={() => openQuickLook(item.announcement.company_ticker)} className="font-bold text-slate-200 hover:text-blue-400">
                            {item.announcement.company_ticker}
                          </button>
                          <span className="text-slate-500 uppercase text-[10px]">{categoryLabel(item.announcement.category)}</span>
                        </div>
                        <p className="text-slate-400 text-[11px] mt-0.5 leading-relaxed">{item.announcement.title}</p>
                        {item.announcement.source_url && !item.announcement.is_demo && (
                          <a
                            href={item.announcement.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 mt-1 py-0.5 text-[11px] font-mono text-blue-400 hover:text-blue-300"
                          >
                            Open filing <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                      <button
                        onClick={() => triage(item, 'dismissed')}
                        aria-label={`Dismiss ${item.announcement.title}`}
                        className="p-2 -m-1 rounded text-slate-500 hover:text-rose-400 shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      </main>

      <ExecutiveEnrichmentModal
        data={selectedEnrichment}
        onClose={() => setSelectedEnrichment(null)}
      />
    </div>
  );
}

function DigestCard({
  item,
  live,
  aiEnabled,
  isCursor,
  isExpanded,
  onToggleExpand,
  onTriage,
  onOpenExecutive,
  onQuickLook
}: {
  item: DigestItem;
  live?: LiveFiling;
  aiEnabled: boolean;
  isCursor: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onTriage: (status: TriageStatus) => void;
  onOpenExecutive: () => void;
  onQuickLook: () => void;
}) {
  const ann = item.announcement;
  const isDone = ann.status === 'read';
  const isSaved = ann.status === 'saved';

  return (
    <SwipeRow
      right={{ label: isSaved ? 'Unsave' : 'Save', className: 'bg-amber-500/20 text-amber-300', onTrigger: () => onTriage('saved') }}
      left={{ label: 'Dismiss', className: 'bg-rose-500/20 text-rose-300', onTrigger: () => onTriage('dismissed') }}
    >
      <article
        id={`digest-${ann.id}`}
        className={`p-4 rounded-xl bg-[#111520] border transition-all space-y-2.5 ${
          isCursor ? 'border-blue-500' : 'border-[#1e2433] hover:border-slate-700'
        } ${isDone ? 'opacity-55' : ''}`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <button
              onClick={onQuickLook}
              className="text-xs font-bold text-white hover:text-blue-400 font-mono px-2 py-1 rounded bg-blue-500/10 border border-blue-500/30 transition-colors"
            >
              {ann.company_ticker}
            </button>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#1e2433] text-slate-300 uppercase">
              {categoryLabel(ann.category)}
            </span>
          </div>
          <span className="flex items-center gap-1 text-[11px] font-mono text-slate-400 shrink-0">
            <Clock className="w-3 h-3 text-slate-500" />
            {new Date(ann.filing_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
          </span>
        </div>

        {live?.insight && <AiHeadline insight={live.insight} aiEnabled />}

        <h3 className={`text-[13px] font-medium leading-relaxed ${isDone ? 'text-slate-400 line-through decoration-slate-600' : 'text-slate-100'}`}>
          {ann.title}
        </h3>
        {item.summary && item.summary !== ann.title && !isDone && (
          <p className="text-xs text-slate-400 leading-relaxed">{item.summary}</p>
        )}

        {isExpanded && <ResultsHeadline ticker={ann.company_ticker} />}

        {live && !isDone && (
          <FilingFirstCut category={ann.category} insight={live.insight} ticker={ann.company_ticker} pdfUrl={live.pdf_url} aiEnabled={aiEnabled} />
        )}

        {live?.announcement_id && live.pdf_url && (
          <FilingSummary announcementId={live.announcement_id} pdfUrl={live.pdf_url} insight={live.insight} />
        )}

        <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Real filings open from the summary row; older filings not yet stored keep a plain link */}
            {ann.source_url && !ann.is_demo && !live?.announcement_id && (
              <a
                href={ann.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-blue-600/15 text-blue-400 border border-blue-500/30 font-medium hover:bg-blue-600/25 transition-colors text-[11px]"
              >
                <FileText className="w-3.5 h-3.5" />
                Open filing
              </a>
            )}
            {ann.is_demo && ann.category === 'results' && (
              <button
                onClick={onToggleExpand}
                aria-expanded={isExpanded}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-blue-600/15 text-blue-400 border border-blue-500/30 font-medium hover:bg-blue-600/25 transition-colors text-[11px]"
              >
                <BarChart3 className="w-3.5 h-3.5" />
                {isExpanded ? 'Hide numbers' : 'Headline numbers'}
              </button>
            )}
            {ann.is_demo && ann.category === 'management_change' && (
              <button
                onClick={onOpenExecutive}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-purple-600/15 text-purple-400 border border-purple-500/30 font-medium hover:bg-purple-600/25 transition-colors text-[11px]"
              >
                <UserCheck className="w-3.5 h-3.5" />
                Who is this?
              </button>
            )}
            {/* Both links are keyed by NSE symbol, which a BSE-only company doesn't have */}
            {ann.exchange !== 'BSE' && (
              <>
                <a href={nseQuoteUrl(ann.company_ticker)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-400 hover:text-slate-200 px-1 py-1.5">
                  NSE <ExternalLink className="w-3 h-3" />
                </a>
                <a href={screenerDocumentsUrl(ann.company_ticker)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-400 hover:text-slate-200 px-1 py-1.5">
                  Screener <ExternalLink className="w-3 h-3" />
                </a>
              </>
            )}
            <Link href={`/research?ticker=${ann.company_ticker}`} className="text-[11px] font-mono text-slate-400 hover:text-slate-200 px-1 py-1.5">
              Research &rarr;
            </Link>
          </div>

          <div className="flex items-center gap-0.5 text-slate-400">
            <button onClick={() => onTriage('saved')} aria-label={isSaved ? 'Remove from saved' : 'Save filing'} aria-pressed={isSaved} title="Save (s)" className={`p-2 rounded hover:bg-[#1a2030] ${isSaved ? 'text-amber-400' : 'hover:text-amber-300'}`}>
              <Bookmark className={`w-4 h-4 ${isSaved ? 'fill-amber-400' : ''}`} />
            </button>
            <button onClick={() => onTriage('read')} aria-label={isDone ? 'Mark as not done' : 'Mark done'} aria-pressed={isDone} title="Done (d)" className={`p-2 rounded hover:bg-[#1a2030] ${isDone ? 'text-emerald-400' : 'hover:text-emerald-300'}`}>
              <Check className="w-4 h-4" />
            </button>
            <button onClick={() => onTriage('dismissed')} aria-label="Dismiss filing" title="Dismiss (x)" className="p-2 rounded hover:bg-[#1a2030] hover:text-rose-400">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </article>
    </SwipeRow>
  );
}
