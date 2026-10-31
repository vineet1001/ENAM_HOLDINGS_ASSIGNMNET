'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Header } from '@/components/Header';
import { api } from '@/lib/api';
import {
  Company,
  ResearchResponse,
  SourceDocument,
  ResearchCitation
} from '@/types';
import {
  Search,
  BookOpen,
  Send,
  Sparkles,
  ShieldCheck,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Scale,
  DollarSign,
  FileText,
  Activity,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ExternalLink
} from 'lucide-react';
import { CitationDrawer } from '@/components/CitationDrawer';

const RESEARCH_TABS = [
  { id: 'business_snapshot', label: '1. Business Snapshot' },
  { id: 'financial_snapshot', label: '2. Financial Snapshot' },
  { id: 'trajectory', label: '3. Trajectory' },
  { id: 'balance_sheet', label: '4. Balance Sheet' },
  { id: 'cash_quality', label: '5. Cash Quality' },
  { id: 'narrative_vs_numbers', label: '6. Narrative vs Numbers' },
  { id: 'guidance', label: '7. Guidance' },
  { id: 'bull_bear', label: '8. Bull vs Bear' },
];

function ResearchContent() {
  const searchParams = useSearchParams();
  const initialTicker = searchParams.get('ticker') || 'INFY';

  const [ticker, setTicker] = useState(initialTicker);
  const [activeTab, setActiveTab] = useState('business_snapshot');
  const [company, setCompany] = useState<Company | null>(null);
  const [documents, setDocuments] = useState<SourceDocument[]>([]);
  const [researchData, setResearchData] = useState<ResearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [copilotQuery, setCopilotQuery] = useState('');
  const [copilotLoading, setCopilotLoading] = useState(false);
  const [selectedCitation, setSelectedCitation] = useState<ResearchCitation | null>(null);

  const SUGGESTED_TICKERS = ['INFY', 'RELIANCE', 'TCS', 'HDFCBANK', 'TATAMOTORS', 'ZOMATO', 'TRENT', 'BEL'];

  const loadCompanyData = async (targetTicker: string) => {
    try {
      setLoading(true);
      const [compRes, docsRes] = await Promise.all([
        api.getCompany(targetTicker),
        api.getCompanyDocuments(targetTicker),
      ]);
      setCompany(compRes);
      setDocuments(docsRes.documents);
      await runTabResearch(targetTicker, activeTab);
    } catch (err: any) {
      console.error('Failed to load company data:', err);
    } finally {
      setLoading(false);
    }
  };

  const runTabResearch = async (targetTicker: string, researchType: string) => {
    try {
      setLoading(true);
      const res = await api.runResearch(targetTicker, researchType);
      setResearchData(res);
    } catch (err) {
      console.error('Failed to run research:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCompanyData(ticker);
  }, [ticker]);

  const handleTabChange = async (tabId: string) => {
    setActiveTab(tabId);
    if (ticker) {
      await runTabResearch(ticker, tabId);
    }
  };

  const handleCopilotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!copilotQuery.trim() || !ticker) return;

    try {
      setCopilotLoading(true);
      const res = await api.runResearch(ticker, 'custom', copilotQuery);
      setResearchData(res);
      setActiveTab('custom');
    } catch (err: any) {
      alert(err.message || 'Research query failed');
    } finally {
      setCopilotLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-[#0a0d14]">
      <Header />

      <main className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto w-full">
        {/* Ticker Search & Quick Jump Bar */}
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between p-4 rounded-xl bg-[#111520] border border-[#1e2433]">
          <div className="flex items-center gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                placeholder="Enter NSE ticker (e.g. INFY)..."
                className="w-full bg-[#0a0d14] border border-[#1e2433] rounded-lg pl-9 pr-3 py-1.5 text-xs text-white uppercase font-mono font-bold focus:outline-none focus:border-blue-500"
              />
            </div>
            <button
              onClick={() => loadCompanyData(ticker)}
              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-mono font-medium transition-colors"
            >
              Load
            </button>
          </div>

          {/* Quick Tickers */}
          <div className="flex items-center gap-1.5 overflow-x-auto text-[11px] font-mono text-slate-400">
            <span className="text-slate-400">Quick Jump:</span>
            {SUGGESTED_TICKERS.map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTicker(t);
                  loadCompanyData(t);
                }}
                className={`px-2 py-0.5 rounded border transition-colors ${
                  ticker === t
                    ? 'bg-blue-600/20 text-blue-400 border-blue-500/40 font-bold'
                    : 'bg-[#0a0d14] border-[#1e2433] hover:text-white'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Company Header & Primary Source Coverage Indicator */}
        {company && (
          <div className="p-5 rounded-xl bg-[#111520] border border-[#1e2433] flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold text-white tracking-tight">{company.name}</h1>
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/30">
                  {company.ticker}
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-[#0a0d14] text-slate-300 border border-[#1e2433]">
                  {company.sector}
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs font-mono text-slate-400 mt-2">
                <span>Exchange: {company.exchange}</span>
                <span>Yahoo: {company.yahoo_symbol}</span>
                {company.latest_price && (
                  <span className="text-slate-200">
                    Latest Close: ₹{company.latest_price.toLocaleString()} ({company.daily_change_pct && company.daily_change_pct > 0 ? '+' : ''}{company.daily_change_pct}%)
                  </span>
                )}
              </div>
            </div>

            {/* Document Coverage Pill */}
            <div className="p-3 rounded-lg bg-[#0a0d14] border border-[#1e2433] flex items-center gap-3 text-xs font-mono">
              <div className="flex items-center gap-1.5 text-emerald-400">
                <ShieldCheck className="w-4 h-4" />
                <span>Primary Sources:</span>
              </div>
              <span className="text-slate-200 font-bold">
                {documents.length} Ingested ({documents.filter(d => d.document_type === 'annual_report').length} AR, {documents.filter(d => d.document_type === 'concall_transcript').length} Concall)
              </span>
            </div>
          </div>
        )}

        {/* Natural Language Research Copilot Input */}
        <form onSubmit={handleCopilotSubmit} className="relative">
          <div className="flex items-center gap-2 p-2 rounded-xl bg-[#111520] border border-blue-500/40 shadow-lg focus-within:border-blue-500 transition-colors">
            <Sparkles className="w-5 h-5 text-blue-400 ml-2 shrink-0" />
            <input
              type="text"
              value={copilotQuery}
              onChange={(e) => setCopilotQuery(e.target.value)}
              placeholder="Ask Copilot (e.g. 'What did management guide for margins, and did they deliver?' or 'Why is cash flow weaker than PAT?')..."
              className="w-full bg-transparent border-none text-xs text-white placeholder-slate-400 focus:outline-none px-2"
            />
            <button
              type="submit"
              disabled={copilotLoading}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium font-mono transition-colors shrink-0 disabled:opacity-50"
            >
              {copilotLoading ? 'Analyzing...' : 'Investigate'}
            </button>
          </div>
        </form>

        {/* 8 Research Output Views Navigation Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto border-b border-[#1e2433] pb-2 text-xs font-mono">
          {RESEARCH_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`px-3 py-2 rounded-lg whitespace-nowrap transition-colors border ${
                activeTab === tab.id
                  ? 'bg-blue-600/20 text-blue-400 border-blue-500/40 font-semibold'
                  : 'bg-[#111520] text-slate-400 border-[#1e2433] hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Active Research View Content Display */}
        {loading ? (
          <div className="p-12 rounded-xl bg-[#111520] border border-[#1e2433] text-center text-xs text-slate-400 font-mono animate-pulse">
            Retrieving primary-source document chunks and synthesizing analysis for {ticker}...
          </div>
        ) : !researchData ? (
          <div className="p-12 rounded-xl bg-[#111520] border border-[#1e2433] text-center text-xs text-slate-400 font-mono">
            No research output available.
          </div>
        ) : (
          <div className="space-y-6">
            {/* Executive Summary Card */}
            <div className="p-5 rounded-xl bg-[#111520] border border-[#1e2433] space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                  Executive Takeaway
                </h3>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  Primary-Source Grounded
                </span>
              </div>
              <p className="text-xs text-slate-200 leading-relaxed bg-[#0a0d14] p-3 rounded-lg border border-[#1e2433]">
                {researchData.summary}
              </p>
            </div>

            {/* Special View: Balance Sheet Table */}
            {activeTab === 'balance_sheet' && researchData.data?.table && (
              <div className="p-5 rounded-xl bg-[#111520] border border-[#1e2433] space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
                    <Scale className="w-4 h-4 text-blue-400" />
                    <span>Consolidated Balance Sheet ({researchData.data.unit || '₹ Crores'})</span>
                  </h3>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {researchData.data.source || 'Audited Annual Filings'}
                  </span>
                </div>

                <div className="overflow-x-auto border border-[#1e2433] rounded-lg">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-[#0a0d14] text-slate-400 font-mono uppercase text-[10px] border-b border-[#1e2433]">
                      <tr>
                        <th className="py-2.5 px-3">Balance Sheet Line Item</th>
                        {(researchData.data.years || []).map((yr: string) => (
                          <th key={yr} className="py-2.5 px-3 text-right">{yr}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1e2433] font-mono">
                      {researchData.data.table.map((row: any, idx: number) => (
                        <tr key={idx} className="hover:bg-[#161c28]/50 transition-colors">
                          <td className="py-2.5 px-3 font-semibold text-slate-200 font-sans">
                            {row.metric}
                          </td>
                          {(row.values || []).map((val: number | null, vIdx: number) => (
                            <td key={vIdx} className="py-2.5 px-3 text-right text-slate-200 font-mono">
                              {val !== null ? `₹${val.toLocaleString()}` : '—'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Special View: Cash Flow Quality Table */}
            {activeTab === 'cash_quality' && researchData.data?.table && (
              <div className="p-5 rounded-xl bg-[#111520] border border-[#1e2433] space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-emerald-400" />
                    <span>Cash Quality & Capital Allocation ({researchData.data.unit || '₹ Crores'})</span>
                  </h3>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {researchData.data.source || 'Audited Cash Flow Statements'}
                  </span>
                </div>

                <div className="overflow-x-auto border border-[#1e2433] rounded-lg">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-[#0a0d14] text-slate-400 font-mono uppercase text-[10px] border-b border-[#1e2433]">
                      <tr>
                        <th className="py-2.5 px-3">Cash Flow Metric</th>
                        {(researchData.data.years || []).map((yr: string) => (
                          <th key={yr} className="py-2.5 px-3 text-right">{yr}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1e2433] font-mono">
                      {researchData.data.table.map((row: any, idx: number) => {
                        const isFcf = row.metric === 'Free Cash Flow';
                        const isCfo = row.metric.includes('Operating');
                        return (
                          <tr key={idx} className={`hover:bg-[#161c28]/50 transition-colors ${isFcf ? 'bg-emerald-950/15' : ''}`}>
                            <td className={`py-2.5 px-3 font-sans ${isFcf ? 'font-bold text-emerald-400' : isCfo ? 'font-semibold text-slate-100' : 'text-slate-300'}`}>
                              {row.metric}
                            </td>
                            {(row.values || []).map((val: number | null, vIdx: number) => (
                              <td key={vIdx} className={`py-2.5 px-3 text-right font-mono ${isFcf ? 'font-bold text-emerald-300' : 'text-slate-200'}`}>
                                {val !== null ? `₹${val.toLocaleString()}` : '—'}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Special View: Narrative vs Numbers Table */}
            {activeTab === 'narrative_vs_numbers' && researchData.data?.comparisons && (
              <div className="p-5 rounded-xl bg-[#111520] border border-[#1e2433] space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                    Management Promise vs Reported Delivery (Last 4 Quarters)
                  </h3>
                  <span className="text-[11px] text-slate-400 font-mono">
                    Temporal Alignment Verified
                  </span>
                </div>

                <div className="overflow-x-auto border border-[#1e2433] rounded-lg">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-[#0a0d14] text-slate-400 font-mono uppercase text-[10px] border-b border-[#1e2433]">
                      <tr>
                        <th className="py-2.5 px-3">Guidance Statement</th>
                        <th className="py-2.5 px-3">Target Period</th>
                        <th className="py-2.5 px-3">Target Range</th>
                        <th className="py-2.5 px-3">Reported Outcome</th>
                        <th className="py-2.5 px-3">Delivery Status</th>
                        <th className="py-2.5 px-3">Analytical Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1e2433] font-mono">
                      {researchData.data.comparisons.map((c: any, idx: number) => {
                        const isAchieved = c.status === 'achieved';
                        const isMissed = c.status === 'missed';
                        return (
                          <tr key={idx} className="hover:bg-[#161c28]/50">
                            <td className="py-3 px-3 font-medium text-slate-200 max-w-xs font-sans">
                              {c.statement}
                            </td>
                            <td className="py-3 px-3 text-slate-300">{c.target_period || 'FY25'}</td>
                            <td className="py-3 px-3 text-slate-300">{c.target_range}</td>
                            <td className="py-3 px-3 text-white font-bold">
                              {c.actual_value !== null ? `${c.actual_value}%` : 'Pending'}
                            </td>
                            <td className="py-3 px-3">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] uppercase font-bold border ${
                                isAchieved
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                  : isMissed
                                  ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                                  : 'bg-slate-800 text-slate-400 border-slate-700'
                              }`}>
                                {isAchieved ? <CheckCircle2 className="w-3 h-3" /> : isMissed ? <XCircle className="w-3 h-3" /> : <HelpCircle className="w-3 h-3" />}
                                {c.status.replace('_', ' ')}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-slate-400 font-sans text-[11px]">
                              {c.assessment}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Special View: Bull vs Bear Analysis */}
            {activeTab === 'bull_bear' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Bull Case */}
                <div className="p-4 rounded-xl bg-emerald-950/10 border border-emerald-500/30 space-y-3">
                  <div className="flex items-center gap-2 text-emerald-400 font-mono text-xs font-bold uppercase">
                    <TrendingUp className="w-4 h-4" />
                    <span>Evidence-Grounded Bull Case</span>
                  </div>
                  <div className="space-y-2">
                    {(researchData.data?.bull_case || []).map((point: any, idx: number) => (
                      <div key={idx} className="p-2.5 rounded-lg bg-[#0a0d14] border border-[#1e2433] space-y-1 text-xs">
                        <div className="font-semibold text-slate-100">{point.claim}</div>
                        <div className="text-[11px] text-slate-400">{point.evidence}</div>
                        <div className="text-[10px] text-slate-400 font-mono italic">Caveat: {point.caveat}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Bear Case */}
                <div className="p-4 rounded-xl bg-rose-950/10 border border-rose-500/30 space-y-3">
                  <div className="flex items-center gap-2 text-rose-400 font-mono text-xs font-bold uppercase">
                    <TrendingDown className="w-4 h-4" />
                    <span>Primary Disclosed Bear Case & Risks</span>
                  </div>
                  <div className="space-y-2">
                    {(researchData.data?.bear_case || []).map((point: any, idx: number) => (
                      <div key={idx} className="p-2.5 rounded-lg bg-[#0a0d14] border border-[#1e2433] space-y-1 text-xs">
                        <div className="font-semibold text-slate-100">{point.claim}</div>
                        <div className="text-[11px] text-slate-400">{point.evidence}</div>
                        <div className="text-[10px] text-slate-400 font-mono italic">Caveat: {point.caveat}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Key Observations List */}
            {researchData.key_observations && researchData.key_observations.length > 0 && (
              <div className="p-5 rounded-xl bg-[#111520] border border-[#1e2433] space-y-3">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                  Key Quantitative & Operating Observations
                </h3>
                <ul className="space-y-2 text-xs">
                  {researchData.key_observations.map((obs, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-slate-300">
                      <span className="text-blue-400 font-mono font-bold">&bull;</span>
                      <span>{obs}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Primary Source Citations Panel */}
            {researchData.citations && researchData.citations.length > 0 && (
              <div className="p-5 rounded-xl bg-[#111520] border border-[#1e2433] space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-blue-400" />
                    <span>Primary-Source Provenance Citations ({researchData.citations.length})</span>
                  </h3>
                  <span className="text-[10px] text-slate-400 font-mono">Zero Broker Opinion</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {researchData.citations.map((c, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedCitation(c)}
                      className="p-3 rounded-lg bg-[#0a0d14] border border-[#1e2433] hover:border-blue-500/40 text-left transition-all group"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-[#1e2433] text-slate-300">
                          {c.type.replace('_', ' ')}
                        </span>
                        <span className="text-[10px] text-blue-400 group-hover:underline font-mono">
                          Inspect &rarr;
                        </span>
                      </div>
                      <p className="text-xs font-medium text-slate-200 mt-2 truncate">
                        {c.source}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Caveats & Missing Info Safeguards */}
            {researchData.missing_info && researchData.missing_info.length > 0 && (
              <div className="p-4 rounded-xl bg-[#0a0d14] border border-amber-500/20 text-amber-400/90 text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-bold font-mono text-[11px] uppercase">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Analytical Boundary & Missing Primary Data</span>
                </div>
                {researchData.missing_info.map((info, idx) => (
                  <p key={idx} className="text-[11px] text-slate-400 pl-5">
                    • {info}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Citation Drawer */}
      <CitationDrawer
        citation={selectedCitation}
        onClose={() => setSelectedCitation(null)}
      />
    </div>
  );
}

export default function ResearchWorkbenchPage() {
  return (
    <Suspense fallback={
      <div className="p-8 text-center text-xs text-slate-400 font-mono bg-[#0a0d14] min-h-screen">
        Loading research workbench...
      </div>
    }>
      <ResearchContent />
    </Suspense>
  );
}
