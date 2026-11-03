'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronDown, ExternalLink, FileText, Loader2, Search, Sparkles } from 'lucide-react';
import { DocumentSummary, SUMMARIES_STARTED_EVENT } from '@/components/DocumentSummary';
import { Header } from '@/components/Header';
import { api } from '@/lib/api';
import { PortfolioDocuments, DocumentSearchResult, PortfolioDocument } from '@/types';
import { useToast } from '@/components/Toast';
import { screenerDocumentsUrl } from '@/lib/ui';

const POLL_MS = 5000;
const TYPE_LABEL: Record<string, string> = { annual_report: 'Annual report', concall_transcript: 'Concall transcript', investor_presentation: 'Investor presentation' };

function DocumentRow({ document }: { document: PortfolioDocument }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'summary' | 'search'>('summary');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DocumentSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const readable = document.status === 'processed';

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    try {
      setResults((await api.searchDocument(document.id, query.trim())).results);
    } catch (err: any) {
      setError(err.message || 'The search failed');
    } finally {
      setSearching(false);
    }
  };

  return (
    <li data-document-id={document.id} className="rounded-lg bg-[#0a0d14] border border-[#1e2433]">
      <div className="flex items-center justify-between gap-3 p-3">
        <button
          onClick={() => setOpen(!open)}
          disabled={!readable}
          aria-expanded={open}
          className="flex-1 min-w-0 flex items-start gap-2 text-left disabled:cursor-default"
        >
          <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
          <span className="min-w-0">
            <span className="block text-xs font-medium text-slate-200 truncate">{document.title}</span>
            <span className="block text-[10px] font-mono text-slate-500 mt-0.5">
              {TYPE_LABEL[document.document_type] || document.document_type}
              {document.page_count ? ` · ${document.page_count} pages` : ''}
              {document.status === 'failed' && <span className="text-amber-400"> · couldn&apos;t be read</span>}
              {document.status === 'downloading' && <span className="text-blue-300"> · reading now</span>}
            </span>
          </span>
          {readable && <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5 ml-auto transition-transform ${open ? 'rotate-180' : ''}`} />}
        </button>
        {readable && !open && (
          <button
            onClick={() => { setTab('summary'); setOpen(true); }}
            aria-label={`Summary of ${document.title}`}
            className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-300 hover:text-white shrink-0 py-1"
          >
            <Sparkles className="w-3 h-3" /> Summary
          </button>
        )}
        {document.source_url && (
          <a
            href={document.source_url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${document.title}`}
            className="inline-flex items-center gap-1 text-[11px] font-mono text-blue-400 hover:text-blue-300 shrink-0 py-1"
          >
            PDF <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      {open && (
        <div className="px-3 pb-3 space-y-3 animate-fade-in">
          <div role="tablist" aria-label="Document tools" className="inline-flex items-center gap-1 bg-[#111520] border border-[#1e2433] rounded-lg p-1 text-[11px] font-mono">
            {([['summary', 'Summary'], ['search', 'Search inside']] as const).map(([value, label]) => (
              <button
                key={value}
                role="tab"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
                className={`px-2.5 py-1 rounded transition-colors ${tab === value ? 'bg-blue-600 text-white font-medium' : 'text-slate-400 hover:text-slate-200'}`}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === 'summary' && <DocumentSummary documentId={document.id} />}
          {tab === 'search' && (<>
          <form onSubmit={search} className="flex items-center gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search inside this document"
              aria-label={`Search inside ${document.title}`}
              className="flex-1 min-w-0 bg-[#111520] border border-[#1e2433] rounded-lg px-3 py-2 text-base md:text-xs text-slate-200 focus:outline-none focus:border-blue-500"
            />
            <button type="submit" disabled={searching || !query.trim()} className="p-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50" aria-label="Search">
              {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            </button>
          </form>
          {error && <p className="text-[11px] font-mono text-rose-300">{error}</p>}
          {results?.length === 0 && <p className="text-[11px] font-mono text-slate-400">No page mentions that.</p>}
          {results?.map((result, i) => (
            <blockquote key={i} className="p-3 rounded-lg bg-[#111520] border-l-2 border-blue-500 text-xs text-slate-300 leading-relaxed space-y-1.5">
              <p className="line-clamp-5">{result.text}</p>
              <a href={result.url || undefined} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] font-mono text-blue-400 hover:text-blue-300">
                Page {result.page} <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </blockquote>
          ))}
          </>)}
        </div>
      )}
    </li>
  );
}

export default function SourcesExplorerPage() {
  const toast = useToast();
  const [data, setData] = useState<PortfolioDocuments | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState('all');

  const load = useCallback(async () => {
    try {
      setData(await api.getPortfolioDocuments());
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Could not load documents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const anyPreparing = !!data?.companies.some((c) => c.state.state === 'preparing');
  useEffect(() => {
    if (!anyPreparing) return;
    const interval = setInterval(load, POLL_MS);
    return () => clearInterval(interval);
  }, [anyPreparing, load]);

  const fetchDocuments = async (ticker: string) => {
    try {
      await api.fetchCompanyDocuments(ticker);
      await load();
    } catch (err: any) {
      toast({ message: err.message || 'Could not start reading', tone: 'error' });
    }
  };

  const fetchAll = async () => {
    const waiting = (data?.companies || []).filter((c) => c.state.state === 'none' || c.state.state === 'failed');
    await Promise.allSettled(waiting.map((c) => api.fetchCompanyDocuments(c.ticker)));
    await load();
  };

  const [summarising, setSummarising] = useState(false);
  const summariseAll = async () => {
    const ids = (data?.companies || []).flatMap((c) =>
      c.documents.filter((d) => d.status === 'processed' && (typeFilter === 'all' || d.document_type === typeFilter)).map((d) => d.id));
    if (ids.length === 0) return;
    setSummarising(true);
    try {
      const results = await Promise.allSettled(ids.map((id) => api.startDocumentSummary(id)));
      const refused = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
      if (refused && results.every((r) => r.status === 'rejected')) {
        toast({ message: refused.reason?.message || 'Could not start the summaries', tone: 'error' });
      } else {
        toast({ message: `Summarising ${ids.length} document${ids.length === 1 ? '' : 's'}, one call at a time. Open any of them to follow along.` });
      }
      window.dispatchEvent(new Event(SUMMARIES_STARTED_EVENT));
    } finally {
      setSummarising(false);
    }
  };

  const totalDocuments = data?.companies.reduce((sum, c) => sum + c.state.ready, 0) ?? 0;
  const unread = data?.companies.filter((c) => c.state.state === 'none' || c.state.state === 'failed').length ?? 0;

  return (
    <div className="flex-1 flex flex-col bg-[#0a0d14]">
      <Header onRefresh={load} isRefreshing={loading} />

      <main className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto w-full">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Sources &amp; Documents</h1>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            Annual reports and concall transcripts for {data?.portfolio ? <span className="text-slate-200">{data.portfolio}</span> : 'your portfolio'}.
            Open any of them for a summary of the whole document, or to search inside it. Research answers only from these. Each company&apos;s are read the first time you research it, or when you ask here.
          </p>
        </div>

        {error && (
          <p className="flex items-center gap-2 p-3 rounded-lg bg-[#111520] border border-rose-500/30 text-[11px] font-mono text-rose-300">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            {error}
          </p>
        )}

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div role="group" aria-label="Document type" className="flex items-center gap-1 bg-[#111520] border border-[#1e2433] rounded-lg p-1 text-xs font-mono">
            {[['all', 'All'], ['annual_report', 'Annual reports'], ['concall_transcript', 'Transcripts'], ['investor_presentation', 'Presentations']].map(([value, label]) => (
              <button
                key={value}
                onClick={() => setTypeFilter(value)}
                aria-pressed={typeFilter === value}
                className={`px-2.5 py-1 rounded transition-colors ${typeFilter === value ? 'bg-blue-600 text-white font-medium' : 'text-slate-400 hover:text-slate-200'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 text-[11px] font-mono text-slate-400">
            <span>{totalDocuments} read</span>
            {totalDocuments > 0 && (
              <button
                onClick={summariseAll}
                disabled={summarising}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#2a3449] text-slate-200 hover:text-white disabled:opacity-50"
              >
                {summarising ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                Summarise all
              </button>
            )}
            {unread > 0 && (
              <button onClick={fetchAll} className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium">
                Read {unread} more compan{unread === 1 ? 'y' : 'ies'}
              </button>
            )}
          </div>
        </div>

        {loading && !data ? (
          <div className="h-48 rounded-xl bg-[#111520] border border-[#1e2433] animate-pulse" aria-label="Loading documents" />
        ) : (
          <div className="space-y-3">
            {data?.companies.map((company) => {
              const shown = company.documents.filter((d) => typeFilter === 'all' || d.document_type === typeFilter);
              return (
                <section key={company.ticker} className="p-4 rounded-xl bg-[#111520] border border-[#1e2433] space-y-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/research?ticker=${company.ticker}`} className="text-sm font-semibold text-white hover:text-blue-400 truncate block">{company.name}</Link>
                      <span className="text-[10px] font-mono text-slate-500">{company.ticker}</span>
                    </div>
                    {company.state.state === 'preparing' ? (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-blue-300 shrink-0" role="status">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Reading...
                      </span>
                    ) : (
                      company.state.state !== 'ready' && (
                        <button onClick={() => fetchDocuments(company.ticker)} className="px-2.5 py-1.5 rounded-lg border border-[#2a3449] text-[11px] font-mono text-slate-200 hover:text-white shrink-0">
                          {company.state.state === 'failed' ? 'Try again' : 'Read documents'}
                        </button>
                      )
                    )}
                  </div>
                  {shown.length > 0 && (
                    <ul className="space-y-2">
                      {shown.map((document) => <DocumentRow key={document.id} document={document} />)}
                    </ul>
                  )}
                  {company.state.state === 'ready' && company.state.transcripts === 0 && (
                    <p className="text-[10px] font-mono text-amber-400">
                      No concall transcripts found{company.state.presentations ? ', so investor presentations are used instead' : ''}.{' '}
                      <a href={screenerDocumentsUrl(company.ticker)} target="_blank" rel="noopener noreferrer" className="underline">Check the company&apos;s list</a>
                    </p>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
