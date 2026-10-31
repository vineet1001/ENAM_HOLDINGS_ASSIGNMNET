'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { api } from '@/lib/api';
import {
  AlertRule,
  AlertEvent,
  QuarterlyComparisonResponse,
  ManagementChangeEnrichment
} from '@/types';
import {
  BellRing,
  Plus,
  Play,
  CheckCircle2,
  Trash2,
  Edit2,
  Clock,
  ExternalLink,
  Globe,
  FileText,
  TrendingUp,
  Newspaper,
  ShieldCheck,
  Pause,
  RefreshCw,
  Search,
  ArrowUpRight,
  Activity,
  Layers,
  ChevronDown
} from 'lucide-react';
import { AlertRuleModal } from '@/components/AlertRuleModal';
import { QuarterlyComparisonModal } from '@/components/QuarterlyComparisonModal';
import { ExecutiveEnrichmentModal } from '@/components/ExecutiveEnrichmentModal';

export default function AlertsCentrePage() {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);
  const [evalResult, setEvalResult] = useState<string | null>(null);

  // Real-time polling state
  const [autoSync, setAutoSync] = useState(true);
  const [pollIntervalSeconds, setPollIntervalSeconds] = useState(10);
  const [lastSyncTime, setLastSyncTime] = useState<Date>(new Date());
  const [isSilentSyncing, setIsSilentSyncing] = useState(false);

  // Filters
  const [filterTicker, setFilterTicker] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'PENDING' | 'ACK'>('ALL');
  const [filterRuleType, setFilterRuleType] = useState<string>('ALL');

  // Rule Creation / Editing Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null);

  // Deep-dive Modals
  const [quarterlyModalData, setQuarterlyModalData] = useState<QuarterlyComparisonResponse | null>(null);
  const [enrichmentModalData, setEnrichmentModalData] = useState<ManagementChangeEnrichment | null>(null);
  const [loadingModal, setLoadingModal] = useState(false);

  // Initial load
  const loadAlerts = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      else setIsSilentSyncing(true);

      const [rulesRes, eventsRes] = await Promise.all([
        api.getAlertRules(),
        api.getAlertEvents({ limit: 100 }),
      ]);
      setRules(rulesRes.rules);
      setEvents(eventsRes.events);
      setLastSyncTime(new Date());
    } catch (err) {
      console.error('Failed to load alerts data:', err);
    } finally {
      if (!silent) setLoading(false);
      setIsSilentSyncing(false);
    }
  };

  useEffect(() => {
    loadAlerts(false);
  }, []);

  // Real-time polling effect
  useEffect(() => {
    if (!autoSync || pollIntervalSeconds <= 0) return;

    const interval = setInterval(() => {
      loadAlerts(true);
    }, pollIntervalSeconds * 1000);

    return () => clearInterval(interval);
  }, [autoSync, pollIntervalSeconds]);

  const handleEvaluate = async () => {
    try {
      setEvaluating(true);
      setEvalResult(null);
      const res = await api.evaluateAlerts();
      setEvalResult(
        `Evaluation complete: ${res.total_triggered} new alerts triggered (${res.price_alerts_triggered} price, ${res.volume_alerts_triggered} volume, ${res.announcement_alerts_triggered} announcement).`
      );
      await loadAlerts(false);
    } catch (err: any) {
      alert(err.message || 'Alert evaluation failed');
    } finally {
      setEvaluating(false);
    }
  };

  const handleToggleRule = async (rule: AlertRule) => {
    try {
      await api.updateAlertRule(rule.id, { is_enabled: !rule.is_enabled });
      setRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, is_enabled: !r.is_enabled } : r))
      );
    } catch (err) {
      console.error('Failed to toggle rule:', err);
    }
  };

  const handleDeleteRule = async (id: number) => {
    if (!confirm('Are you sure you want to delete this alert rule?')) return;
    try {
      await api.deleteAlertRule(id);
      setRules((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      console.error('Failed to delete rule:', err);
    }
  };

  const handleAcknowledgeEvent = async (id: number) => {
    try {
      await api.acknowledgeAlert(id);
      setEvents((prev) =>
        prev.map((e) => (e.id === id ? { ...e, is_acknowledged: true, acknowledged_at: new Date().toISOString() } : e))
      );
    } catch (err) {
      console.error('Failed to acknowledge event:', err);
    }
  };

  const handleSaveRule = async (ruleData: Partial<AlertRule>) => {
    if (editingRule) {
      await api.updateAlertRule(editingRule.id, ruleData);
    } else {
      await api.createAlertRule(ruleData);
    }
    await loadAlerts(false);
  };

  // Inspect quarterly comparison from alert
  const handleOpenQuarterly = async (ticker: string) => {
    try {
      setLoadingModal(true);
      const res = await api.getFinancials(ticker);
      setQuarterlyModalData(res);
    } catch (err: any) {
      alert(`Could not load quarterly financials for ${ticker}: ${err.message}`);
    } finally {
      setLoadingModal(false);
    }
  };

  // Inspect executive enrichment from alert
  const handleOpenExecutive = async (announcementId: number) => {
    try {
      setLoadingModal(true);
      const res = await api.getManagementEnrichment(announcementId);
      setEnrichmentModalData(res);
    } catch (err: any) {
      alert(`Could not load executive background: ${err.message}`);
    } finally {
      setLoadingModal(false);
    }
  };

  // Filter events
  const uniqueTickers = Array.from(new Set(events.map((e) => e.company_ticker))).sort();

  const filteredEvents = events.filter((e) => {
    if (filterTicker !== 'ALL' && e.company_ticker !== filterTicker) return false;
    if (filterStatus === 'PENDING' && e.is_acknowledged) return false;
    if (filterStatus === 'ACK' && !e.is_acknowledged) return false;
    if (filterRuleType !== 'ALL' && e.rule_type !== filterRuleType) return false;
    return true;
  });

  return (
    <div className="flex-1 flex flex-col bg-[#0a0d14]">
      <Header onRefresh={() => loadAlerts(false)} isRefreshing={loading} />

      <main className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto w-full">
        {/* Top Header & Actions */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[#1e2433]">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-white tracking-tight">Alerts Centre</h1>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/30">
                {rules.length} ACTIVE RULES
              </span>
              <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30">
                <span className="relative flex h-2 w-2">
                  {autoSync && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  )}
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${autoSync ? 'bg-emerald-500' : 'bg-slate-500'}`}></span>
                </span>
                <span className="text-[10px] font-mono font-semibold text-emerald-400 uppercase tracking-wide">
                  {autoSync ? 'Live Auto-Sync Active' : 'Polling Paused'}
                </span>
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Deterministic threshold evaluation across price moves, unusual volume multiples, and announcement subscriptions with real-time news & primary evidence linking.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Real-time controls */}
            <div className="flex items-center gap-1.5 bg-[#111520] border border-[#1e2433] rounded-lg p-1 text-[11px] font-mono">
              <button
                onClick={() => setAutoSync(!autoSync)}
                title={autoSync ? 'Pause live auto-sync' : 'Resume live auto-sync'}
                className={`px-2 py-1 rounded flex items-center gap-1 transition-colors ${
                  autoSync ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'text-slate-400 hover:text-white'
                }`}
              >
                {autoSync ? <Activity className="w-3 h-3 text-emerald-400 animate-pulse" /> : <Pause className="w-3 h-3" />}
                <span>{autoSync ? 'Live' : 'Paused'}</span>
              </button>
              
              <select
                value={pollIntervalSeconds}
                onChange={(e) => setPollIntervalSeconds(Number(e.target.value))}
                disabled={!autoSync}
                className="bg-[#0a0d14] text-slate-300 border border-[#1e2433] rounded px-1.5 py-0.5 text-[11px] focus:outline-none"
              >
                <option value={5}>Every 5s</option>
                <option value={10}>Every 10s</option>
                <option value={30}>Every 30s</option>
                <option value={60}>Every 60s</option>
              </select>

              <button
                onClick={() => loadAlerts(false)}
                title="Refresh manually"
                className="p-1 text-slate-400 hover:text-white rounded"
              >
                <RefreshCw className={`w-3 h-3 ${isSilentSyncing ? 'animate-spin text-blue-400' : ''}`} />
              </button>
            </div>

            <button
              onClick={handleEvaluate}
              disabled={evaluating}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors font-mono disabled:opacity-50"
            >
              <Play className={`w-3.5 h-3.5 ${evaluating ? 'animate-spin' : ''}`} />
              {evaluating ? 'Evaluating...' : 'Evaluate Alerts'}
            </button>

            <button
              onClick={() => {
                setEditingRule(null);
                setIsModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors font-mono"
            >
              <Plus className="w-4 h-4" />
              New Rule
            </button>
          </div>
        </div>

        {/* Real-time Status Notice */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-slate-400 font-mono bg-[#111520]/60 border border-[#1e2433] px-3.5 py-2 rounded-lg gap-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>
              Real-time monitoring engine: Evaluates incoming exchange feeds, Yahoo Finance ticks, and classified corporate actions.
            </span>
          </div>
          <div className="text-slate-400 flex items-center gap-1.5">
            <span>Last synchronized:</span>
            <span className="text-slate-200">{lastSyncTime.toLocaleTimeString()}</span>
            {isSilentSyncing && <span className="text-blue-400 animate-pulse text-[10px]">(Syncing...)</span>}
          </div>
        </div>

        {/* Evaluation Banner */}
        {evalResult && (
          <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono flex items-center justify-between animate-fade-in">
            <span>{evalResult}</span>
            <button onClick={() => setEvalResult(null)} className="text-emerald-300 hover:text-white">
              Dismiss
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Configured Rules Column (Left) */}
          <div className="lg:col-span-1 space-y-4">
            <h2 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center justify-between">
              <span>Alert Rules ({rules.length})</span>
              <span className="text-[10px] text-slate-500">Configured Logic</span>
            </h2>

            <div className="space-y-2.5">
              {rules.map((r) => (
                <div
                  key={r.id}
                  className="p-3.5 rounded-xl bg-[#111520] border border-[#1e2433] space-y-2 shadow-sm hover:border-[#2a3449] transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-xs font-semibold text-slate-200">{r.name}</h4>
                      <span className="text-[10px] font-mono text-blue-400 uppercase">
                        {r.rule_type.replace('_', ' ')}
                      </span>
                    </div>

                    <button
                      onClick={() => handleToggleRule(r)}
                      className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-colors ${
                        r.is_enabled
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : 'bg-slate-800 text-slate-500 border-slate-700'
                      }`}
                    >
                      {r.is_enabled ? 'ENABLED' : 'DISABLED'}
                    </button>
                  </div>

                  <div className="text-[11px] text-slate-400 font-mono">
                    {r.rule_type === 'price_movement' && (
                      <span>Threshold: {r.threshold_value}% ({r.threshold_direction})</span>
                    )}
                    {r.rule_type === 'unusual_volume' && (
                      <span>Multiplier: {r.volume_multiplier}x ({r.volume_lookback_days}-day lookback)</span>
                    )}
                    {r.rule_type === 'material_announcement' && (
                      <span>Categories: {r.announcement_categories?.join(', ') || 'All'}</span>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-[#1e2433]/60">
                    <button
                      onClick={() => {
                        setEditingRule(r);
                        setIsModalOpen(true);
                      }}
                      className="p-1 rounded text-slate-400 hover:text-slate-200"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteRule(r.id)}
                      className="p-1 rounded text-slate-400 hover:text-rose-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Triggered Events Feed (Right 2 cols) */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h2 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
                <span>Triggered Alert Events ({filteredEvents.length} of {events.length})</span>
                <span className="text-[10px] font-normal text-slate-500 border-l border-slate-700 pl-2">Deduplicated in SQLite</span>
              </h2>

              {/* Filters toolbar */}
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
                {/* Ticker filter */}
                <select
                  value={filterTicker}
                  onChange={(e) => setFilterTicker(e.target.value)}
                  className="bg-[#111520] text-slate-300 border border-[#1e2433] rounded px-2 py-1 text-[11px] focus:outline-none"
                >
                  <option value="ALL">All Tickers</option>
                  {uniqueTickers.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>

                {/* Status filter */}
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as any)}
                  className="bg-[#111520] text-slate-300 border border-[#1e2433] rounded px-2 py-1 text-[11px] focus:outline-none"
                >
                  <option value="ALL">All Status</option>
                  <option value="PENDING">Pending Review</option>
                  <option value="ACK">Acknowledged</option>
                </select>

                {/* Type filter */}
                <select
                  value={filterRuleType}
                  onChange={(e) => setFilterRuleType(e.target.value)}
                  className="bg-[#111520] text-slate-300 border border-[#1e2433] rounded px-2 py-1 text-[11px] focus:outline-none"
                >
                  <option value="ALL">All Rule Types</option>
                  <option value="material_announcement">Material Announcement</option>
                  <option value="unusual_volume">Unusual Volume</option>
                  <option value="price_movement">Price Movement</option>
                </select>
              </div>
            </div>

            {loading ? (
              <div className="p-8 rounded-xl bg-[#111520] border border-[#1e2433] text-center text-xs text-slate-400 font-mono animate-pulse">
                Loading triggered events...
              </div>
            ) : filteredEvents.length === 0 ? (
              <div className="p-8 rounded-xl bg-[#111520] border border-[#1e2433] text-center text-xs text-slate-400 font-mono">
                No alerts match current filters. Click "Evaluate Alerts" to test rules against latest market data.
              </div>
            ) : (
              <div className="space-y-4">
                {filteredEvents.map((e) => (
                  <div
                    key={e.id}
                    className={`p-4 rounded-xl border transition-all ${
                      e.is_acknowledged
                        ? 'bg-[#111520]/70 border-[#1e2433]'
                        : 'bg-[#111520] border-amber-500/40 shadow-lg'
                    }`}
                  >
                    {/* Top Alert Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-[#1e2433]/70">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-white font-mono px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/30">
                          {e.company_ticker}
                        </span>
                        <span className="text-xs font-semibold text-slate-200">{e.rule_name}</span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#1e2433] text-slate-300 uppercase">
                          {e.rule_type.replace('_', ' ')}
                        </span>
                        {e.is_demo && (
                          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            DEMO
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-500" />
                          {new Date(e.triggered_at).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {/* Alert Observation Box */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 my-3 p-3 rounded-lg bg-[#0a0d14] border border-[#1e2433] text-xs font-mono">
                      <div>
                        <span className="text-slate-400 text-[10px] block font-sans">Observed Value:</span>
                        <span className="text-amber-300 font-medium">{e.observed_value}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] block font-sans">Configured Threshold:</span>
                        <span className="text-slate-300">{e.threshold_value}</span>
                      </div>
                    </div>

                    {/* SOURCE SITES & PRIMARY VERIFICATION SECTION */}
                    <div className="mt-3 pt-3 border-t border-[#1e2433]/70 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-300 font-mono">
                          <Globe className="w-3.5 h-3.5 text-blue-400" />
                          <span>SOURCE SITES & PRIMARY EVIDENCE</span>
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono">Real-time deep links</span>
                      </div>

                      {/* Source Sites Badges */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {/* Primary filing document link if present */}
                        {e.source_url && (
                          <a
                            href={e.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-mono transition-colors"
                          >
                            <FileText className="w-3 h-3 text-emerald-400" />
                            <span>Primary Exchange Filing</span>
                            <ArrowUpRight className="w-3 h-3" />
                          </a>
                        )}

                        {/* Google Live News */}
                        <a
                          href={`https://news.google.com/search?q=${encodeURIComponent(e.company_ticker + ' NSE stock news')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[11px] font-mono transition-colors"
                        >
                          <Newspaper className="w-3 h-3 text-blue-400" />
                          <span>Live News (Google)</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>

                        {/* Google Finance Intraday */}
                        <a
                          href={`https://www.google.com/finance/quote/${e.company_ticker}:NSE`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#161c28] hover:bg-[#1e2433] text-slate-200 border border-[#2a3449] text-[11px] font-mono transition-colors"
                        >
                          <TrendingUp className="w-3 h-3 text-indigo-400" />
                          <span>Google Finance</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>

                        {/* NSE Official Quote & Filings */}
                        <a
                          href={`https://www.nseindia.com/get-quotes/equity?symbol=${e.company_ticker}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#161c28] hover:bg-[#1e2433] text-slate-200 border border-[#2a3449] text-[11px] font-mono transition-colors"
                        >
                          <ShieldCheck className="w-3 h-3 text-amber-400" />
                          <span>NSE India Quote</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>

                        {/* Moneycontrol Feed */}
                        <a
                          href={`https://www.google.com/search?q=${encodeURIComponent(e.company_ticker + ' moneycontrol stock news')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#161c28] hover:bg-[#1e2433] text-slate-200 border border-[#2a3449] text-[11px] font-mono transition-colors"
                        >
                          <Globe className="w-3 h-3 text-teal-400" />
                          <span>Moneycontrol Feed</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>

                      {/* In-App Deep Investigation Shortcuts */}
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <Link
                          href={`/research?ticker=${e.company_ticker}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[11px] font-mono transition-colors"
                        >
                          <Search className="w-3 h-3 text-purple-400" />
                          <span>Investigate on Research Desk</span>
                          <ArrowUpRight className="w-3 h-3" />
                        </Link>

                        {/* If results category -> open quarterly comparison */}
                        {e.related_announcement_category === 'results' && (
                          <button
                            onClick={() => handleOpenQuarterly(e.company_ticker)}
                            disabled={loadingModal}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-[11px] font-mono transition-colors"
                          >
                            <TrendingUp className="w-3 h-3 text-emerald-400" />
                            <span>View Quarterly Financials (QoQ / YoY)</span>
                          </button>
                        )}

                        {/* If management change -> open executive profile */}
                        {e.related_announcement_category === 'management_change' && e.related_announcement_id && (
                          <button
                            onClick={() => handleOpenExecutive(e.related_announcement_id!)}
                            disabled={loadingModal}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 text-[11px] font-mono transition-colors"
                          >
                            <ShieldCheck className="w-3 h-3 text-cyan-400" />
                            <span>Inspect Executive Career History</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Bottom Status & Review Action */}
                    <div className="flex items-center justify-between pt-3 mt-3 border-t border-[#1e2433]/60 text-xs">
                      <span className="text-[11px] font-mono">
                        {e.is_acknowledged ? (
                          <span className="text-slate-400 flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            Acknowledged
                            {e.acknowledged_at && (
                              <span className="text-slate-500 text-[10px]">
                                ({new Date(e.acknowledged_at).toLocaleTimeString()})
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-amber-400 font-semibold flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                            Pending Review
                          </span>
                        )}
                      </span>

                      {!e.is_acknowledged && (
                        <button
                          onClick={() => handleAcknowledgeEvent(e.id)}
                          className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-[11px] font-mono transition-colors shadow-sm"
                        >
                          Acknowledge
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Alert Rule Configuration Modal */}
      <AlertRuleModal
        rule={editingRule}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveRule}
      />

      {/* In-app Quarterly Results Modal */}
      <QuarterlyComparisonModal
        data={quarterlyModalData}
        onClose={() => setQuarterlyModalData(null)}
      />

      {/* In-app Executive Profile Modal */}
      <ExecutiveEnrichmentModal
        data={enrichmentModalData}
        onClose={() => setEnrichmentModalData(null)}
      />
    </div>
  );
}
