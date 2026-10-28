'use client';

import React, { useState, useEffect } from 'react';
import { Header } from '@/components/Header';
import { api } from '@/lib/api';
import { AlertRule, AlertEvent } from '@/types';
import {
  BellRing,
  Plus,
  Play,
  Check,
  CheckCircle2,
  Trash2,
  Edit2,
  AlertTriangle,
  Clock,
  Sparkles
} from 'lucide-react';
import { AlertRuleModal } from '@/components/AlertRuleModal';

export default function AlertsCentrePage() {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);
  const [evalResult, setEvalResult] = useState<string | null>(null);

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null);

  const loadAlerts = async () => {
    try {
      setLoading(true);
      const [rulesRes, eventsRes] = await Promise.all([
        api.getAlertRules(),
        api.getAlertEvents(),
      ]);
      setRules(rulesRes.rules);
      setEvents(eventsRes.events);
    } catch (err) {
      console.error('Failed to load alerts data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAlerts();
  }, []);

  const handleEvaluate = async () => {
    try {
      setEvaluating(true);
      setEvalResult(null);
      const res = await api.evaluateAlerts();
      setEvalResult(
        `Evaluation complete: ${res.total_triggered} new alerts triggered (${res.price_alerts_triggered} price, ${res.volume_alerts_triggered} volume, ${res.announcement_alerts_triggered} announcement).`
      );
      await loadAlerts();
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
        prev.map((e) => (e.id === id ? { ...e, is_acknowledged: true } : e))
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
    await loadAlerts();
  };

  return (
    <div className="flex-1 flex flex-col bg-[#0a0d14]">
      <Header onRefresh={loadAlerts} isRefreshing={loading} />

      <main className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto w-full">
        {/* Top Header & Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white tracking-tight">Alerts Centre</h1>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/30">
                {rules.length} ACTIVE RULES
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Deterministic threshold evaluation across price moves, unusual volume multiples, and announcement subscriptions.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
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

        {/* Evaluation Banner */}
        {evalResult && (
          <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono flex items-center justify-between">
            <span>{evalResult}</span>
            <button onClick={() => setEvalResult(null)} className="text-emerald-300 hover:text-white">
              Dismiss
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Configured Rules Column (Left) */}
          <div className="lg:col-span-1 space-y-4">
            <h2 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
              <span>Alert Rules ({rules.length})</span>
            </h2>

            <div className="space-y-2.5">
              {rules.map((r) => (
                <div
                  key={r.id}
                  className="p-3.5 rounded-xl bg-[#111520] border border-[#1e2433] space-y-2"
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
                      className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
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
            <h2 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center justify-between">
              <span>Triggered Alert Events ({events.length})</span>
              <span className="text-slate-400 font-normal">Deduplicated in SQLite</span>
            </h2>

            {loading ? (
              <div className="p-8 rounded-xl bg-[#111520] border border-[#1e2433] text-center text-xs text-slate-400 font-mono animate-pulse">
                Loading triggered events...
              </div>
            ) : events.length === 0 ? (
              <div className="p-8 rounded-xl bg-[#111520] border border-[#1e2433] text-center text-xs text-slate-400 font-mono">
                No alerts have been triggered yet. Click "Evaluate Alerts" to test rules against latest market data.
              </div>
            ) : (
              <div className="space-y-3">
                {events.map((e) => (
                  <div
                    key={e.id}
                    className={`p-4 rounded-xl border transition-all ${
                      e.is_acknowledged
                        ? 'bg-[#111520]/60 border-[#1e2433]'
                        : 'bg-[#111520] border-amber-500/30 shadow-md'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white font-mono px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/30">
                          {e.company_ticker}
                        </span>
                        <span className="text-xs font-semibold text-slate-200">{e.rule_name}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#1e2433] text-slate-400">
                          {e.rule_type.replace('_', ' ')}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-500" />
                          {new Date(e.triggered_at).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 p-2.5 rounded-lg bg-[#0a0d14] border border-[#1e2433] text-xs font-mono">
                      <div>
                        <span className="text-slate-400 text-[10px] block">Observed Value:</span>
                        <span className="text-amber-400 font-medium">{e.observed_value}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] block">Configured Threshold:</span>
                        <span className="text-slate-300">{e.threshold_value}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 mt-2 border-t border-[#1e2433]/60 text-xs">
                      <span className="text-[11px] text-slate-400 font-mono">
                        {e.is_acknowledged ? (
                          <span className="text-slate-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            Acknowledged
                          </span>
                        ) : (
                          <span className="text-amber-400 font-medium">Pending Review</span>
                        )}
                      </span>

                      {!e.is_acknowledged && (
                        <button
                          onClick={() => handleAcknowledgeEvent(e.id)}
                          className="px-2.5 py-1 rounded bg-blue-600/15 hover:bg-blue-600/25 text-blue-400 border border-blue-500/30 text-[11px] font-mono transition-colors"
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

      {/* Alert Rule Modal */}
      <AlertRuleModal
        rule={editingRule}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveRule}
      />
    </div>
  );
}

