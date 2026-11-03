'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  HelpCircle,
  KeyRound,
  MinusCircle,
  Quote,
  TrendingDown,
  TrendingUp,
  XCircle
} from 'lucide-react';
import { changeTone, signedPct } from '@/lib/ui';
import { CheckedText, DocumentSourceRef, GuidanceItem, NarrativeItem, ResearchPoint } from '@/types';

const BAR_COLOR = '#3b82f6';
const BAR_ACTIVE_COLOR = '#93c5fd';
const TREND_HEIGHT = 110;
const CARD = 'p-4 rounded-xl bg-[#111520] border border-[#1e2433] space-y-3';
const HEADING = 'text-xs font-bold text-white uppercase tracking-wider font-mono';

interface TrendPoint {
  label: string;
  value: number | null;
}

interface StatementRow {
  metric: string;
  unit?: string;
  values: Array<number | null>;
}

function formatValue(value: number | null | undefined, unit?: string): string {
  if (value === null || value === undefined) return '—';
  if (unit === 'x') return `${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}x`;
  if (unit === '%') return `${value.toLocaleString('en-IN', { maximumFractionDigits: 1 })}%`;
  return value.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

// One series, one color. The hovered or tapped bar drives a readout above the plot.
export function TrendBars({ points, unit = '₹ Cr' }: { points: TrendPoint[]; unit?: string }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const values = points.map((p) => p.value ?? 0);
  const maxValue = Math.max(0, ...values);
  const minValue = Math.min(0, ...values);
  const span = maxValue - minValue || 1;
  const baseline = (maxValue / span) * TREND_HEIGHT;

  const shownIndex = activeIndex ?? points.length - 1;
  const shown = points[shownIndex];
  const previous = shownIndex > 0 ? points[shownIndex - 1] : null;
  const change = shown?.value !== null && shown?.value !== undefined && previous?.value
    ? ((shown.value - previous.value) / Math.abs(previous.value)) * 100
    : null;
  // Label roughly six periods, however many bars there are, so they stay readable on a phone.
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));

  if (!shown) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3 font-mono" aria-live="polite">
        <span className="text-[11px] text-slate-400">{shown.label}</span>
        <span className="text-right">
          <span className="text-sm font-bold text-white">
            {shown.value !== null ? `${shown.value.toLocaleString('en-IN', { maximumFractionDigits: 1 })} ${unit}` : '—'}
          </span>
          {previous && <span className={`ml-2 text-[11px] ${changeTone(change)}`}>{signedPct(change, 1)} vs {previous.label}</span>}
        </span>
      </div>
      <div className="relative flex items-stretch gap-0.5" style={{ height: TREND_HEIGHT }}>
        <div className="absolute left-0 right-0 h-px bg-[#2a3449]" style={{ top: baseline }} />
        {points.map((point, i) => {
          const value = point.value ?? 0;
          const height = Math.max(point.value === null ? 0 : 2, (Math.abs(value) / span) * TREND_HEIGHT);
          return (
            <button
              key={point.label}
              type="button"
              aria-label={`${point.label}: ${point.value ?? 'not reported'}`}
              onPointerEnter={() => setActiveIndex(i)}
              onPointerLeave={(e) => {
                if (e.pointerType === 'mouse') setActiveIndex(null);
              }}
              onFocus={() => setActiveIndex(i)}
              onBlur={() => setActiveIndex(null)}
              onClick={() => setActiveIndex(i)}
              className="relative flex-1 min-w-0 group"
            >
              <span
                className="absolute left-1/2 -translate-x-1/2 w-full max-w-[44px] transition-colors"
                style={{
                  top: value >= 0 ? baseline - height : baseline,
                  height,
                  backgroundColor: shownIndex === i ? BAR_ACTIVE_COLOR : BAR_COLOR,
                  borderRadius: value >= 0 ? '4px 4px 0 0' : '0 0 4px 4px'
                }}
              />
            </button>
          );
        })}
      </div>
      <div className="flex gap-0.5 text-[10px] font-mono text-slate-400">
        {points.map((point, i) => (
          <span key={point.label} className="flex-1 min-w-0 text-center whitespace-nowrap overflow-visible">
            {(points.length - 1 - i) % labelEvery === 0 ? point.label.replace(/^[A-Za-z]+ /, "'").replace("'20", "'") : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

// Statement rows expand in place to show that line's multi-year trend.
export function StatementTable({
  firstColumn,
  years,
  rows,
  highlightMetric
}: {
  firstColumn: string;
  years: string[];
  rows: StatementRow[];
  highlightMetric?: string;
}) {
  const [openMetric, setOpenMetric] = useState<string | null>(highlightMetric ?? null);

  return (
    <div className="overflow-x-auto border border-[#1e2433] rounded-lg">
      <table className="w-full text-xs text-left">
        <thead className="bg-[#0a0d14] text-slate-400 font-mono uppercase text-[10px] border-b border-[#1e2433]">
          <tr>
            <th className="py-2.5 px-3 sticky left-0 bg-[#0a0d14]">{firstColumn}</th>
            {years.map((yr) => (
              <th key={yr} className="py-2.5 px-3 text-right whitespace-nowrap">{yr}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#1e2433] font-mono tabular-nums">
          {rows.map((row) => {
            const isOpen = openMetric === row.metric;
            // Statements list the newest year first; a trend reads left to right.
            const points = years.map((label, i) => ({ label, value: row.values[i] ?? null })).reverse();
            return (
              <React.Fragment key={row.metric}>
                <tr className={`transition-colors ${isOpen ? 'bg-[#161c28]/70' : 'hover:bg-[#161c28]/50'}`}>
                  <td className="p-0 sticky left-0 bg-[#111520]">
                    <button
                      onClick={() => setOpenMetric(isOpen ? null : row.metric)}
                      aria-expanded={isOpen}
                      className={`w-full flex items-center gap-1.5 py-2.5 px-3 text-left font-sans min-w-[150px] ${
                        row.metric === highlightMetric ? 'font-bold text-emerald-400' : 'font-medium text-slate-200'
                      }`}
                    >
                      {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                      {row.metric}
                    </button>
                  </td>
                  {years.map((_, i) => (
                    <td key={i} className="py-2.5 px-3 text-right text-slate-200 whitespace-nowrap">
                      {formatValue(row.values[i], row.unit)}
                    </td>
                  ))}
                </tr>
                {isOpen && (
                  <tr>
                    <td colSpan={years.length + 1} className="p-3 bg-[#0a0d14]">
                      <div className="max-w-md sticky left-3">
                        <TrendBars points={points} unit={row.unit || '₹ Cr'} />
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------- Small pieces shared by the views ----------

export function SourceLink({ source }: { source?: DocumentSourceRef | null }) {
  if (!source) return null;
  const label = `${source.period || source.title}${source.page ? `, p.${source.page}` : ''}`;
  if (!source.url) return <span className="text-[10px] font-mono text-slate-500 whitespace-nowrap">{label}</span>;
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      title={source.title}
      className="inline-flex items-center gap-1 text-[10px] font-mono text-blue-400 hover:text-blue-300 whitespace-nowrap"
    >
      {label}
      <ExternalLink className="w-2.5 h-2.5" />
    </a>
  );
}

function NumbersFlag({ matched, unmatched }: { matched?: boolean; unmatched?: string[] }) {
  if (matched !== false) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-mono text-amber-400" title="This number isn't in the documents or reported figures the model was given.">
      <AlertTriangle className="w-3 h-3 shrink-0" />
      {unmatched?.length ? `${unmatched.join(', ')} not found in the sources` : 'number not found in the sources'}
    </span>
  );
}

function Checked({ item, className = '' }: { item?: CheckedText | null; className?: string }) {
  if (!item?.text) return null;
  return (
    <p className={className}>
      {item.text} <NumbersFlag matched={item.numbers_matched} unmatched={item.unmatched} />
    </p>
  );
}

function PointList({ points, tone = 'text-blue-400' }: { points: ResearchPoint[]; tone?: string }) {
  return (
    <ul className="space-y-2 text-xs">
      {points.map((point, i) => (
        <li key={i} className="flex items-start gap-2 text-slate-300 leading-relaxed">
          <span className={tone} aria-hidden="true">&bull;</span>
          <span className="min-w-0">
            {point.text} <SourceLink source={point.source} /> <NumbersFlag matched={point.numbers_matched} unmatched={point.unmatched} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function Excerpts({ title, excerpts }: { title: string; excerpts: Array<{ text: string } & DocumentSourceRef> }) {
  if (excerpts.length === 0) return null;
  return (
    <div className={CARD}>
      <h3 className={HEADING}>{title}</h3>
      {excerpts.map((excerpt, i) => (
        <details key={i} className="group rounded-lg bg-[#0a0d14] border border-[#1e2433]">
          <summary className="flex items-center justify-between gap-3 cursor-pointer p-3 text-xs text-slate-300 list-none">
            <span className="line-clamp-2 min-w-0 leading-relaxed group-open:line-clamp-none">{excerpt.text}</span>
            <SourceLink source={excerpt} />
          </summary>
        </details>
      ))}
    </div>
  );
}

// Says exactly why an analysis is missing, so an empty view never looks like an empty company.
export function AnalysisNotice({ aiEnabled, aiError, what }: { aiEnabled?: boolean; aiError?: string | null; what: string }) {
  if (aiError) {
    return (
      <p className="p-3 rounded-lg bg-[#0a0d14] border border-amber-500/30 text-[11px] font-mono text-amber-300 leading-relaxed">
        The model couldn&apos;t finish {what}: {aiError} Showing what the documents say directly.
      </p>
    );
  }
  if (aiEnabled) return null;
  return (
    <p className="flex items-start gap-2 p-3 rounded-lg bg-[#0a0d14] border border-blue-500/30 text-[11px] text-slate-300 leading-relaxed">
      <KeyRound className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
      <span>
        <Link href="/settings" className="text-blue-400 hover:text-blue-300 underline">Add an AI key</Link> for {what}. Below is what could be found without a model.
      </span>
    </p>
  );
}

const QUOTE_STYLE = 'p-3 rounded-lg bg-[#0a0d14] border-l-2 border-blue-500 text-xs text-slate-300 leading-relaxed';

function FoundSentences({ sentences }: { sentences: Array<{ quote: string } & DocumentSourceRef> }) {
  if (sentences.length === 0) return null;
  return (
    <div className={CARD}>
      <div>
        <h3 className={HEADING}>Forward-looking sentences found</h3>
        <p className="text-[10px] font-mono text-slate-500 mt-1">Matched by pattern, in management&apos;s exact words. Not checked by a model.</p>
      </div>
      {sentences.map((s, i) => (
        <blockquote key={i} className={`${QUOTE_STYLE} space-y-1.5`}>
          <p>{s.quote}</p>
          <SourceLink source={s} />
        </blockquote>
      ))}
    </div>
  );
}

// ---------- Business ----------

export function BusinessView({ data }: { data: any }) {
  const analysis = data.analysis;
  return (
    <>
      <AnalysisNotice aiEnabled={data.ai_enabled} aiError={data.ai_error} what="a reading of the annual report" />
      {analysis && analysis.segments.length > 0 && (
        <div className={CARD}>
          <h3 className={HEADING}>Segments</h3>
          <div className="space-y-2">
            {analysis.segments.map((segment: any, i: number) => (
              <div key={i} className="p-3 rounded-lg bg-[#0a0d14] border border-[#1e2433] space-y-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13px] font-semibold text-white">{segment.name}</span>
                  {segment.revenue_share?.text && <span className="text-[11px] font-mono text-blue-300 text-right">{segment.revenue_share.text}</span>}
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">{segment.description}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <SourceLink source={segment.source} />
                  <NumbersFlag matched={segment.revenue_share?.numbers_matched} unmatched={segment.revenue_share?.unmatched} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {analysis?.revenue_mix?.text && (
        <div className={CARD}>
          <h3 className={HEADING}>Revenue mix</h3>
          <Checked item={analysis.revenue_mix} className="text-xs text-slate-300 leading-relaxed" />
        </div>
      )}
      {analysis?.key_facts?.length > 0 && (
        <div className={CARD}>
          <h3 className={HEADING}>Worth knowing</h3>
          <PointList points={analysis.key_facts} />
        </div>
      )}
      <Excerpts title="From the annual report" excerpts={data.excerpts || []} />
    </>
  );
}

// ---------- Financial snapshot ----------

export function FinancialView({ data }: { data: any }) {
  const year = data.full_year;
  const ratios = Object.entries(data.ratios || {}).filter(([, value]) => value !== null && value !== undefined) as Array<[string, number]>;
  return (
    <>
      {data.latest_quarter?.length > 0 && (
        <div className={CARD}>
          <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-slate-400">
            <span className="font-semibold text-slate-200">Quarter to {data.period}</span>
            <span className="capitalize">{data.reporting_basis} · ₹ Cr</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {data.latest_quarter.map((row: any) => (
              <div key={row.label} className="p-3 rounded-lg bg-[#0a0d14] border border-[#1e2433] font-mono">
                <div className="text-[10px] text-slate-400 uppercase">{row.label}</div>
                <div className="text-base font-bold text-white mt-0.5 tabular-nums">{formatValue(row.value)}</div>
                <div className="flex gap-3 text-[10px] mt-1">
                  <span className={changeTone(row.qoq_pct)}>{signedPct(row.qoq_pct, 1)} QoQ</span>
                  <span className={changeTone(row.yoy_pct)}>{signedPct(row.yoy_pct, 1)} YoY</span>
                </div>
              </div>
            ))}
          </div>
          {data.ebitda_margin != null && <p className="text-xs font-mono text-slate-300">Margin {data.ebitda_margin}%</p>}
          {data.ebitda_note && <p className="text-[10px] font-mono text-slate-500">{data.ebitda_note}</p>}
        </div>
      )}
      {year?.label && (
        <div className={CARD}>
          <h3 className={HEADING}>Full year, {year.label}</h3>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-xs font-mono">
            {([
              ['Revenue', formatValue(year.revenue)], ['EBITDA', formatValue(year.ebitda)], ['PAT', formatValue(year.pat)],
              ['EBITDA margin', formatValue(year.ebitda_margin, '%')], ['PAT margin', formatValue(year.pat_margin, '%')],
            ] as Array<[string, string]>).map(([label, value]) => (
              <div key={label}><dt className="text-[10px] text-slate-400">{label}</dt><dd className="text-slate-100 tabular-nums">{value}</dd></div>
            ))}
          </dl>
        </div>
      )}
      {ratios.length > 0 && (
        <div className={CARD}>
          <h3 className={HEADING}>Ratios</h3>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-xs font-mono">
            {ratios.map(([label, value]) => (
              <div key={label}><dt className="text-[10px] text-slate-400">{label}</dt><dd className="text-slate-100 tabular-nums">{value.toLocaleString('en-IN')}</dd></div>
            ))}
          </dl>
        </div>
      )}
    </>
  );
}

// ---------- Trajectory ----------

const TREND_METRICS = [
  { key: 'revenue', label: 'Revenue' },
  { key: 'ebitda', label: 'EBITDA' },
  { key: 'pbt', label: 'PBT' },
  { key: 'pat', label: 'PAT' },
  { key: 'margin', label: 'Margin' },
];
const SIGNAL_STYLE: Record<string, { icon: React.ElementType; className: string }> = {
  accelerating: { icon: TrendingUp, className: 'text-emerald-400' },
  expanding: { icon: TrendingUp, className: 'text-emerald-400' },
  steady: { icon: MinusCircle, className: 'text-slate-400' },
  slowing: { icon: TrendingDown, className: 'text-amber-400' },
  compressing: { icon: TrendingDown, className: 'text-rose-400' },
};

export function TrajectoryView({ data }: { data: any }) {
  const [metric, setMetric] = useState('revenue');
  const [frequency, setFrequency] = useState<'annual' | 'quarterly'>('annual');
  const rows = frequency === 'annual' ? data.trajectory || [] : data.quarterly || [];
  const metrics = data.is_financial ? TREND_METRICS.filter((m) => m.key !== 'margin') : TREND_METRICS;

  return (
    <>
      {data.signals?.length > 0 && (
        <div className={CARD}>
          <h3 className={HEADING}>What&apos;s changing</h3>
          <ul className="space-y-2 text-xs">
            {data.signals.map((signal: any, i: number) => {
              const style = SIGNAL_STYLE[signal.direction] || SIGNAL_STYLE.steady;
              const Icon = style.icon;
              return (
                <li key={i} className="flex items-start gap-2 text-slate-200 leading-relaxed">
                  <Icon className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${style.className}`} aria-label={signal.direction} />
                  <span>{signal.text}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <div className={CARD}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div role="group" aria-label="Trajectory metric" className="flex items-center gap-1 overflow-x-auto no-scrollbar bg-[#0a0d14] border border-[#1e2433] rounded-lg p-1 text-xs font-mono">
            {metrics.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setMetric(key)}
                aria-pressed={metric === key}
                className={`px-2.5 py-1.5 rounded transition-colors ${metric === key ? 'bg-blue-600 text-white font-medium' : 'text-slate-400 hover:text-slate-200'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div role="group" aria-label="Period" className="flex items-center gap-1 bg-[#0a0d14] border border-[#1e2433] rounded-lg p-1 text-xs font-mono">
            {(['annual', 'quarterly'] as const).map((option) => (
              <button
                key={option}
                onClick={() => setFrequency(option)}
                aria-pressed={frequency === option}
                className={`px-2.5 py-1.5 rounded capitalize transition-colors ${frequency === option ? 'bg-blue-600 text-white font-medium' : 'text-slate-400 hover:text-slate-200'}`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
        <TrendBars
          points={rows.map((row: any) => ({ label: row.period, value: row[metric] ?? null }))}
          unit={metric === 'margin' ? '%' : '₹ Cr'}
        />
      </div>
      {data.growth?.length > 0 && (
        <div className={CARD}>
          <h3 className={HEADING}>Growth per year</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono tabular-nums">
              <thead className="text-[10px] uppercase text-slate-400 border-b border-[#1e2433]">
                <tr>
                  <th className="py-2 text-left font-medium">Metric</th>
                  <th className="py-2 text-right font-medium">3y</th>
                  <th className="py-2 text-right font-medium">5y</th>
                  <th className="py-2 text-right font-medium">10y</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e2433]">
                {data.growth.map((row: any) => (
                  <tr key={row.metric}>
                    <td className="py-2 text-slate-200">{row.metric}</td>
                    {[row.cagr_3y, row.cagr_5y, row.cagr_10y].map((value: number | null, i: number) => (
                      <td key={i} className={`py-2 text-right ${changeTone(value)}`}>{signedPct(value, 1)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] font-mono text-slate-500">Blank where the start or end year was a loss, because the rate wouldn&apos;t mean anything.</p>
        </div>
      )}
    </>
  );
}

// ---------- Balance sheet and cash ----------

function TableCard({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className={CARD}>
      <h3 className={HEADING}>{title}</h3>
      {children}
      {note && <p className="text-[10px] font-mono text-slate-500">{note}</p>}
    </div>
  );
}

export function BalanceSheetView({ data }: { data: any }) {
  return (
    <>
      {data.ratio_table?.length > 0 && (
        <TableCard title="Leverage">
          <StatementTable firstColumn="Ratio" years={data.years} rows={data.ratio_table} />
        </TableCard>
      )}
      {data.working_capital_table?.length > 0 && (
        <TableCard title="Working capital cycle" note="Days. A shorter cash conversion cycle means less cash is tied up in running the business.">
          <StatementTable
            firstColumn="Days"
            years={data.working_capital_years}
            rows={data.working_capital_table}
            highlightMetric={data.working_capital_table.some((r: StatementRow) => r.metric === 'Cash Conversion Cycle') ? 'Cash Conversion Cycle' : undefined}
          />
        </TableCard>
      )}
      <TableCard title={`Balance sheet (${data.unit})`} note="Tap a line to see its trend.">
        <StatementTable firstColumn="Line item" years={data.years} rows={data.table} />
      </TableCard>
    </>
  );
}

const VERDICT_STYLE: Record<string, string> = {
  strong: 'border-emerald-500/40 text-emerald-300',
  watch: 'border-amber-500/40 text-amber-300',
  weak: 'border-rose-500/40 text-rose-300',
};

export function CashQualityView({ data }: { data: any }) {
  const cumulative = data.cumulative;
  return (
    <>
      {cumulative?.conversion_pct != null && (
        <div className={`p-4 rounded-xl bg-[#111520] border ${VERDICT_STYLE[data.verdict?.level] || 'border-[#1e2433] text-slate-200'} font-mono`}>
          <div className="text-[10px] uppercase text-slate-400">Cash from operations as a share of net profit, {cumulative.years} years</div>
          <div className="text-2xl font-bold mt-0.5">{cumulative.conversion_pct}%</div>
          <div className="text-[11px] text-slate-400 mt-1">₹{formatValue(cumulative.cfo)} Cr of cash against ₹{formatValue(cumulative.pat)} Cr of profit</div>
        </div>
      )}
      {data.ratio_table?.length > 0 && (
        <TableCard title="Conversion">
          <StatementTable firstColumn="Ratio" years={data.years} rows={data.ratio_table} />
        </TableCard>
      )}
      <TableCard title={`Cash flow (${data.unit})`} note="Tap a line to see its trend.">
        <StatementTable firstColumn="Line" years={data.years} rows={data.table} highlightMetric="Free Cash Flow" />
      </TableCard>
    </>
  );
}

// ---------- Guidance ----------

function PromiseProof({ promise }: { promise: GuidanceItem }) {
  return (
    <blockquote className={`${QUOTE_STYLE} space-y-1.5`}>
      <p className="flex items-start gap-1.5">
        <Quote className="w-3 h-3 text-slate-500 shrink-0 mt-0.5" aria-hidden="true" />
        <span>{promise.quote}</span>
      </p>
      <div className="flex items-center gap-2 flex-wrap text-[10px] font-mono text-slate-500">
        {promise.speaker && <span>{promise.speaker}</span>}
        <SourceLink source={{ title: promise.document, period: promise.call, page: promise.page, url: promise.url }} />
      </div>
    </blockquote>
  );
}

export function GuidanceView({ data }: { data: any }) {
  const items: GuidanceItem[] = data.items || [];
  const calls = useMemo(() => {
    const grouped = new Map<string, GuidanceItem[]>();
    items.forEach((item) => grouped.set(item.call, [...(grouped.get(item.call) || []), item]));
    return Array.from(grouped.entries());
  }, [items]);
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <>
      <AnalysisNotice aiEnabled={data.ai_enabled} aiError={data.ai_error} what="guidance read from each transcript" />
      {data.is_extracted && items.length === 0 && !data.ai_error && (
        <p className="p-4 rounded-xl bg-[#111520] border border-[#1e2433] text-xs text-slate-400">
          No explicit forward guidance was found in the transcripts read for this company.
        </p>
      )}
      {calls.map(([call, callItems]) => (
        <div key={call} className={CARD}>
          <h3 className={HEADING}>{call} {callItems[0]?.kind === 'presentation' ? 'presentation' : 'call'} <span className="text-slate-500 font-normal">· {callItems.length}</span></h3>
          <div className="space-y-2">
            {callItems.map((item, i) => {
              const id = `${call}-${i}`;
              const isOpen = openId === id;
              return (
                <div key={id} className="rounded-lg bg-[#0a0d14] border border-[#1e2433]">
                  <button onClick={() => setOpenId(isOpen ? null : id)} aria-expanded={isOpen} className="w-full p-3 text-left space-y-1">
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-xs font-medium text-slate-100 leading-relaxed">{item.statement}</span>
                      <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </div>
                    <div className="flex items-center gap-2 flex-wrap text-[10px] font-mono text-slate-400">
                      {item.metric && <span className="px-1.5 py-0.5 rounded bg-[#1e2433] text-slate-300">{item.metric}</span>}
                      {item.target && <span className="text-blue-300">{item.target}</span>}
                      {item.target_period && <span>{item.target_period}</span>}
                    </div>
                  </button>
                  {isOpen && <div className="px-3 pb-3"><PromiseProof promise={item} /></div>}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <FoundSentences sentences={data.found_sentences || []} />
    </>
  );
}

// ---------- Narrative vs numbers ----------

const VERDICTS: Record<string, { label: string; className: string; icon: React.ElementType }> = {
  delivered: { label: 'Delivered', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30', icon: CheckCircle2 },
  partly: { label: 'Partly', className: 'bg-amber-500/10 text-amber-400 border-amber-500/30', icon: MinusCircle },
  missed: { label: 'Missed', className: 'bg-rose-500/10 text-rose-400 border-rose-500/30', icon: XCircle },
  too_early: { label: 'Too early', className: 'bg-blue-500/10 text-blue-300 border-blue-500/30', icon: Clock },
  not_checkable: { label: "Can't check", className: 'bg-slate-800 text-slate-400 border-slate-700', icon: HelpCircle },
};

function VerdictPill({ verdict }: { verdict: string }) {
  const style = VERDICTS[verdict] || VERDICTS.not_checkable;
  const Icon = style.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] uppercase font-bold font-mono border whitespace-nowrap ${style.className}`}>
      <Icon className="w-3 h-3" />
      {style.label}
    </span>
  );
}

function ReportedNumbers({ rows }: { rows: any[] }) {
  if (!rows?.length) return null;
  return (
    <div className={CARD}>
      <h3 className={HEADING}>What was reported (₹ Cr)</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono tabular-nums">
          <thead className="text-[10px] uppercase text-slate-400 border-b border-[#1e2433]">
            <tr>
              <th className="py-2 pr-3 text-left font-medium">Quarter</th>
              <th className="py-2 px-2 text-right font-medium">Revenue</th>
              <th className="py-2 px-2 text-right font-medium">EBITDA</th>
              <th className="py-2 px-2 text-right font-medium">PAT</th>
              <th className="py-2 pl-2 text-right font-medium">Margin</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1e2433]">
            {rows.map((row) => (
              <tr key={row.period}>
                <td className="py-2 pr-3 text-slate-200 whitespace-nowrap">{row.period}</td>
                <td className="py-2 px-2 text-right text-slate-200">{formatValue(row.revenue)}</td>
                <td className="py-2 px-2 text-right text-slate-200">{formatValue(row.ebitda)}</td>
                <td className="py-2 px-2 text-right text-slate-200">{formatValue(row.pat)}</td>
                <td className="py-2 pl-2 text-right text-slate-200">{formatValue(row.margin, '%')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PromiseCard({ item }: { item: NarrativeItem }) {
  const [open, setOpen] = useState(false);
  const { promise } = item;
  return (
    <div className={CARD}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-slate-100 leading-relaxed">{promise.statement}</p>
        <VerdictPill verdict={item.verdict} />
      </div>
      <div className="flex items-center gap-2 flex-wrap text-[10px] font-mono text-slate-400">
        <span>Promised in the {promise.call} {promise.kind === 'presentation' ? 'presentation' : 'call'}</span>
        {promise.target_period && <span>· for {promise.target_period}</span>}
      </div>
      <div className="p-3 rounded-lg bg-[#0a0d14] border border-[#1e2433] space-y-1.5 text-xs">
        <div className="text-[10px] font-mono uppercase text-slate-400">What happened</div>
        <Checked item={item.delivered} className="text-slate-200 leading-relaxed" />
        <Checked item={item.reasoning} className="text-slate-400 leading-relaxed" />
        <div className="flex items-center gap-2 flex-wrap">
          <SourceLink source={item.source} />
          {item.from_numbers && <span className="text-[10px] font-mono text-slate-500">Reported figures</span>}
        </div>
      </div>
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-400 hover:text-slate-200">
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        Management&apos;s exact words
      </button>
      {open && <PromiseProof promise={promise} />}
    </div>
  );
}

export function NarrativeView({ data }: { data: any }) {
  const items: NarrativeItem[] = data.items || [];
  const [filter, setFilter] = useState<string | null>(null);
  const shown = filter ? items.filter((i) => i.verdict === filter) : items;
  const tally: Record<string, number> = data.tally || {};
  const judged = Object.keys(VERDICTS).filter((v) => tally[v] > 0);

  return (
    <>
      <AnalysisNotice aiEnabled={data.ai_enabled} aiError={data.ai_error} what="a promised-versus-delivered check" />
      {judged.length > 0 && (
        <div className={CARD}>
          <h3 className={HEADING}>Scorecard, {items.length} promises</h3>
          <div className="flex items-center gap-1.5 flex-wrap">
            {judged.map((verdict) => (
              <button
                key={verdict}
                onClick={() => setFilter(filter === verdict ? null : verdict)}
                aria-pressed={filter === verdict}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-mono transition-colors ${
                  filter === verdict ? VERDICTS[verdict].className : 'bg-[#0a0d14] border-[#1e2433] text-slate-300 hover:border-slate-600'
                }`}
              >
                <span className="font-bold">{tally[verdict]}</span>
                {VERDICTS[verdict].label}
              </button>
            ))}
          </div>
        </div>
      )}
      {data.is_analysed && items.length === 0 && !data.ai_error && (
        <p className="p-4 rounded-xl bg-[#111520] border border-[#1e2433] text-xs text-slate-400">
          No explicit promises were found in the transcripts read, so there&apos;s nothing to check against the numbers.
        </p>
      )}
      {shown.map((item, i) => <PromiseCard key={`${item.promise.id}-${i}`} item={item} />)}
      {data.divergences?.length > 0 && (
        <div className={CARD}>
          <h3 className={HEADING}>Where the story and the numbers differ</h3>
          <PointList points={data.divergences} tone="text-rose-400" />
        </div>
      )}
      {data.agreements?.length > 0 && (
        <div className={CARD}>
          <h3 className={HEADING}>Where they agree</h3>
          <PointList points={data.agreements} tone="text-emerald-400" />
        </div>
      )}
      <ReportedNumbers rows={data.numbers} />
      <FoundSentences sentences={data.found_sentences || []} />
    </>
  );
}

// ---------- Bull vs bear ----------

function CaseColumn({ side, points }: { side: 'bull' | 'bear'; points: any[] }) {
  const isBull = side === 'bull';
  const Icon = isBull ? TrendingUp : TrendingDown;
  return (
    <div className={`p-4 rounded-xl border space-y-2.5 ${isBull ? 'bg-emerald-950/10 border-emerald-500/30' : 'bg-rose-950/10 border-rose-500/30'}`}>
      <div className={`flex items-center gap-2 font-mono text-xs font-bold uppercase ${isBull ? 'text-emerald-400' : 'text-rose-400'}`}>
        <Icon className="w-4 h-4" />
        <span>{isBull ? 'Bull case' : 'Bear case'}</span>
      </div>
      {points.length === 0 && <p className="text-xs text-slate-400">Nothing in the material supports this side.</p>}
      {points.map((point, i) => (
        <div key={i} className="p-2.5 rounded-lg bg-[#0a0d14] border border-[#1e2433] space-y-1 text-xs">
          <div className="font-semibold text-slate-100">{point.claim}</div>
          <div className="text-[11px] text-slate-400 leading-relaxed">{point.evidence}</div>
          {point.caveat && <div className="text-[10px] text-slate-400 font-mono">Caveat: {point.caveat}</div>}
          <div className="flex items-center gap-2 flex-wrap">
            <SourceLink source={point.source} />
            <NumbersFlag matched={point.numbers_matched} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function BullBearView({ data }: { data: any }) {
  return (
    <>
      {!data.is_analysed && (
        <AnalysisNotice aiEnabled={data.ai_enabled} aiError={data.ai_error} what="a case built from the documents" />
      )}
      {!data.is_analysed && (
        <p className="text-[10px] font-mono text-slate-500">These points are calculated from reported numbers only.</p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <CaseColumn side="bull" points={data.bull_case || []} />
        <CaseColumn side="bear" points={data.bear_case || []} />
      </div>
    </>
  );
}

// ---------- A free-form question ----------

export function AskResult({ result }: { result: any }) {
  const data = result.data || {};
  return (
    <div className={CARD}>
      <div>
        <h3 className={HEADING}>Your question</h3>
        <p className="text-xs text-slate-300 mt-1">{data.query}</p>
      </div>
      {data.answer ? (
        <>
          {data.answered === false && (
            <p className="text-[11px] font-mono text-amber-400">The documents don&apos;t fully answer this.</p>
          )}
          <Checked item={data.answer} className="text-[13px] text-slate-100 leading-relaxed" />
          {data.points?.length > 0 && <PointList points={data.points} />}
        </>
      ) : (
        <AnalysisNotice aiEnabled={data.ai_enabled} aiError={data.ai_error} what="a written answer" />
      )}
      {(data.excerpts || []).map((excerpt: any, i: number) => (
        <blockquote key={i} className={`${QUOTE_STYLE} space-y-1.5`}>
          <p className="line-clamp-5">{excerpt.text}</p>
          <SourceLink source={excerpt} />
        </blockquote>
      ))}
      {!data.answer && (data.excerpts || []).length === 0 && (
        <p className="text-xs text-slate-400">Nothing in this company&apos;s documents matches that.</p>
      )}
    </div>
  );
}
