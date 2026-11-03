'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronDown, ExternalLink, Loader2, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import type { DocumentSummaryState, SummaryItem } from '@/types';

const POLL_MS = 3000;
const SECONDS_PER_CALL = 15;
export const SUMMARIES_STARTED_EVENT = 'finn:summaries-started';

function PageLink({ page, url }: { page: number | null; url: string | null }) {
  if (!page) return null;
  return url ? (
    <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-[10px] font-mono text-blue-400 hover:text-blue-300 whitespace-nowrap">
      p.{page} <ExternalLink className="w-2.5 h-2.5" />
    </a>
  ) : (
    <span className="text-[10px] font-mono text-slate-500">p.{page}</span>
  );
}

function Unmatched({ item }: { item: SummaryItem }) {
  if (item.verified !== false) return null;
  return (
    <span className="block text-[10px] font-mono text-amber-400 mt-0.5">
      {item.unmatched?.length ? `${item.unmatched.join(', ')} not found in the document` : 'A number here was not found in the document'}
    </span>
  );
}

function Points({ items }: { items: SummaryItem[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2 text-xs text-slate-300 leading-relaxed">
          <span className="text-slate-500 shrink-0">•</span>
          <span className="min-w-0">
            {item.text} <PageLink page={item.page} url={item.url} />
            <Unmatched item={item} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function minutes(calls: number): string {
  const total = Math.max(1, Math.round((calls * SECONDS_PER_CALL) / 60));
  return total === 1 ? 'about a minute' : `about ${total} minutes`;
}

// Very long reports are read up to a page limit, so say "the first 500 of 590 pages" rather than "all".
function pagesPhrase(read: number, total: number | null): string {
  return total && total > read ? `the first ${read} of ${total} pages` : `all ${read} pages`;
}

export function DocumentSummary({ documentId }: { documentId: number }) {
  const [state, setState] = useState<DocumentSummaryState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [sectionsOpen, setSectionsOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setState(await api.getDocumentSummary(documentId));
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Could not load the summary');
    }
  }, [documentId]);

  useEffect(() => {
    load();
    const refresh = () => load();
    window.addEventListener(SUMMARIES_STARTED_EVENT, refresh);
    return () => window.removeEventListener(SUMMARIES_STARTED_EVENT, refresh);
  }, [load]);

  useEffect(() => {
    if (state?.status !== 'running') return;
    const interval = setInterval(load, POLL_MS);
    return () => clearInterval(interval);
  }, [state?.status, load]);

  const start = async () => {
    setStarting(true);
    setError(null);
    try {
      setState(await api.startDocumentSummary(documentId));
    } catch (err: any) {
      setError(err.message || 'Could not start the summary');
    } finally {
      setStarting(false);
    }
  };

  if (!state) {
    return error ? <p className="text-[11px] font-mono text-rose-300">{error}</p> : <div className="h-24 rounded-lg bg-[#161c28] animate-pulse" aria-label="Loading summary" />;
  }
  if (state.status === 'unreadable') {
    return <p className="text-[11px] font-mono text-slate-400">This document has no readable text to summarise.</p>;
  }

  const summary = state.summary;

  if (state.status === 'done' && summary?.mode === 'ai') {
    return (
      <div className="space-y-3" aria-label="Document summary">
        {summary.headline && <p className="text-sm font-semibold text-white leading-snug">{summary.headline}</p>}
        {summary.overview && (
          <div>
            <p className="text-xs text-slate-300 leading-relaxed">{summary.overview}</p>
            {summary.overview_verified === false && <span className="block text-[10px] font-mono text-amber-400 mt-0.5">A number here was not found in the document</span>}
          </div>
        )}

        {!!summary.key_points?.length && (
          <section>
            <h4 className="text-[10px] uppercase tracking-wider font-mono text-slate-500 mb-1.5">Key points</h4>
            <Points items={summary.key_points} />
          </section>
        )}

        {!!summary.figures?.length && (
          <section>
            <h4 className="text-[10px] uppercase tracking-wider font-mono text-slate-500 mb-1.5">Figures</h4>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {summary.figures.map((f, i) => (
                <div key={i} className="flex items-baseline justify-between gap-2 px-2.5 py-1.5 rounded-md bg-[#111520] border border-[#1e2433]">
                  <dt className="text-[11px] text-slate-400 min-w-0 truncate">{f.label}{f.period ? ` · ${f.period}` : ''}</dt>
                  <dd className="flex items-baseline gap-1.5 shrink-0">
                    <span className="text-xs font-mono font-semibold text-slate-100 tabular-nums">{f.value}</span>
                    <PageLink page={f.page} url={f.url} />
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {!!summary.risks?.length && (
          <section>
            <h4 className="text-[10px] uppercase tracking-wider font-mono text-slate-500 mb-1.5">Risks the document raises</h4>
            <Points items={summary.risks} />
          </section>
        )}

        {!!summary.sections?.length && (
          <section>
            <button
              onClick={() => setSectionsOpen(!sectionsOpen)}
              aria-expanded={sectionsOpen}
              className="flex items-center gap-1.5 text-[11px] font-mono text-slate-300 hover:text-white"
            >
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${sectionsOpen ? 'rotate-180' : ''}`} />
              Section by section ({summary.sections.length})
            </button>
            {sectionsOpen && (
              <ol className="mt-2 space-y-2 animate-fade-in">
                {summary.sections.map((s, i) => (
                  <li key={i} className="p-2.5 rounded-md bg-[#111520] border border-[#1e2433] space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-mono text-slate-500">Pages {s.first_page}–{s.last_page}</span>
                      {s.url && (
                        <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-[10px] font-mono text-blue-400 hover:text-blue-300">
                          Open <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                    </div>
                    {s.summary && <p className="text-xs text-slate-300 leading-relaxed">{s.summary}</p>}
                    {!!s.points.length && <Points items={s.points} />}
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}

        <p className="text-[10px] font-mono text-slate-500 leading-relaxed">
          AI summary of {pagesPhrase(summary.pages_read ?? state.pages_available, state.page_count)} in {summary.calls} call{summary.calls === 1 ? '' : 's'} ({summary.model}).
          {summary.figures_dropped ? ` ${summary.figures_dropped} figure${summary.figures_dropped === 1 ? '' : 's'} not found in the document ${summary.figures_dropped === 1 ? 'was' : 'were'} removed.` : ''}
          {' '}Check important figures against the page.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3" aria-label="Document summary">
      {state.status === 'running' && (
        <div role="status" className="space-y-1.5">
          <div className="flex items-center gap-2 text-[11px] font-mono text-blue-300">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            {state.progress && state.progress.total > 1
              ? `Reading part ${Math.min(state.progress.done + 1, state.progress.total)} of ${state.progress.total}`
              : 'Reading the document'}
          </div>
          {state.progress && state.progress.total > 1 && (
            <div className="h-1.5 rounded-full bg-[#1e2433] overflow-hidden">
              <div className="h-full bg-blue-500 transition-all" style={{ width: `${(100 * state.progress.done) / state.progress.total}%` }} />
            </div>
          )}
          <p className="text-[10px] font-mono text-slate-500">You can leave this page. The summary is saved when it&apos;s done.</p>
        </div>
      )}

      {state.status === 'failed' && state.error && (
        <p className="flex items-start gap-2 text-[11px] font-mono text-amber-300">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{state.error} Parts already read are kept.</span>
        </p>
      )}
      {error && <p className="text-[11px] font-mono text-rose-300">{error}</p>}

      {state.status !== 'running' && (
        state.ai_configured ? (
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={start}
              disabled={starting}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium disabled:opacity-50"
            >
              {starting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {state.status === 'failed' ? 'Try again' : 'Summarise whole document'}
            </button>
            <span className="text-[10px] font-mono text-slate-500">
              {pagesPhrase(state.pages_available, state.page_count).replace(/^./, (c) => c.toUpperCase())}, {state.calls_needed} AI call{state.calls_needed === 1 ? '' : 's'}, {minutes(state.calls_needed)}
            </span>
          </div>
        ) : (
          <p className="text-[11px] font-mono text-slate-400">
            <Link href="/settings" className="text-blue-400 hover:text-blue-300 underline">Add an AI key</Link> for a full summary of every page.
          </p>
        )
      )}

      {summary?.mode === 'extract' && !!summary.sentences?.length && (
        <section>
          <h4 className="text-[10px] uppercase tracking-wider font-mono text-slate-500 mb-1.5">Key sentences, picked from the document without AI</h4>
          <Points items={summary.sentences} />
        </section>
      )}
    </div>
  );
}
