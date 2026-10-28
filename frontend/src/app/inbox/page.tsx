'use client';

import React, { useState, useEffect } from 'react';
import { Header } from '@/components/Header';
import { api } from '@/lib/api';
import { Announcement, QuarterlyComparisonResponse, ManagementChangeEnrichment } from '@/types';
import {
  Inbox,
  Filter,
  CheckCircle,
  Bookmark,
  XCircle,
  ExternalLink,
  BarChart3,
  UserCheck,
  Clock,
  Sparkles,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import Link from 'next/link';
import { QuarterlyComparisonModal } from '@/components/QuarterlyComparisonModal';
import { ExecutiveEnrichmentModal } from '@/components/ExecutiveEnrichmentModal';

const ALL_CATEGORIES = [
  'All', 'results', 'M&A', 'fund_raise', 'management_change', 'litigation',
  'insider_trading', 'earnings_call', 'investor_meetings', 'credit_rating',
  'dividend', 'bonus_split', 'capex', 'press_release', 'postal_ballot',
  'agm_egm', 'pledging', 'unclassified'
];

export default function AnnouncementInboxPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [loading, setLoading] = useState(true);

  // Modals
  const [selectedResults, setSelectedResults] = useState<QuarterlyComparisonResponse | null>(null);
  const [selectedEnrichment, setSelectedEnrichment] = useState<ManagementChangeEnrichment | null>(null);

  const loadAnnouncements = async () => {
    try {
      setLoading(true);
      const params: any = { limit: 100 };
      if (selectedCategory !== 'All') params.category = selectedCategory;
      if (selectedStatus !== 'All') params.status = selectedStatus;
      const res = await api.getAnnouncements(params);
      setAnnouncements(res.announcements);
    } catch (err) {
      console.error('Failed to load announcements:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnnouncements();
  }, [selectedCategory, selectedStatus]);

  const handleUpdateStatus = async (id: number, status: 'new' | 'read' | 'saved' | 'dismissed') => {
    try {
      await api.updateAnnouncementStatus(id, status);
      setAnnouncements((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status } : a))
      );
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  const handleOpenResults = async (ticker: string) => {
    try {
      const res = await api.getFinancials(ticker);
      setSelectedResults(res);
    } catch (err) {
      console.error('Failed to load results:', err);
    }
  };

  const handleOpenExecutive = async (id: number) => {
    try {
      const res = await api.getManagementEnrichment(id);
      setSelectedEnrichment(res);
    } catch (err) {
      console.error('Failed to load executive background:', err);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-[#0a0d14]">
      <Header onRefresh={loadAnnouncements} isRefreshing={loading} />

      <main className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto w-full">
        {/* Title */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white tracking-tight">Corporate Announcements Inbox</h1>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/30">
                {announcements.length} FILINGS
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Deterministic 17-category classification pipeline with evidence snippets, priority materiality ranking, and full executive & results enrichment.
            </p>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5 bg-[#111520] border border-[#1e2433] rounded-lg p-1 text-xs font-mono">
            {['All', 'new', 'saved', 'read'].map((st) => (
              <button
                key={st}
                onClick={() => setSelectedStatus(st)}
                className={`px-3 py-1 rounded text-xs capitalize transition-colors ${
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

        {/* 17 Category Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          {ALL_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 rounded-lg text-xs font-mono transition-colors whitespace-nowrap border ${
                selectedCategory === cat
                  ? 'bg-blue-600/20 text-blue-400 border-blue-500/40 font-semibold'
                  : 'bg-[#111520] text-slate-400 border-[#1e2433] hover:text-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Announcement Feed */}
        {loading ? (
          <div className="p-8 rounded-xl bg-[#111520] border border-[#1e2433] text-center text-xs text-slate-400 font-mono animate-pulse">
            Retrieving corporate filings...
          </div>
        ) : announcements.length === 0 ? (
          <div className="p-8 rounded-xl bg-[#111520] border border-[#1e2433] text-center text-xs text-slate-400 font-mono">
            No filings found matching the selected filters.
          </div>
        ) : (
          <div className="space-y-3">
            {announcements.map((ann) => {
              const isResults = ann.category === 'results';
              const isManagement = ann.category === 'management_change';

              return (
                <div
                  key={ann.id}
                  className="p-4 rounded-xl bg-[#111520] border border-[#1e2433] hover:border-slate-700 transition-all space-y-3"
                >
                  {/* Top Bar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        href={`/research?ticker=${ann.company_ticker}`}
                        className="text-xs font-bold text-white hover:text-blue-400 font-mono px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/30 transition-colors"
                      >
                        {ann.company_ticker}
                      </Link>
                      <span className="text-xs text-slate-400">{ann.company_name}</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#1e2433] text-slate-300 uppercase">
                        {ann.category}
                      </span>
                      {ann.classification_confidence && (
                        <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
                          {(ann.classification_confidence * 100).toFixed(0)}% Conf
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-500" />
                        {new Date(ann.filing_date).toLocaleDateString('en-IN', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                  </div>

                  {/* Title & Description */}
                  <div>
                    <h4 className="text-xs font-medium text-slate-100 leading-relaxed">
                      {ann.title}
                    </h4>
                    {ann.description && (
                      <p className="text-xs text-slate-400 mt-1.5 leading-relaxed bg-[#0a0d14] p-2.5 rounded-lg border border-[#1e2433]">
                        {ann.description}
                      </p>
                    )}
                  </div>

                  {/* Actions & Enrichment */}
                  <div className="flex items-center justify-between pt-2 border-t border-[#1e2433]/60 text-xs">
                    <div className="flex items-center gap-2 flex-wrap">
                      {isResults && (
                        <button
                          onClick={() => handleOpenResults(ann.company_ticker)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-blue-600/15 text-blue-400 border border-blue-500/30 font-medium hover:bg-blue-600/25 transition-colors text-[11px]"
                        >
                          <BarChart3 className="w-3.5 h-3.5" />
                          View Results Table
                        </button>
                      )}
                      {isManagement && (
                        <button
                          onClick={() => handleOpenExecutive(ann.id)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-purple-600/15 text-purple-400 border border-purple-500/30 font-medium hover:bg-purple-600/25 transition-colors text-[11px]"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          Executive Background
                        </button>
                      )}
                    </div>

                    {/* Quick status actions */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleUpdateStatus(ann.id, 'saved')}
                        className={`p-1.5 rounded hover:bg-[#1a2030] transition-colors ${
                          ann.status === 'saved' ? 'text-amber-400' : 'text-slate-400'
                        }`}
                        title="Save filing"
                      >
                        <Bookmark className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleUpdateStatus(ann.id, 'read')}
                        className={`p-1.5 rounded hover:bg-[#1a2030] transition-colors ${
                          ann.status === 'read' ? 'text-emerald-400' : 'text-slate-400'
                        }`}
                        title="Mark as read"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                      </button>
                      {ann.source_url && (
                        <a
                          href={ann.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded text-slate-400 hover:text-blue-400 hover:bg-[#1a2030] transition-colors"
                          title="Open original filing"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Modals */}
      <QuarterlyComparisonModal
        data={selectedResults}
        onClose={() => setSelectedResults(null)}
      />
      <ExecutiveEnrichmentModal
        data={selectedEnrichment}
        onClose={() => setSelectedEnrichment(null)}
      />
    </div>
  );
}

