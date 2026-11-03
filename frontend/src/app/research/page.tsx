'use client';

import React, { useCallback, useEffect, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Header } from '@/components/Header';
import { api } from '@/lib/api';
import { Company, DocumentState, ResearchResponse } from '@/types';
import {
  Search,
  BookOpen,
  Sparkles,
  AlertCircle,
  AlertTriangle,
  ExternalLink,
  FileSearch,
  Loader2,
  X
} from 'lucide-react';
import {
  AskResult,
  BalanceSheetView,
  BullBearView,
  BusinessView,
  CashQualityView,
  FinancialView,
  GuidanceView,
  NarrativeView,
  TrajectoryView
} from '@/components/ResearchViews';
import { PriceScenariosView } from '@/components/PriceScenarios';
import { useToast } from '@/components/Toast';
import { changeTone, signedPct } from '@/lib/ui';

const RESEARCH_TABS = [
  { id: 'business_snapshot', label: 'Business' },
  { id: 'financial_snapshot', label: 'Financials' },
  { id: 'trajectory', label: 'Trajectory' },
  { id: 'balance_sheet', label: 'Balance Sheet' },
  { id: 'cash_quality', label: 'Cash Quality' },
  { id: 'narrative_vs_numbers', label: 'Narrative vs Numbers' },
  { id: 'guidance', label: 'Guidance' },
  { id: 'bull_bear', label: 'Bull vs Bear' },
  { id: 'price_scenarios', label: 'Price Scenarios' },
];
const DOCUMENT_VIEWS = new Set(['business_snapshot', 'narrative_vs_numbers', 'guidance', 'bull_bear']);
const VIEWS = {
  business_snapshot: BusinessView,
  financial_snapshot: FinancialView,
  trajectory: TrajectoryView,
  balance_sheet: BalanceSheetView,
  cash_quality: CashQualityView,
  narrative_vs_numbers: NarrativeView,
  guidance: GuidanceView,
  bull_bear: BullBearView,
  price_scenarios: PriceScenariosView,
} as Record<string, React.ComponentType<{ data: any }>>;

const FALLBACK_TICKERS = ['INFY', 'RELIANCE', 'TCS', 'HDFCBANK', 'TRENT', 'BEL'];
const SUGGESTED_QUESTIONS = ['margin guidance', 'large deal wins', 'capex plans', 'segment growth', 'debt and leverage'];
const DOCUMENT_POLL_MS = 5000;

function documentSummary(state: DocumentState): string {
  const parts = [`${state.annual_reports} annual report${state.annual_reports === 1 ? '' : 's'}`, `${state.transcripts} concall transcript${state.transcripts === 1 ? '' : 's'}`];
  if (state.presentations) parts.push(`${state.presentations} presentation${state.presentations === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

function ResearchContent() {
  const router = useRouter();
  const toast = useToast();
  const searchParams = useSearchParams();
  const urlTicker = (searchParams.get('ticker') || 'INFY').toUpperCase();

  const [ticker, setTicker] = useState(urlTicker);
  const [tickerInput, setTickerInput] = useState(urlTicker);
  const [suggestions, setSuggestions] = useState(FALLBACK_TICKERS);
  const [activeTab, setActiveTab] = useState('business_snapshot');
  const [company, setCompany] = useState<Company | null>(null);
  const [documentState, setDocumentState] = useState<DocumentState | null>(null);
  const [researchData, setResearchData] = useState<ResearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState<string | null>(null);
  const [tabError, setTabError] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<ResearchResponse | null>(null);

  // Every research call writes a session row, so revisited tabs reuse the first answer.
  const cache = useRef(new Map<string, ResearchResponse>());
  const requestId = useRef(0);
  const tabBarRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  const runTabResearch = useCallback(async (targetTicker: string, researchType: string) => {
    const current = ++requestId.current;
    const cacheKey = `${targetTicker}:${researchType}`;
    setTabError(null);

    const cached = cache.current.get(cacheKey);
    if (cached) {
      setResearchData(cached);
      setLoading(false);
      return;
    }

    setResearchData(null);
    setLoading(true);
    try {
      const res = await api.runResearch(targetTicker, researchType);
      // A partial answer must not stick: the documents may still be arriving, or the model may recover.
      const isPartial = DOCUMENT_VIEWS.has(researchType) && (res.data?.document_state?.state === 'preparing' || res.data?.ai_error);
      if (!isPartial) cache.current.set(cacheKey, res);
      if (current === requestId.current) {
        setResearchData(res);
        if (res.data?.document_state) setDocumentState(res.data.document_state);
      }
    } catch (err: any) {
      if (current === requestId.current) setTabError(err.message || 'Research request failed');
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setTicker(urlTicker);
    setTickerInput(urlTicker);
  }, [urlTicker]);

  useEffect(() => {
    api.getPortfolios()
      .then((res) => {
        const active = res.portfolios.find((p) => p.id === res.active_id);
        if (active?.holdings.length) setSuggestions(active.holdings.map((h) => h.ticker).slice(0, 12));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setNotFound(null);
    setAnswer(null);
    setCompany(null);
    setDocumentState(null);

    // Never leave the previous company's analysis showing under a new ticker.
    requestId.current++;
    setResearchData(null);
    setLoading(true);

    // Any listed company is added on first use; a failure here surfaces as "not found" below.
    api.ensureCompany(ticker)
      .catch(() => null)
      .then(() => api.getCompany(ticker))
      .then((compRes) => {
        if (cancelled) return;
        setCompany(compRes);
        runTabResearch(ticker, activeTabRef.current);
      })
      .catch((err) => {
        if (cancelled) return;
        requestId.current++;
        setResearchData(null);
        setLoading(false);
        setNotFound(err.message || `Could not load ${ticker}`);
      });

    return () => {
      cancelled = true;
    };
  }, [ticker, runTabResearch]);

  // Reading documents takes a while, so the page watches and refreshes itself when they're ready.
  const isPreparing = documentState?.state === 'preparing';
  useEffect(() => {
    if (!isPreparing) return;
    const interval = setInterval(async () => {
      try {
        const { state } = await api.getCompanyDocuments(ticker);
        setDocumentState(state);
        if (state.state !== 'preparing' && DOCUMENT_VIEWS.has(activeTabRef.current)) {
          runTabResearch(ticker, activeTabRef.current);
        }
      } catch {
        // The next tick tries again.
      }
    }, DOCUMENT_POLL_MS);
    return () => clearInterval(interval);
  }, [isPreparing, ticker, runTabResearch]);

  useEffect(() => {
    tabBarRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [activeTab]);

  const openTicker = (next: string) => {
    const symbol = next.trim().toUpperCase();
    if (!symbol) return;
    if (symbol === ticker) {
      setTickerInput(symbol);
      return;
    }
    router.push(`/research?ticker=${encodeURIComponent(symbol)}`);
  };

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    runTabResearch(ticker, tabId);
  };

  const ask = async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed || !ticker) return;
    try {
      setQuestion(trimmed);
      setAsking(true);
      setAnswer(await api.runResearch(ticker, 'custom', trimmed));
    } catch (err: any) {
      toast({ message: err.message || 'That question could not be answered', tone: 'error' });
    } finally {
      setAsking(false);
    }
  };

  const data = researchData?.data;
  const ActiveView = VIEWS[activeTab];
  const isDocumentView = DOCUMENT_VIEWS.has(activeTab);
  const hasContent = data && Object.keys(data).some((key) => !['document_state', 'ai_enabled', 'ai_error', 'source', 'source_url', 'basis'].includes(key));

  return (
    <div className="flex-1 flex flex-col bg-[#0a0d14]">
      <Header />

      <main className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto w-full">
        <div className="space-y-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              openTicker(tickerInput);
            }}
            className="flex items-center gap-2"
          >
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={tickerInput}
                onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
                placeholder="NSE or BSE ticker (e.g. INFY)"
                aria-label="NSE or BSE ticker"
                autoCapitalize="characters"
                className="w-full bg-[#111520] border border-[#1e2433] rounded-lg pl-9 pr-3 py-2 text-base md:text-xs text-white uppercase font-mono font-bold focus:outline-none focus:border-blue-500"
              />
            </div>
            <button type="submit" className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-mono font-medium transition-colors">
              Load
            </button>
          </form>

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0 text-[11px] font-mono">
            {suggestions.map((t) => (
              <button
                key={t}
                onClick={() => openTicker(t)}
                aria-pressed={ticker === t}
                className={`px-2.5 py-1 rounded border transition-colors whitespace-nowrap ${
                  ticker === t
                    ? 'bg-blue-600/20 text-blue-400 border-blue-500/40 font-bold'
                    : 'bg-[#111520] text-slate-400 border-[#1e2433] hover:text-white'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {notFound ? (
          <div className="p-6 rounded-xl bg-[#111520] border border-amber-500/30 space-y-2">
            <h1 className="text-sm font-semibold text-white flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              No listed company found for {ticker}
            </h1>
            <p className="text-xs text-slate-400 leading-relaxed">
              It isn&apos;t in the NSE or BSE company lists, or those lists couldn&apos;t be reached. Search by name with the bar at the top.
            </p>
          </div>
        ) : (
          <>
            {company ? (
              <div className="p-4 rounded-xl bg-[#111520] border border-[#1e2433] space-y-2 animate-fade-in">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-lg font-bold text-white tracking-tight">{company.name}</h1>
                  {company.sector && (
                    <span className="text-[11px] px-2 py-0.5 rounded bg-[#0a0d14] text-slate-300 border border-[#1e2433]">
                      {company.sector}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-xs font-mono text-slate-400">
                  {company.latest_price !== null && (
                    <span className="text-slate-200">
                      ₹{company.latest_price.toLocaleString('en-IN')}{' '}
                      <span className={changeTone(company.daily_change_pct)}>{signedPct(company.daily_change_pct)}</span>
                    </span>
                  )}
                  {documentState && (
                    <span className="inline-flex items-center gap-1.5" role="status">
                      {isPreparing ? <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" /> : <BookOpen className="w-3.5 h-3.5" />}
                      {isPreparing ? `Reading documents... ${documentState.ready} done so far` : documentSummary(documentState)}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="h-[84px] rounded-xl bg-[#111520] border border-[#1e2433] animate-pulse" />
            )}

            {/* A question answered only from this company's own documents */}
            <div className="space-y-2">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  ask(question);
                }}
                className="flex items-center gap-2 p-1.5 rounded-xl bg-[#111520] border border-blue-500/40 focus-within:border-blue-500 transition-colors"
              >
                <Sparkles className="w-4 h-4 text-blue-400 ml-2 shrink-0" />
                <input
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder={`Ask about ${ticker}'s reports and transcripts...`}
                  aria-label="Ask about this company's documents"
                  className="w-full min-w-0 bg-transparent border-none text-base md:text-xs text-white placeholder-slate-400 focus:outline-none px-1"
                />
                <button
                  type="submit"
                  disabled={asking || !question.trim()}
                  className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium font-mono transition-colors shrink-0 disabled:opacity-50"
                >
                  {asking ? 'Reading...' : 'Ask'}
                </button>
              </form>
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0 text-[11px]">
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => ask(q)}
                    disabled={asking}
                    className="px-2.5 py-1 rounded-full border border-[#1e2433] text-slate-400 hover:text-slate-100 hover:border-slate-600 whitespace-nowrap transition-colors disabled:opacity-50"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            {answer && (
              <div className="relative animate-fade-in">
                <button
                  onClick={() => setAnswer(null)}
                  aria-label="Close answer"
                  className="absolute top-3 right-3 p-1.5 rounded text-slate-400 hover:text-white hover:bg-[#1a2030]"
                >
                  <X className="w-4 h-4" />
                </button>
                <AskResult result={answer} />
              </div>
            )}

            <div
              ref={tabBarRef}
              role="tablist"
              aria-label="Research views"
              className="sticky top-14 z-30 flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0 py-2 bg-[#0a0d14] border-b border-[#1e2433] text-xs font-mono"
            >
              {RESEARCH_TABS.map((tab) => (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={activeTab === tab.id}
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

            {tabError ? (
              <div className="p-6 rounded-xl bg-[#111520] border border-rose-500/30 text-center space-y-3">
                <p className="text-xs text-rose-300 font-mono">This view failed to load: {tabError}</p>
                <button onClick={() => runTabResearch(ticker, activeTab)} className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium">
                  Try again
                </button>
              </div>
            ) : loading || !researchData ? (
              <div className="space-y-3" aria-label={`Loading research for ${ticker}`}>
                {isDocumentView && (
                  <p className="flex items-center gap-2 text-[11px] font-mono text-slate-400" role="status">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
                    The first read of a company&apos;s documents can take a minute. It&apos;s saved afterwards.
                  </p>
                )}
                <div className="h-24 rounded-xl bg-[#111520] border border-[#1e2433] animate-pulse" />
                <div className="h-52 rounded-xl bg-[#111520] border border-[#1e2433] animate-pulse" />
              </div>
            ) : (
              <div className="space-y-4 animate-fade-in" role="tabpanel">
                {researchData.summary && (
                  <div className="p-4 rounded-xl bg-[#111520] border border-[#1e2433] space-y-2">
                    <h2 className="text-xs font-bold text-white uppercase tracking-wider font-mono">Takeaway</h2>
                    <p className="text-[13px] text-slate-200 leading-relaxed">{researchData.summary}</p>
                  </div>
                )}

                {isDocumentView && isPreparing && (
                  <p className="flex items-start gap-2 p-3 rounded-lg bg-[#0a0d14] border border-blue-500/30 text-[11px] text-slate-300 leading-relaxed" role="status">
                    <FileSearch className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                    The annual report and transcripts are being downloaded and read. This view updates by itself when they&apos;re ready.
                  </p>
                )}

                {hasContent && ActiveView && <ActiveView data={data} />}

                {researchData.key_observations?.length > 0 && (
                  <div className="p-4 rounded-xl bg-[#111520] border border-[#1e2433] space-y-2.5">
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">Key observations</h3>
                    <ul className="space-y-2 text-xs">
                      {researchData.key_observations.map((obs, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-slate-300 leading-relaxed">
                          <span className="text-blue-400 font-mono font-bold">&bull;</span>
                          <span>{obs}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {researchData.missing_info?.length > 0 && (
                  <div className="p-4 rounded-xl bg-[#0a0d14] border border-amber-500/20 text-xs space-y-1">
                    <div className="flex items-center gap-1.5 font-bold font-mono text-[11px] uppercase text-amber-400/90">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>What&apos;s missing</span>
                    </div>
                    {researchData.missing_info.map((info, idx) => (
                      <p key={idx} className="text-[11px] text-slate-400 pl-5">{info}</p>
                    ))}
                  </div>
                )}

                {/* Where this view's facts came from */}
                {isDocumentView && researchData.citations.length > 0 && (
                  <div className="p-4 rounded-xl bg-[#111520] border border-[#1e2433] space-y-2.5">
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-blue-400" />
                      <span>Documents read ({researchData.citations.length})</span>
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {researchData.citations.map((c, idx) => (
                        <a
                          key={idx}
                          href={c.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-3 rounded-lg bg-[#0a0d14] border border-[#1e2433] hover:border-blue-500/40 transition-colors flex items-center justify-between gap-3"
                        >
                          <span className="min-w-0">
                            <span className="block text-xs font-medium text-slate-200 truncate">{c.source}</span>
                            <span className="block text-[10px] font-mono text-slate-500 mt-0.5">
                              {c.type.replace(/_/g, ' ')}{c.pages ? ` · ${c.pages} pages` : ''}
                            </span>
                          </span>
                          <ExternalLink className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {!isDocumentView && data?.source && hasContent && (
                  <p className="text-[10px] font-mono text-slate-500">
                    Sources:{' '}
                    {data.source_url ? (
                      <a href={data.source_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">{data.source}</a>
                    ) : data.source}
                    {data.basis ? `, ${data.basis}` : ''}. {activeTab === 'price_scenarios' ? 'Every scenario is calculated by FINN, with no AI.' : 'All ratios and growth rates are calculated by FINN from those figures.'}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default function ResearchWorkbenchPage() {
  return (
    <Suspense fallback={
      <div className="p-8 text-center text-xs text-slate-400 font-mono bg-[#0a0d14] min-h-screen">
        Loading research...
      </div>
    }>
      <ResearchContent />
    </Suspense>
  );
}
