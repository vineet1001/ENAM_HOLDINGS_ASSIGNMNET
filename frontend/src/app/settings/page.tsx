'use client';

import React, { useState, useEffect } from 'react';
import { Header } from '@/components/Header';
import { api } from '@/lib/api';
import { SystemHealth } from '@/types';
import {
  Sliders,
  Cpu,
  Database,
  RefreshCw,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Server,
  Layers
} from 'lucide-react';

export default function SettingsPage() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshingTicker, setRefreshingTicker] = useState('RELIANCE');
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadStatus = async () => {
    try {
      setLoading(true);
      const [h, m] = await Promise.all([
        api.getHealth(),
        fetch('/api/metrics/summary').then(r => r.json()).catch(() => null),
      ]);
      setHealth(h);
      setMetrics(m);
    } catch (err) {
      console.error('Failed to load system health:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleTriggerIngestion = async () => {
    if (!refreshingTicker) return;
    try {
      setIsRefreshing(true);
      setRefreshMessage(null);
      const res = await api.ingestMarketData(refreshingTicker);
      setRefreshMessage(`Result: ${res.message} (status: ${res.status})`);
      await loadStatus();
    } catch (err: any) {
      setRefreshMessage(`Error: ${err.message}`);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-[#0a0d14]">
      <Header onRefresh={loadStatus} isRefreshing={loading} />

      <main className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto w-full">
        {/* Title */}
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white tracking-tight">System Settings & Data Engines</h1>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/30">
              OPERATIONAL STATUS
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Engine configuration, AI provider routing, persistent storage integrity, and external data ingestion status.
          </p>
        </div>

        {/* System Diagnostics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Health Card */}
          <div className="p-4 rounded-xl bg-[#111520] border border-[#1e2433] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 font-mono">BACKEND API</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            </div>
            <div className="text-base font-bold text-emerald-400 font-mono">
              {health?.status.toUpperCase() || 'ONLINE'}
            </div>
            <p className="text-[11px] text-slate-400 font-mono">
              FastAPI 1.0.0 (Port 8000)
            </p>
          </div>

          {/* AI Provider Status */}
          <div className="p-4 rounded-xl bg-[#111520] border border-[#1e2433] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 font-mono">LLM REASONING</span>
              <Cpu className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-base font-bold text-slate-100 font-mono">
              {health?.llm_configured ? 'KEY DETECTED' : 'DETERMINISTIC FALLBACK'}
            </div>
            <p className="text-[11px] text-slate-400 font-mono">
              {health?.llm_configured ? 'Gemini / Claude API Configured' : 'Fully operational without API key'}
            </p>
          </div>

          {/* Database Card */}
          <div className="p-4 rounded-xl bg-[#111520] border border-[#1e2433] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 font-mono">STORAGE LAYER</span>
              <Database className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-base font-bold text-slate-100 font-mono">
              SQLITE + SQLALCHEMY
            </div>
            <p className="text-[11px] text-slate-400 font-mono">
              Async session + persistent models
            </p>
          </div>
        </div>

        {/* Database Metrics Summary */}
        {metrics && (
          <div className="p-5 rounded-xl bg-[#111520] border border-[#1e2433] space-y-3">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
              Persistent Records Breakdown
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
              <div className="p-3 rounded-lg bg-[#0a0d14] border border-[#1e2433]">
                <span className="text-[10px] text-slate-400">Total Companies</span>
                <div className="text-lg font-bold text-white mt-0.5">{metrics.total_companies}</div>
              </div>
              <div className="p-3 rounded-lg bg-[#0a0d14] border border-[#1e2433]">
                <span className="text-[10px] text-slate-400">Price Bars (EOD)</span>
                <div className="text-lg font-bold text-blue-400 mt-0.5">{metrics.total_price_bars}</div>
              </div>
              <div className="p-3 rounded-lg bg-[#0a0d14] border border-[#1e2433]">
                <span className="text-[10px] text-slate-400">Filings Ingested</span>
                <div className="text-lg font-bold text-amber-400 mt-0.5">{metrics.total_announcements}</div>
              </div>
              <div className="p-3 rounded-lg bg-[#0a0d14] border border-[#1e2433]">
                <span className="text-[10px] text-slate-400">Alert Events</span>
                <div className="text-lg font-bold text-rose-400 mt-0.5">{metrics.total_alert_events}</div>
              </div>
            </div>
          </div>
        )}

        {/* Live Market Data Ingestion Control */}
        <div className="p-5 rounded-xl bg-[#111520] border border-[#1e2433] space-y-4">
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
              External Market Data Ingestion (Yahoo Finance EOD)
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Trigger incremental EOD bar updates for any supported NSE symbol (.NS). Handles missing data, rate limits, and provider errors without silently substituting fake data.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <input
              type="text"
              value={refreshingTicker}
              onChange={(e) => setRefreshingTicker(e.target.value.toUpperCase())}
              placeholder="e.g. RELIANCE"
              className="bg-[#0a0d14] border border-[#1e2433] rounded-lg px-3 py-2 text-xs text-white font-mono uppercase focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={handleTriggerIngestion}
              disabled={isRefreshing}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-mono font-medium transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Fetching from Yahoo Finance...' : 'Fetch Live EOD Bars'}
            </button>
          </div>

          {refreshMessage && (
            <div className="p-3 rounded-lg bg-[#0a0d14] border border-[#1e2433] text-xs font-mono text-slate-300">
              {refreshMessage}
            </div>
          )}
        </div>

        {/* Core Architectural Principles */}
        <div className="p-5 rounded-xl bg-[#111520] border border-[#1e2433] space-y-3 text-xs">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
            System Design Principles
          </h3>
          <ul className="space-y-2 text-slate-400 font-mono text-[11px]">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
              <span><strong>Primary Sources Only:</strong> Pull-side research uses only Annual Reports, Concall Transcripts, and Quarterly Results. No secondary news or hallucinations.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
              <span><strong>Deterministic Arithmetic:</strong> All margins, QoQ/YoY percentage changes, and alert thresholds are evaluated in Python code, never generated by LLMs.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
              <span><strong>Zero Paid Vector DB Dependency:</strong> Self-contained SQLite database with structured models for citations, facts, and chunks.</span>
            </li>
          </ul>
        </div>
      </main>
    </div>
  );
}

