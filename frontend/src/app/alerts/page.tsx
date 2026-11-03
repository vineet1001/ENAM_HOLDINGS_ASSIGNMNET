'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { api } from '@/lib/api';
import {
  AlertRule,
  AlertEvent,
  AiStatus,
  QuarterlyComparisonResponse,
  ManagementChangeEnrichment
} from '@/types';
import {
  BellRing,
  Plus,
  Play,
  SlidersHorizontal,
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
import { SwipeRow } from '@/components/SwipeRow';
import { useQuickLook } from '@/components/QuickLook';
import { useToast } from '@/components/Toast';
import { AiHeadline, FilingFirstCut, FilingSummary } from '@/components/FilingAi';
import { ALERTS_CHANGED_EVENT, googleFinanceUrl, nseQuoteUrl, screenerDocumentsUrl } from '@/lib/ui';

export default function AlertsCentrePage() {
  const toast = useToast();
  const openQuickLook = useQuickLook();
  const knownEventIds = useRef<Set<number>>(new Set());
  const [freshEventIds, setFreshEventIds] = useState<Set<number>>(new Set());
  const [expandedEventId, setExpandedEventId] = useState<number | null>(null);
  const [confirmDeleteRuleId, setConfirmDeleteRuleId] = useState<number | null>(null);
  const [confirmAckAll, setConfirmAckAll] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showDemo, setShowDemo] = useState(false);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  // Read through a ref so the polling timer always uses the current setting.
  const showDemoRef = useRef(false);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);
  const [evalResult, setEvalResult] = useState<string | null>(null);

  // Real-time polling state
  const [autoSync, setAutoSync] = useState(true);
  const [pollIntervalSeconds, setPollIntervalSeconds] = useState(10);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [isSilentSyncing, setIsSilentSyncing] = useState(false);

  // Filters
  const [filterTicker, setFilterTicker] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'PENDING' | 'ACK'>('PENDING');
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

      const [rulesRes, eventsRes, aiRes] = await Promise.all([
        api.getAlertRules(),
        api.getAlertEvents({ limit: 100, include_demo: showDemoRef.current }),
        api.getAiStatus(),
      ]);
      setAiStatus(aiRes);
      setRules(rulesRes.rules);
      setEvents(eventsRes.events);
      setLastSyncTime(new Date());

      // Anything unseen since the last sync gets called out instead of appearing silently.
      const incoming = eventsRes.events.filter((e) => !knownEventIds.current.has(e.id));
      if (knownEventIds.current.size > 0 && incoming.length > 0) {
        setFreshEventIds(new Set(incoming.map((e) => e.id)));
        toast({ message: `${incoming.length} new alert${incoming.length > 1 ? 's' : ''}: ${incoming.slice(0, 3).map((e) => e.company_ticker).join(', ')}` });
        window.dispatchEvent(new Event(ALERTS_CHANGED_EVENT));
      }
      knownEventIds.current = new Set(eventsRes.events.map((e) => e.id));
      setLoadError(null);
    } catch (err: any) {
      // A failed background sync keeps the last good list on screen.
      setLoadError(err.message || 'Could not reach the FINN API');
    } finally {
      if (!silent) setLoading(false);
      setIsSilentSyncing(false);
    }
  };

  useEffect(() => {
    loadAlerts(false);
    // Show what's stored straight away, then fetch anything newer.
    api.syncAlerts().then(() => loadAlerts(true)).catch(() => {});
  }, []);

  const toggleDemo = () => {
    const next = !showDemo;
    showDemoRef.current = next;
    knownEventIds.current = new Set();
    setShowDemo(next);
    loadAlerts(false);
  };

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
      const res = await api.syncAlerts();
      setEvalResult(
        `Checked the exchanges and Yahoo Finance: ${res.total_triggered} new alerts (${res.price_alerts_triggered} price, ${res.volume_alerts_triggered} volume, ${res.announcement_alerts_triggered} filings).${res.errors.length ? ` ${res.errors.join(' ')}` : ''}`
      );
      await loadAlerts(false);
    } catch (err: any) {
      toast({ message: err.message || 'Could not check for new alerts', tone: 'error' });
    } finally {
      setEvaluating(false);
    }
  };

  const handleToggleRule = async (rule: AlertRule) => {
    const setEnabled = (is_enabled: boolean) =>
      setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, is_enabled } : r)));
    setEnabled(!rule.is_enabled);
    try {
      await api.updateAlertRule(rule.id, { is_enabled: !rule.is_enabled });
    } catch (err: any) {
      setEnabled(rule.is_enabled);
      toast({ message: err.message || 'Could not update the rule', tone: 'error' });
    }
  };

  // Deleting a rule cascades to its events and can't be undone, so it takes a second tap.
  const handleDeleteRule = async (id: number) => {
    if (confirmDeleteRuleId !== id) {
      setConfirmDeleteRuleId(id);
      return;
    }
    setConfirmDeleteRuleId(null);
    try {
      await api.deleteAlertRule(id);
      await loadAlerts(true);
      window.dispatchEvent(new Event(ALERTS_CHANGED_EVENT));
      toast({ message: 'Rule and its alert history deleted' });
    } catch (err: any) {
      toast({ message: err.message || 'Could not delete the rule', tone: 'error' });
    }
  };

  const handleAcknowledgeEvent = async (id: number) => {
    try {
      await api.acknowledgeAlert(id);
      setEvents((prev) =>
        prev.map((e) => (e.id === id ? { ...e, is_acknowledged: true, acknowledged_at: new Date().toISOString() } : e))
      );
      window.dispatchEvent(new Event(ALERTS_CHANGED_EVENT));
    } catch (err: any) {
      toast({ message: err.message || 'Could not acknowledge the alert', tone: 'error' });
    }
  };

  // Acknowledging is permanent on the backend, so the bulk action asks for a second tap.
  const handleAcknowledgeVisible = async (pending: AlertEvent[]) => {
    if (!confirmAckAll) {
      setConfirmAckAll(true);
      return;
    }
    setConfirmAckAll(false);
    const results = await Promise.allSettled(pending.map((e) => api.acknowledgeAlert(e.id)));
    const failed = results.filter((r) => r.status === 'rejected').length;
    await loadAlerts(true);
    window.dispatchEvent(new Event(ALERTS_CHANGED_EVENT));
    toast(failed
      ? { message: `${failed} of ${pending.length} alerts could not be acknowledged`, tone: 'error' }
      : { message: `Acknowledged ${pending.length} alert${pending.length > 1 ? 's' : ''}` });
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
      if (res.metrics.length === 0) {
        toast({ message: `No quarterly numbers on file for ${ticker}`, tone: 'error' });
        return;
      }
      setQuarterlyModalData(res);
    } catch (err: any) {
      toast({ message: `Could not load quarterly financials for ${ticker}: ${err.message}`, tone: 'error' });
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
      toast({ message: `Could not load executive background: ${err.message}`, tone: 'error' });
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
  const pendingVisible = filteredEvents.filter((e) => !e.is_acknowledged);

  return (
    <div className="flex-1 flex flex-col bg-[#0a0d14]">
      <Header
        isDemo={showDemo}
        dataFreshness={aiStatus?.last_sync ? `Last checked ${new Date(aiStatus.last_sync.at).toLocaleTimeString()}` : 'Checking...'}
        onRefresh={() => loadAlerts(false)}
        isRefreshing={loading}
      />

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
                  {autoSync ? 'Auto-Sync On' : 'Sync Paused'}
                </span>
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              You set the thresholds. Price moves, unusual volume and filing categories are checked against them deterministically.
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
                <span>{autoSync ? 'Syncing' : 'Paused'}</span>
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

            <Link
              href="/settings/alerts"
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#2a3449] text-slate-200 hover:text-white text-xs font-medium transition-colors font-mono"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Thresholds
            </Link>

            <button
              onClick={handleEvaluate}
              disabled={evaluating}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors font-mono disabled:opacity-50"
            >
              <Play className={`w-3.5 h-3.5 ${evaluating ? 'animate-spin' : ''}`} />
              {evaluating ? 'Checking...' : 'Check now'}
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
            <span className={`w-2 h-2 rounded-full shrink-0 ${loadError ? 'bg-rose-400' : 'bg-emerald-400'}`}></span>
            <span>
              {loadError
                ? `Sync failed, showing the last good list: ${loadError}`
                : 'Real filings and end-of-day prices for your active portfolio, checked against your thresholds automatically.'}
            </span>
          </div>
          <div className="text-slate-400 flex items-center gap-1.5">
            <span>Last synchronized:</span>
            <span className="text-slate-200">{lastSyncTime ? lastSyncTime.toLocaleTimeString() : '—'}</span>
            {isSilentSyncing && <span className="text-blue-400 animate-pulse text-[10px]">(Syncing...)</span>}
          </div>
        </div>

        {/* The filing reader's state, including exactly how to fix it */}
        {aiStatus && !aiStatus.configured && (
          <div className="p-3.5 rounded-lg bg-[#111520] border border-blue-500/30 text-xs space-y-1.5">
            <p className="font-semibold text-slate-100">AI headlines are off</p>
            <p className="text-slate-400 leading-relaxed">
              Alerts below are real, but no model is reading the filings yet.{' '}
              <Link href="/settings" className="text-blue-400 hover:text-blue-300 underline">
                Add an API key in Settings
              </Link>{' '}
              to turn on headlines and summaries.
            </p>
          </div>
        )}
        {aiStatus?.configured && (aiStatus.last_error || aiStatus.paused_seconds > 0) && (
          <div className="p-3.5 rounded-lg bg-[#111520] border border-amber-500/40 text-xs text-amber-300 font-mono">
            The filing reader has a problem: {aiStatus.last_error || 'the free quota was reached'}.
            {aiStatus.paused_seconds > 0 ? ` Retrying in ${aiStatus.paused_seconds}s.` : ''}
          </div>
        )}
        {aiStatus?.configured && !aiStatus.last_error && aiStatus.filings_waiting > 0 && (
          <p className="text-[11px] font-mono text-slate-400 animate-pulse">
            {aiStatus.model} is reading {aiStatus.filings_waiting} filing{aiStatus.filings_waiting > 1 ? 's' : ''}...
          </p>
        )}

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

                  <div className="flex items-center justify-end gap-1 pt-1 border-t border-[#1e2433]/60">
                    {confirmDeleteRuleId === r.id && (
                      <button
                        onClick={() => setConfirmDeleteRuleId(null)}
                        className="mr-auto px-2 py-1.5 text-[11px] font-mono text-slate-400 hover:text-slate-200"
                      >
                        Keep rule
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setEditingRule(r);
                        setIsModalOpen(true);
                      }}
                      aria-label={`Edit ${r.name}`}
                      className="p-2 rounded text-slate-400 hover:text-slate-200"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteRule(r.id)}
                      aria-label={confirmDeleteRuleId === r.id ? `Confirm delete ${r.name}` : `Delete ${r.name}`}
                      className={`rounded transition-colors ${
                        confirmDeleteRuleId === r.id
                          ? 'px-2 py-1.5 text-[11px] font-mono font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/40'
                          : 'p-2 text-slate-400 hover:text-rose-400'
                      }`}
                    >
                      {confirmDeleteRuleId === r.id ? 'Delete rule + history' : <Trash2 className="w-3.5 h-3.5" />}
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

                <label className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-[#1e2433] bg-[#111520] text-slate-300 cursor-pointer">
                  <input type="checkbox" checked={showDemo} onChange={toggleDemo} className="accent-blue-500" />
                  Show demo alerts
                </label>

                {pendingVisible.length > 1 && (
                  <button
                    onClick={() => handleAcknowledgeVisible(pendingVisible)}
                    onBlur={() => setConfirmAckAll(false)}
                    className={`px-2 py-1 rounded border text-[11px] transition-colors ${
                      confirmAckAll
                        ? 'bg-blue-600 text-white border-blue-500 font-semibold'
                        : 'bg-[#111520] text-slate-300 border-[#1e2433] hover:text-white'
                    }`}
                  >
                    {confirmAckAll ? `Confirm: acknowledge ${pendingVisible.length}` : `Acknowledge ${pendingVisible.length}`}
                  </button>
                )}
              </div>
            </div>

            {loading ? (
              <div className="p-8 rounded-xl bg-[#111520] border border-[#1e2433] text-center text-xs text-slate-400 font-mono animate-pulse">
                Loading triggered events...
              </div>
            ) : filteredEvents.length === 0 ? (
              <div className="p-8 rounded-xl bg-[#111520] border border-[#1e2433] text-center text-xs text-slate-400 font-mono">
                No alerts match these filters. A filing raises an alert for 7 days after it's filed, and rules run on your active portfolio.
              </div>
            ) : (
              <div className="space-y-4">
                {filteredEvents.map((e) => (
                  <SwipeRow
                    key={e.id}
                    right={e.is_acknowledged ? undefined : {
                      label: 'Acknowledge',
                      className: 'bg-blue-500/20 text-blue-300',
                      onTrigger: () => handleAcknowledgeEvent(e.id)
                    }}
                  >
                  <div
                    className={`p-4 rounded-xl border transition-all ${
                      e.is_acknowledged
                        ? 'bg-[#111520]/70 border-[#1e2433]'
                        : 'bg-[#111520] border-amber-500/40 shadow-lg'
                    } ${freshEventIds.has(e.id) ? 'animate-flash' : ''}`}
                  >
                    {/* Top Alert Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-[#1e2433]/70">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => openQuickLook(e.company_ticker)}
                          className="text-xs font-bold text-white hover:text-blue-400 font-mono px-2 py-1 rounded bg-blue-500/10 border border-blue-500/30 transition-colors"
                        >
                          {e.company_ticker}
                        </button>
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

                    {/* What the model read from the filing, kept apart from the exchange's own words */}
                    {!e.is_demo && e.source_url && (
                      <div className="mt-3">
                        <AiHeadline insight={e.insight ?? null} aiEnabled={!!aiStatus?.configured} />
                      </div>
                    )}

                    {/* Alert Observation Box */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 my-3 p-3 rounded-lg bg-[#0a0d14] border border-[#1e2433] text-xs font-mono">
                      <div>
                        <span className="text-slate-400 text-[10px] block font-sans">
                          {!e.is_demo && e.filing_title ? "Exchange's headline:" : 'Observed Value:'}
                        </span>
                        <span className="text-amber-300 font-medium">{!e.is_demo && e.filing_title ? e.filing_title : e.observed_value}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] block font-sans">Configured Threshold:</span>
                        <span className="text-slate-300">{e.threshold_value}</span>
                      </div>
                    </div>

                    {!e.is_demo && e.related_announcement_id && (
                      <div className="mb-3">
                        <FilingFirstCut
                          category={e.related_announcement_category}
                          insight={e.insight ?? null}
                          ticker={e.company_ticker}
                          pdfUrl={e.source_url}
                          aiEnabled={!!aiStatus?.configured}
                        />
                      </div>
                    )}

                    {!e.is_demo && e.source_url && e.related_announcement_id && (
                      <FilingSummary
                        announcementId={e.related_announcement_id}
                        pdfUrl={e.source_url}
                        insight={e.insight ?? null}
                      />
                    )}

                    {/* SOURCE SITES & PRIMARY VERIFICATION SECTION */}
                    <div className="mt-3 pt-1 border-t border-[#1e2433]/70 space-y-2.5">
                      <button
                        onClick={() => setExpandedEventId(expandedEventId === e.id ? null : e.id)}
                        aria-expanded={expandedEventId === e.id}
                        className="w-full flex items-center justify-between py-1.5 text-[11px] font-semibold text-slate-300 hover:text-white font-mono"
                      >
                        <span className="flex items-center gap-1.5">
                          <Globe className="w-3.5 h-3.5 text-blue-400" />
                          <span>Evidence &amp; sources</span>
                        </span>
                        <ChevronDown className={`w-4 h-4 transition-transform ${expandedEventId === e.id ? 'rotate-180' : ''}`} />
                      </button>

                      {expandedEventId === e.id && (
                      <div className="flex flex-wrap items-center gap-1.5 animate-fade-in">
                        {/* Demo filings have placeholder URLs, so only real ones get a link */}
                        {e.source_url && !e.is_demo && (
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
                          href={googleFinanceUrl(e.company_ticker)}
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
                          href={nseQuoteUrl(e.company_ticker)}
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

                        {/* Annual reports and concall transcripts */}
                        <a
                          href={screenerDocumentsUrl(e.company_ticker)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-mono transition-colors"
                        >
                          <FileText className="w-3 h-3 text-emerald-400" />
                          <span>Annual Reports &amp; Concalls (Screener)</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                      )}

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
                        {e.is_demo && e.related_announcement_category === 'results' && (
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
                        {e.is_demo && e.related_announcement_category === 'management_change' && e.related_announcement_id && (
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
                  </SwipeRow>
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
