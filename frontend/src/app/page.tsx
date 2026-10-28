'use client';

import React, { useState, useEffect } from 'react';
import { Header } from '@/components/Header';
import { api } from '@/lib/api';
import {
  DigestResponse,
  DigestItem,
  PortfolioResponse,
  QuarterlyComparisonResponse,
  ManagementChangeEnrichment
} from '@/types';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  FileText,
  Clock,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Sparkles,
  BarChart3,
  Bookmark,
  CheckCircle,
  Eye,
  ShieldCheck,
  UserCheck
} from 'lucide-react';
import Link from 'next/link';
import { QuarterlyComparisonModal } from '@/components/QuarterlyComparisonModal';
import { ExecutiveEnrichmentModal } from '@/components/ExecutiveEnrichmentModal';

export default function DailyBriefingPage() {
  const [digest, setDigest] = useState<DigestResponse | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedHours, setSelectedHours] = useState(168); // 7 days window for demo
  const [showRoutine, setShowRoutine] = useState(false);
  const [expandedItemId, setExpandedItemId] = useState<number | null>(null);

  // Modals state
  const [selectedResults, setSelectedResults] = useState<QuarterlyComparisonResponse | null>(null);
  const [selectedEnrichment, setSelectedEnrichment] = useState<ManagementChangeEnrichment | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [dig, port] = await Promise.all([
        api.getDigest(selectedHours),
        api.getPortfolio(),
      ]);
      setDigest(dig);
      setPortfolio(port);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedHours]);

  const handleOpenResults = async (ticker: string) => {
    try {
      const res = await api.getFinancials(ticker);
      setSelectedResults(res);
    } catch (err) {
      console.error('Failed to fetch financials:', err);
    }
  };

  const handleOpenExecutive = async (announcementId: number) => {
    try {
      const res = await api.getManagementEnrichment(announcementId);
      setSelectedEnrichment(res);
    } catch (err) {
      console.error('Failed to fetch executive enrichment:', err);
    }
  };

  // Find unusual moves from portfolio (>3% move)
  const unusualMoves = portfolio?.companies.filter(
    (c) => c.daily_change_pct && Math.abs(c.daily_change_pct) >= 3.0
  ) || [];

  return (
    <div className="flex-1 flex flex-col bg-[#0a0d14]">
      <Header
        isDemo={digest?.is_demo ?? true}
        dataFreshness="Data window: Oct–Dec 2024"
        onRefresh={loadData}
        isRefreshing={loading}
      />

      <main className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto w-full">
        {/* Top Intelligence Banner */}
        <div className="border border-[#1e2433] rounded-xl bg-gradient-to-r from-[#111520] via-[#0f1422] to-[#111520] p-5 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-white tracking-tight">Institutional Daily Briefing</h1>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/30">
                  PUSH MODE
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 max-w-2xl">
                Proactive intelligence surveillance across 18 portfolio holdings and 5 ad-hoc research tickers. Filtered for high-materiality filings, unusual trading volume, and executive changes.
              </p>
            </div>

            {/* Time Window Switcher */}
            <div className="flex items-center bg-[#0a0d14] border border-[#1e2433] rounded-lg p-1 self-start sm:self-auto shrink-0 font-mono text-xs">
              {[
                { label: '24h', val: 24 },
                { label: '3d', val: 72 },
                { label: '7d', val: 168 },
              ].map((tab) => (
                <button
                  key={tab.label}
                  onClick={() => setSelectedHours(tab.val)}
                  className={`px-3 py-1 rounded text-xs transition-colors ${
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

          {/* Quick Metrics KPI Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-[#1e2433]/80">
            <div className="p-2.5 rounded-lg bg-[#0a0d14]/70 border border-[#1e2433]">
              <span className="text-[11px] text-slate-400 font-mono">Portfolio Companies</span>
              <div className="text-base font-bold text-white font-mono mt-0.5">
                {portfolio?.total || 18} tracked
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-[#0a0d14]/70 border border-[#1e2433]">
              <span className="text-[11px] text-slate-400 font-mono">Filings in Window</span>
              <div className="text-base font-bold text-white font-mono mt-0.5">
                {digest?.total_announcements || 0} filings
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-[#0a0d14]/70 border border-[#1e2433]">
              <span className="text-[11px] text-slate-400 font-mono">High Materiality</span>
              <div className="text-base font-bold text-amber-400 font-mono mt-0.5">
                {digest?.important_items.length || 0} flagged
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-[#0a0d14]/70 border border-[#1e2433]">
              <span className="text-[11px] text-slate-400 font-mono">Unusual Movers</span>
              <div className="text-base font-bold text-rose-400 font-mono mt-0.5">
                {unusualMoves.length} &gt;3% moves
              </div>
            </div>
          </div>
        </div>

        {/* Unusual Market Moves Widget */}
        {unusualMoves.length > 0 && (
          <div className="p-4 rounded-xl bg-[#111520] border border-[#1e2433] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <h3 className="text-xs font-semibold text-white uppercase tracking-wider font-mono">
                  Unusual Price Movements Detected (&gt;3%)
                </h3>
              </div>
              <span className="text-[11px] text-slate-400 font-mono">Trigger Type A Alert</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {unusualMoves.map((c) => {
                const isGain = (c.daily_change_pct ?? 0) >= 0;
                return (
                  <Link
                    key={c.ticker}
                    href={`/research?ticker=${c.ticker}`}
                    className="p-3 rounded-lg bg-[#0a0d14] border border-[#1e2433] hover:border-blue-500/50 transition-all flex items-center justify-between group"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white group-hover:text-blue-400 transition-colors font-mono">
                          {c.ticker}
                        </span>
                        <span className="text-[10px] text-slate-400">{c.sector}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                        Close: ₹{c.latest_price?.toLocaleString()}
                      </div>
                    </div>
                    <div className={`text-xs font-bold font-mono px-2 py-1 rounded ${
                      isGain ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                    }`}>
                      {isGain ? '+' : ''}{c.daily_change_pct?.toFixed(2)}%
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Prioritized Daily Digest Feed */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-400" />
              <h2 className="text-sm font-semibold text-white uppercase tracking-wider font-mono">
                Prioritized Filings Digest ({digest?.important_items.length || 0} Material Items)
              </h2>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              Scored by Materiality Weight + Recency
            </span>
          </div>

          {loading ? (
            <div className="p-8 rounded-xl bg-[#111520] border border-[#1e2433] text-center text-xs text-slate-400 font-mono animate-pulse">
              Scoring announcements across portfolio universe...
            </div>
          ) : digest?.important_items.length === 0 ? (
            <div className="p-8 rounded-xl bg-[#111520] border border-[#1e2433] text-center text-xs text-slate-400">
              No high-materiality filings in this time window.
            </div>
          ) : (
            <div className="space-y-3">
              {digest?.important_items.map((item) => {
                const ann = item.announcement;
                const isExpanded = expandedItemId === ann.id;
                const isResults = ann.category === 'results';
                const isManagement = ann.category === 'management_change';

                return (
                  <div
                    key={ann.id}
                    className="p-4 rounded-xl bg-[#111520] border border-[#1e2433] hover:border-slate-700 transition-all space-y-3"
                  >
                    {/* Item Top Bar */}
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
                      </div>

                      <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400 shrink-0">
                        <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[10px]">
                          Score: {(item.priority_score * 100).toFixed(0)}/100
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-500" />
                          {new Date(ann.filing_date).toLocaleDateString('en-IN', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      </div>
                    </div>

                    {/* Announcement Title & Summary */}
                    <div>
                      <h4 className="text-xs font-medium text-slate-100 leading-relaxed">
                        {ann.title}
                      </h4>
                      {item.summary && (
                        <p className="text-xs text-slate-400 mt-1.5 leading-relaxed bg-[#0a0d14] p-2.5 rounded-lg border border-[#1e2433]">
                          {item.summary}
                        </p>
                      )}
                    </div>

                    {/* Materiality Explanation */}
                    <div className="text-[10px] text-slate-400 font-mono flex items-center justify-between pt-1">
                      <span>Reason: {item.priority_explanation}</span>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center justify-between pt-2 border-t border-[#1e2433]/60 text-xs">
                      <div className="flex items-center gap-2">
                        {isResults && (
                          <button
                            onClick={() => handleOpenResults(ann.company_ticker)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-blue-600/15 text-blue-400 border border-blue-500/30 font-medium hover:bg-blue-600/25 transition-colors text-[11px]"
                          >
                            <BarChart3 className="w-3.5 h-3.5" />
                            View QoQ & YoY Results
                          </button>
                        )}
                        {isManagement && (
                          <button
                            onClick={() => handleOpenExecutive(ann.id)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-purple-600/15 text-purple-400 border border-purple-500/30 font-medium hover:bg-purple-600/25 transition-colors text-[11px]"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            Executive Background Card
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-slate-400">
                        {ann.source_url && (
                          <a
                            href={ann.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-blue-400 flex items-center gap-1 text-[11px] font-mono"
                          >
                            Filing Link
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                        <Link
                          href={`/research?ticker=${ann.company_ticker}`}
                          className="hover:text-slate-200 text-[11px] font-mono"
                        >
                          Research &rarr;
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Routine Announcements Accordion (Collapsed by Default) */}
          {digest?.routine_items && digest.routine_items.length > 0 && (
            <div className="pt-2">
              <button
                onClick={() => setShowRoutine(!showRoutine)}
                className="w-full flex items-center justify-between p-3.5 rounded-xl bg-[#0a0d14] border border-[#1e2433] text-xs font-mono text-slate-400 hover:text-slate-200 hover:bg-[#111520] transition-all"
              >
                <span>Routine & Procedural Announcements ({digest.routine_items.length} collapsed)</span>
                {showRoutine ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showRoutine && (
                <div className="mt-3 space-y-2 pl-3 border-l-2 border-[#1e2433]">
                  {digest.routine_items.map((item) => (
                    <div
                      key={item.announcement.id}
                      className="p-3 rounded-lg bg-[#111520] border border-[#1e2433] text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-300 font-mono">
                          {item.announcement.company_ticker}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {new Date(item.announcement.filing_date).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-slate-400 text-[11px]">{item.announcement.title}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
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
