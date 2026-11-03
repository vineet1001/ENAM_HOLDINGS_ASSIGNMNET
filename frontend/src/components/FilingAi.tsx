'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronDown, ExternalLink, FileText, Sparkles, UserCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { FilingInsight, FilingPerson, FilingResults } from '@/types';
import { ResultsHeadline } from '@/components/ResultsHeadline';
import { changeTone, signedPct } from '@/lib/ui';

// The model's headline, always labelled as AI so it's never mistaken for the exchange's own words.
export function AiHeadline({ insight, aiEnabled }: { insight: FilingInsight | null; aiEnabled: boolean }) {
  if (insight?.headline) {
    return (
      <div className="flex items-start gap-2">
        <Sparkles className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-1" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white leading-snug">{insight.headline}</p>
          <p className="text-[10px] font-mono text-slate-500 mt-0.5">
            AI headline from the filing{insight.model ? ` · ${insight.model}` : ''} · check the filing before acting
          </p>
          {insight.note && <p className="text-[10px] font-mono text-amber-400 mt-0.5">{insight.note}</p>}
        </div>
      </div>
    );
  }
  if (insight?.note && (insight.status === 'unreadable' || insight.status === 'withheld' || insight.status === 'done')) {
    return (
      <p className="flex items-start gap-1.5 text-[11px] font-mono text-amber-400">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" aria-hidden="true" />
        {insight.note}
      </p>
    );
  }
  if (!aiEnabled) return null;
  return <p className="text-[11px] font-mono text-slate-400 animate-pulse">AI is reading this filing...</p>;
}

function pageUrl(pdfUrl: string, page: number): string {
  return `${pdfUrl}#page=${page}`;
}

function PageLink({ pdfUrl, page }: { pdfUrl: string; page: number | null }) {
  if (!page) return null;
  return (
    <a
      href={pageUrl(pdfUrl, page)}
      target="_blank"
      rel="noopener noreferrer"
      className="font-mono text-[10px] text-blue-400 hover:text-blue-300 whitespace-nowrap"
    >
      p.{page}
    </a>
  );
}

// Numbers copied from the filing and checked against its text. The percentages are FINN's own arithmetic.
function FilingResultsTable({ results, pdfUrl }: { results: FilingResults; pdfUrl: string }) {
  const hasCalculated = results.rows.some((row) => row.calculated);
  return (
    <div className="rounded-lg bg-[#0a0d14] border border-[#1e2433] overflow-hidden animate-fade-in">
      <table className="w-full text-xs text-left">
        <thead className="text-slate-400 font-mono uppercase text-[10px] border-b border-[#1e2433]">
          <tr>
            <th className="py-2 px-3">{results.unit || 'As printed'} · {results.periods.current}</th>
            <th className="py-2 px-2 text-right">Value</th>
            <th className="py-2 px-2 text-right">QoQ</th>
            <th className="py-2 px-3 text-right">YoY</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#1e2433] font-mono tabular-nums">
          {results.rows.map((row) => (
            <tr key={row.metric}>
              <td className="py-2 px-3 font-semibold text-slate-200">
                {row.metric}{row.calculated ? '*' : ''} {!row.calculated && <PageLink pdfUrl={pdfUrl} page={row.page} />}
                {row.printed_together === false && (
                  <span className="block text-[9px] font-normal text-amber-400" title="Each figure is in the filing, but not on one line together, so the row may mix lines.">
                    figures not on one line
                  </span>
                )}
              </td>
              <td className="py-2 px-2 text-right text-white">{row.current.toLocaleString('en-IN')}</td>
              <td className={`py-2 px-2 text-right whitespace-nowrap ${changeTone(row.qoq_pct)}`}>{signedPct(row.qoq_pct, 1)}</td>
              <td className={`py-2 px-3 text-right whitespace-nowrap ${changeTone(row.yoy_pct)}`}>{signedPct(row.yoy_pct, 1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-3 py-2 border-t border-[#1e2433] text-[10px] font-mono text-slate-400 leading-relaxed">
        From this filing{results.basis ? `, ${results.basis}` : ''}, against {results.periods.previous} and {results.periods.year_ago}. Figures are matched to its text.
        {hasCalculated && ' *Calculated as PBT + finance costs + depreciation - other income, because the filing doesn\'t print it.'}
      </p>
    </div>
  );
}

function PersonCard({ person, pdfUrl }: { person: FilingPerson; pdfUrl: string }) {
  return (
    <div className="p-3 rounded-lg bg-[#0a0d14] border border-purple-500/25 space-y-1.5 text-xs animate-fade-in">
      <div className="flex items-start gap-2">
        <UserCheck className="w-3.5 h-3.5 text-purple-400 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="min-w-0">
          <p className="font-semibold text-white">{person.person}</p>
          <p className="text-[11px] text-purple-300">
            {[person.change, person.role].filter(Boolean).join(': ')}
            {person.effective_date ? `, from ${person.effective_date}` : ''}
          </p>
        </div>
      </div>
      {person.background && <p className="text-slate-300 leading-relaxed">{person.background}</p>}
      {person.previous_roles.length > 0 && (
        <p className="text-[11px] text-slate-400 leading-relaxed"><span className="text-slate-500">Previously:</span> {person.previous_roles.join(' · ')}</p>
      )}
      {person.education && (
        <p className="text-[11px] text-slate-400 leading-relaxed"><span className="text-slate-500">Education:</span> {person.education}</p>
      )}
      <div className="flex items-center gap-3 pt-0.5">
        <PageLink pdfUrl={pdfUrl} page={person.page} />
        <a href={person.linkedin_search} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] font-mono text-slate-400 hover:text-slate-200">
          Search LinkedIn <ExternalLink className="w-2.5 h-2.5" />
        </a>
      </div>
    </div>
  );
}

// What a results or management filing needs on the card itself, without opening anything.
export function FilingFirstCut({
  category,
  insight,
  ticker,
  pdfUrl,
  aiEnabled
}: {
  category: string | null | undefined;
  insight: FilingInsight | null;
  ticker: string;
  pdfUrl: string | null | undefined;
  aiEnabled: boolean;
}) {
  if (category === 'results') {
    if (insight?.results && pdfUrl) return <FilingResultsTable results={insight.results} pdfUrl={pdfUrl} />;
    return (
      <div className="space-y-1">
        <ResultsHeadline ticker={ticker} />
        <p className="text-[10px] font-mono text-slate-500">
          Latest reported quarter, from Screener&apos;s table of filings. {aiEnabled ? 'The filing\'s own table appears here once it\'s read.' : ''}
        </p>
      </div>
    );
  }
  if (category === 'management_change') {
    if (insight?.people?.length && pdfUrl) {
      return <div className="space-y-2">{insight.people.map((person) => <PersonCard key={person.person} person={person} pdfUrl={pdfUrl} />)}</div>;
    }
    if (!aiEnabled) {
      return (
        <p className="text-[11px] text-slate-400 leading-relaxed">
          <Link href="/settings" className="text-blue-400 hover:text-blue-300 underline">Add an AI key</Link> to get a short bio of the person from this filing.
        </p>
      );
    }
    if (insight?.status === 'done') {
      return <p className="text-[11px] font-mono text-slate-400">This filing doesn&apos;t name anyone FINN could verify. Open it to check.</p>;
    }
  }
  return null;
}

// Written only when someone asks, because each one uses a model call. Saved afterwards for everyone.
export function FilingSummary({
  announcementId,
  pdfUrl,
  insight
}: {
  announcementId: number;
  pdfUrl: string;
  insight: FilingInsight | null;
}) {
  const [current, setCurrent] = useState(insight);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Polling can bring a newer copy; a summary fetched here stays until it does.
  useEffect(() => {
    if (insight) setCurrent((prev) => (prev?.summary && !insight.summary ? prev : insight));
  }, [insight]);

  const summary = current?.summary;

  const toggle = async () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (summary || loading) return;
    setLoading(true);
    setError(null);
    try {
      setCurrent(await api.createFilingSummary(announcementId));
    } catch (err: any) {
      setError(err.message || 'The summary could not be written');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <a
          href={pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 font-medium hover:bg-emerald-500/20 transition-colors text-[11px]"
        >
          <FileText className="w-3.5 h-3.5" />
          Open filing
          <ExternalLink className="w-3 h-3" />
        </a>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-blue-600/15 text-blue-400 border border-blue-500/30 font-medium hover:bg-blue-600/25 transition-colors text-[11px]"
        >
          <Sparkles className="w-3.5 h-3.5" />
          AI summary
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {open && (
        <div className="p-3 rounded-lg bg-[#0a0d14] border border-blue-500/20 space-y-3 animate-fade-in text-xs">
          {loading && <p className="text-[11px] font-mono text-slate-400 animate-pulse">Reading the filing and writing a summary...</p>}
          {error && <p className="text-[11px] font-mono text-rose-300">{error}</p>}
          {!loading && !error && !summary && current?.note && (
            <p className="text-[11px] font-mono text-amber-400">{current.note}</p>
          )}

          {summary && (
            <>
              <p className="text-slate-200 leading-relaxed">
                {summary.overview}
                {!summary.overview_verified && <span className="ml-1.5 text-[10px] font-mono text-amber-400">has a number not matched to the filing</span>}
              </p>

              {summary.figures.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="text-[10px] font-mono uppercase text-slate-400 border-b border-[#1e2433]">
                      <tr>
                        <th className="py-1 pr-3 font-medium">Figure</th>
                        <th className="py-1 pr-3 font-medium">As printed</th>
                        <th className="py-1 pr-3 font-medium">Period</th>
                        <th className="py-1 font-medium">Page</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1e2433]">
                      {summary.figures.map((figure, i) => (
                        <tr key={i}>
                          <td className="py-1.5 pr-3 text-slate-300">{figure.label}</td>
                          <td className="py-1.5 pr-3 font-mono text-white whitespace-nowrap">{figure.value}</td>
                          <td className="py-1.5 pr-3 font-mono text-slate-400">{figure.period}</td>
                          <td className="py-1.5"><PageLink pdfUrl={pdfUrl} page={figure.page} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {summary.key_points.length > 0 && (
                <ul className="space-y-1.5">
                  {summary.key_points.map((point, i) => (
                    <li key={i} className="flex items-start gap-2 text-slate-300 leading-relaxed">
                      <span className="text-blue-400" aria-hidden="true">&bull;</span>
                      <span className="min-w-0">
                        {point.text} <PageLink pdfUrl={pdfUrl} page={point.page} />
                        {!point.verified && <span className="ml-1.5 text-[10px] font-mono text-amber-400">number not matched to the filing</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <p className="text-[10px] font-mono text-slate-500 leading-relaxed pt-1 border-t border-[#1e2433]">
                AI summary{current?.model ? ` by ${current.model}` : ''}
                {current?.pages_read && current.pages_total ? `, from ${current.pages_read} of ${current.pages_total} pages` : ''}.
                {' '}Numbers are checked against the filing&apos;s text
                {summary.unverified_count > 0 ? `, and ${summary.unverified_count} item${summary.unverified_count > 1 ? 's' : ''} didn't match` : ''}.
                {' '}Not investment advice.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
