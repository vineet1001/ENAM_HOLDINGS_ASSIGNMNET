'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Header } from '@/components/Header';
import { api } from '@/lib/api';
import { Announcement, ManagementChangeEnrichment } from '@/types';
import {
  CheckCircle,
  Bookmark,
  ExternalLink,
  BarChart3,
  UserCheck,
  Clock,
  Search
} from 'lucide-react';
import { ExecutiveEnrichmentModal } from '@/components/ExecutiveEnrichmentModal';
import { AiHeadline, FilingFirstCut, FilingSummary } from '@/components/FilingAi';
import { ResultsHeadline } from '@/components/ResultsHeadline';
import { SwipeRow } from '@/components/SwipeRow';
import { useQuickLook } from '@/components/QuickLook';
import { useToast } from '@/components/Toast';
import { ALL_CATEGORIES, categoryLabel, nseQuoteUrl } from '@/lib/ui';

const STATUS_FILTERS = ['All', 'new', 'saved', 'read'];

export default function AnnouncementInboxPage() {
  const toast = useToast();
  const openQuickLook = useQuickLook();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showDemo, setShowDemo] = useState(false);
  const [activeTickers, setActiveTickers] = useState<Set<string> | null>(null);
  const [aiEnabled, setAiEnabled] = useState(false);

  const [selectedEnrichment, setSelectedEnrichment] = useState<ManagementChangeEnrichment | null>(null);

  // Everything loads once so filters respond instantly and chips can show live counts.
  const loadAnnouncements = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      // Reading the live feed also stores any new filings, so they're in the list below.
      const live = await api.getLiveFilings().catch(() => null);
      setActiveTickers(live ? new Set(live.filings.map((f) => f.ticker)) : null);
      // Fetched separately so a long list of real filings can't push the sample ones past the limit.
      const [real, demo] = await Promise.all([
        api.getAnnouncements({ limit: 300, is_demo: false }),
        api.getAnnouncements({ limit: 100, is_demo: true }),
      ]);
      setAnnouncements([...real.announcements, ...demo.announcements]);
    } catch (err: any) {
      setLoadError(err.message || 'Could not reach the FINN API');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnnouncements();
    api.getAiStatus().then((status) => setAiEnabled(status.configured)).catch(() => {});
  }, []);

  const setLocalStatus = (id: number, status: Announcement['status']) => {
    setAnnouncements((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
  };

  const handleUpdateStatus = async (ann: Announcement, status: Announcement['status']) => {
    const previous = ann.status;
    const next = previous === status ? 'new' : status;
    setLocalStatus(ann.id, next);
    try {
      await api.updateAnnouncementStatus(ann.id, next);
      if (next !== 'new') {
        toast({
          message: `${next === 'saved' ? 'Saved' : 'Marked read'}: ${ann.company_ticker}`,
          actionLabel: 'Undo',
          onAction: () => {
            setLocalStatus(ann.id, previous);
            api.updateAnnouncementStatus(ann.id, previous).catch(() => {
              setLocalStatus(ann.id, next);
              toast({ message: 'Could not undo that change', tone: 'error' });
            });
          }
        });
      }
    } catch (err: any) {
      setLocalStatus(ann.id, previous);
      toast({ message: err.message || 'Could not update the filing', tone: 'error' });
    }
  };

  const handleOpenExecutive = async (id: number) => {
    try {
      setSelectedEnrichment(await api.getManagementEnrichment(id));
    } catch (err: any) {
      toast({ message: err.message || 'No executive background available', tone: 'error' });
    }
  };

  // Counts honour the status and text filters, so a chip never promises rows it can't show.
  const { visible, categoryCounts, statusScoped } = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    const scoped = announcements.filter((a) => {
      // Real filings and sample filings are never mixed. Real ones follow the active portfolio.
      if (a.is_demo !== showDemo) return false;
      if (!a.is_demo && activeTickers && !activeTickers.has(a.company_ticker)) return false;
      if (a.status === 'dismissed' && selectedStatus !== 'dismissed') return false;
      if (selectedStatus !== 'All' && a.status !== selectedStatus) return false;
      if (!term) return true;
      return [a.company_ticker, a.company_name, a.title].some((field) => field.toLowerCase().includes(term));
    });
    const counts: Record<string, number> = {};
    scoped.forEach((a) => {
      const category = a.category || 'unclassified';
      counts[category] = (counts[category] || 0) + 1;
    });
    return {
      statusScoped: scoped,
      categoryCounts: counts,
      visible: selectedCategory === 'All' ? scoped : scoped.filter((a) => (a.category || 'unclassified') === selectedCategory)
    };
  }, [announcements, selectedCategory, selectedStatus, searchQuery, showDemo, activeTickers]);

  const clearFilters = () => {
    setSelectedCategory('All');
    setSelectedStatus('All');
    setSearchQuery('');
  };

  return (
    <div className="flex-1 flex flex-col bg-[#0a0d14]">
      <Header
        isDemo={showDemo}
        dataFreshness={showDemo ? 'Sample filings from 2024' : 'Real exchange filings, last 30 days'}
        onRefresh={loadAnnouncements}
        isRefreshing={loading}
      />

      <main className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto w-full">
        {/* Title */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white tracking-tight">Filings Inbox</h1>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/30">
              {visible.length} of {statusScoped.length}
            </span>
            <label className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-[#1e2433] bg-[#111520] text-[11px] font-mono text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={showDemo}
                onChange={(e) => {
                  setShowDemo(e.target.checked);
                  setSelectedCategory('All');
                }}
                className="accent-blue-500"
              />
              Show demo filings
            </label>
          </div>

          {/* Status Filter */}
          <div role="group" aria-label="Filter by status" className="flex items-center gap-1 bg-[#111520] border border-[#1e2433] rounded-lg p-1 text-xs font-mono self-start">
            {STATUS_FILTERS.map((st) => (
              <button
                key={st}
                onClick={() => setSelectedStatus(st)}
                aria-pressed={selectedStatus === st}
                className={`px-3 py-1.5 rounded text-xs capitalize transition-colors ${
                  selectedStatus === st
                    ? 'bg-blue-600 text-white font-medium shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter by company or filing title..."
            aria-label="Filter filings by company or title"
            className="w-full bg-[#111520] border border-[#1e2433] rounded-lg pl-8 pr-3 py-2 text-base md:text-xs text-slate-200 placeholder-slate-400 focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Category chips: empty categories drop out of the way */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 -mx-4 px-4 md:mx-0 md:px-0">
          {['All', ...ALL_CATEGORIES.filter((cat) => categoryCounts[cat] || selectedCategory === cat)].map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              aria-pressed={selectedCategory === cat}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors whitespace-nowrap border ${
                selectedCategory === cat
                  ? 'bg-blue-600/20 text-blue-400 border-blue-500/40 font-semibold'
                  : 'bg-[#111520] text-slate-400 border-[#1e2433] hover:text-slate-200'
              }`}
            >
              {cat === 'All' ? 'All' : categoryLabel(cat)}
              <span className="ml-1.5 opacity-70">{cat === 'All' ? statusScoped.length : categoryCounts[cat] || 0}</span>
            </button>
          ))}
        </div>

        {/* Announcement Feed */}
        {loadError ? (
          <div className="p-6 rounded-xl bg-[#111520] border border-rose-500/30 text-center space-y-3">
            <p className="text-xs text-rose-300 font-mono">Could not load filings: {loadError}</p>
            <button onClick={loadAnnouncements} className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium">
              Try again
            </button>
          </div>
        ) : loading && announcements.length === 0 ? (
          <div className="space-y-3" aria-label="Loading filings">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-24 rounded-xl bg-[#111520] border border-[#1e2433] animate-pulse" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="p-8 rounded-xl bg-[#111520] border border-[#1e2433] text-center space-y-2">
            <p className="text-xs text-slate-300">No filings match these filters.</p>
            <button onClick={clearFilters} className="text-xs text-blue-400 hover:text-blue-300 font-mono py-1">
              Clear filters
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {visible.map((ann) => {
              // These two read seeded data, so they only belong on demo filings.
              const isResults = ann.category === 'results' && !ann.insight?.results;
              const isManagement = ann.is_demo && ann.category === 'management_change';
              const isExpanded = expandedId === ann.id;
              const isRead = ann.status === 'read';
              const isSaved = ann.status === 'saved';

              return (
                <SwipeRow
                  key={ann.id}
                  right={{ label: isSaved ? 'Unsave' : 'Save', className: 'bg-amber-500/20 text-amber-300', onTrigger: () => handleUpdateStatus(ann, 'saved') }}
                  left={{ label: isRead ? 'Unread' : 'Read', className: 'bg-emerald-500/20 text-emerald-300', onTrigger: () => handleUpdateStatus(ann, 'read') }}
                >
                  <article className={`p-4 rounded-xl bg-[#111520] border border-[#1e2433] hover:border-slate-700 transition-all space-y-2.5 ${isRead ? 'opacity-60' : ''}`}>
                    {/* Top Bar */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <button
                          onClick={() => openQuickLook(ann.company_ticker)}
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
                        {new Date(ann.filing_date).toLocaleDateString('en-IN', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                    </div>

                    {/* Title & Description */}
                    <div>
                      <h4 className="text-[13px] font-medium text-slate-100 leading-relaxed">{ann.title}</h4>
                      {ann.description && (
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">{ann.description}</p>
                      )}
                    </div>

                    {isExpanded && <ResultsHeadline ticker={ann.company_ticker} />}

                    {!ann.is_demo && (
                      <>
                        {ann.insight && <AiHeadline insight={ann.insight} aiEnabled={aiEnabled} />}
                        {/* Results without the filing's own table stay behind the button, so the list loads quickly */}
                        {(ann.category !== 'results' || ann.insight?.results) && (
                          <FilingFirstCut
                            category={ann.category}
                            insight={ann.insight ?? null}
                            ticker={ann.company_ticker}
                            pdfUrl={ann.source_url}
                            aiEnabled={aiEnabled}
                          />
                        )}
                      </>
                    )}

                    {!ann.is_demo && ann.source_url && (
                      <FilingSummary announcementId={ann.id} pdfUrl={ann.source_url} insight={ann.insight ?? null} />
                    )}

                    {/* Actions & Enrichment */}
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2 flex-wrap">
                        {isResults && (
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : ann.id)}
                            aria-expanded={isExpanded}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-blue-600/15 text-blue-400 border border-blue-500/30 font-medium hover:bg-blue-600/25 transition-colors text-[11px]"
                          >
                            <BarChart3 className="w-3.5 h-3.5" />
                            {isExpanded ? 'Hide numbers' : 'Headline numbers'}
                          </button>
                        )}
                        {isManagement && (
                          <button
                            onClick={() => handleOpenExecutive(ann.id)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-purple-600/15 text-purple-400 border border-purple-500/30 font-medium hover:bg-purple-600/25 transition-colors text-[11px]"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            Who is this?
                          </button>
                        )}
                      </div>

                      {/* Quick status actions */}
                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={() => handleUpdateStatus(ann, 'saved')}
                          aria-pressed={isSaved}
                          aria-label={isSaved ? 'Remove from saved' : 'Save filing'}
                          title="Save filing"
                          className={`p-2 rounded hover:bg-[#1a2030] transition-colors ${isSaved ? 'text-amber-400' : 'text-slate-400'}`}
                        >
                          <Bookmark className={`w-4 h-4 ${isSaved ? 'fill-amber-400' : ''}`} />
                        </button>
                        <button
                          onClick={() => handleUpdateStatus(ann, 'read')}
                          aria-pressed={isRead}
                          aria-label={isRead ? 'Mark as unread' : 'Mark as read'}
                          title="Mark as read"
                          className={`p-2 rounded hover:bg-[#1a2030] transition-colors ${isRead ? 'text-emerald-400' : 'text-slate-400'}`}
                        >
                          <CheckCircle className="w-4 h-4" />
                        </button>
                        {/* Demo filings have placeholder URLs, so they point to the company's live NSE page */}
                        {ann.is_demo && (
                          <a
                            href={nseQuoteUrl(ann.company_ticker)}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Open ${ann.company_ticker} on NSE`}
                            title={`Open ${ann.company_ticker} on NSE`}
                            className="p-2 rounded text-slate-400 hover:text-blue-400 hover:bg-[#1a2030] transition-colors"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                    </div>
                  </article>
                </SwipeRow>
              );
            })}
          </div>
        )}
      </main>

      <ExecutiveEnrichmentModal
        data={selectedEnrichment}
        onClose={() => setSelectedEnrichment(null)}
      />
    </div>
  );
}
