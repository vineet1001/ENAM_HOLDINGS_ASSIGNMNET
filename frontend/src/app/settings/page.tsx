'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { api } from '@/lib/api';
import { AiKeysSettings } from '@/components/AiKeysSettings';
import { AiStatus, SystemHealth } from '@/types';
import { BellRing, ChevronRight, Cpu, Database, Server } from 'lucide-react';

export default function SettingsPage() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStatus = async () => {
    try {
      setLoading(true);
      const [h, m, ai] = await Promise.all([
        api.getHealth(),
        fetch('/api/metrics/summary').then(r => r.json()).catch(() => null),
        api.getAiStatus().catch(() => null),
      ]);
      setHealth(h);
      setMetrics(m);
      setAiStatus(ai);
    } catch (err) {
      console.error('Failed to load system health:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  return (
    <div className="flex-1 flex flex-col bg-[#0a0d14]">
      <Header onRefresh={loadStatus} isRefreshing={loading} />

      <main className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto w-full">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Settings</h1>
          <p className="text-xs text-slate-400 mt-1">AI keys, alert thresholds and how the system is running.</p>
        </div>

        <Link
          href="/settings/alerts"
          className="flex items-center justify-between gap-3 p-4 rounded-xl bg-[#111520] border border-blue-500/40 hover:border-blue-500 transition-colors"
        >
          <span className="flex items-start gap-3 min-w-0">
            <BellRing className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <span>
              <span className="block text-sm font-semibold text-white">Alert Settings</span>
              <span className="block text-xs text-slate-400 mt-0.5">Price and volume thresholds, per-stock limits, filing types, digest and notifications</span>
            </span>
          </span>
          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
        </Link>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="p-4 rounded-xl bg-[#111520] border border-[#1e2433] space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-300 font-mono">Backend</span>
              <Server className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-sm font-bold text-emerald-400 font-mono capitalize">{health?.status || '...'}</div>
            <p className="text-[11px] text-slate-400 font-mono">
              Last check: {aiStatus?.last_sync ? new Date(aiStatus.last_sync.at).toLocaleTimeString() : 'not yet'}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[#111520] border border-[#1e2433] space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-300 font-mono">AI reader</span>
              <Cpu className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-sm font-bold text-slate-100 font-mono capitalize">{aiStatus?.configured ? aiStatus.provider : 'Off'}</div>
            <p className="text-[11px] text-slate-400 font-mono truncate">
              {aiStatus?.configured ? aiStatus.model : 'Numbers and alerts work without a key'}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[#111520] border border-[#1e2433] space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-300 font-mono">Stored</span>
              <Database className="w-4 h-4 text-slate-400" />
            </div>
            <div className="text-sm font-bold text-slate-100 font-mono">{metrics ? `${metrics.total_announcements} filings` : '...'}</div>
            <p className="text-[11px] text-slate-400 font-mono">{metrics ? `${metrics.total_alert_events} alerts, ${metrics.total_companies} companies` : ' '}</p>
          </div>
        </div>

        <AiKeysSettings onChanged={loadStatus} />

        <section className="p-4 rounded-xl bg-[#111520] border border-[#1e2433] space-y-2 text-xs">
          <h2 className="text-xs font-bold text-white uppercase tracking-wider font-mono">Where FINN&apos;s data comes from</h2>
          <ul className="space-y-1.5 text-slate-400 leading-relaxed">
            <li><span className="text-slate-200">Prices and volume:</span> Yahoo Finance, end of day.</li>
            <li><span className="text-slate-200">Filings:</span> NSE and BSE corporate announcements, with each original PDF.</li>
            <li><span className="text-slate-200">Reported financials:</span> Screener.in&apos;s tables of company filings. FINN calculates every ratio and growth rate itself.</li>
            <li><span className="text-slate-200">Research text:</span> only annual reports and concall transcripts. No news, broker notes or the model&apos;s own knowledge.</li>
          </ul>
        </section>
      </main>
    </div>
  );
}
