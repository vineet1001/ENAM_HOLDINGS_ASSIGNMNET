'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, TrendingUp } from 'lucide-react';
import { api } from '@/lib/api';
import { LiveCompany, LivePortfolioHistory, LiveRange, PortfoliosResponse } from '@/types';
import { changeTone, inr, readStored, signedPct, writeStored } from '@/lib/ui';

const RANGES: LiveRange[] = ['1M', '3M', '6M', '1Y'];
const SELECTION_KEY = 'finn.chartSelection';
const REFRESH_MS = 15 * 60 * 1000;
const PLOT_HEIGHT = 190;
const AXIS_WIDTH = 56;
const LINE_COLOR = '#60a5fa';

function formatDate(date: string, withYear = true): string {
  return new Date(date).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {})
  });
}

// One selection drives the readout, plot and table, so the numbers on screen always agree.
export function PortfolioChart({
  onCompanies,
  onPortfolioChange
}: {
  onCompanies?: (companies: LiveCompany[], asOf: string) => void;
  onPortfolioChange?: () => void;
}) {
  const [selection, setSelection] = useState({ ticker: '', range: '6M' as LiveRange });
  const [portfolios, setPortfolios] = useState<PortfoliosResponse | null>(null);
  const [data, setData] = useState<LivePortfolioHistory | null>(null);
  const [companies, setCompanies] = useState<LiveCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const requestId = useRef(0);

  useEffect(() => {
    setSelection(readStored(SELECTION_KEY, { ticker: '', range: '6M' as LiveRange }));
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const load = useCallback(async () => {
    const current = ++requestId.current;
    setLoading(true);
    try {
      const res = await api.getLivePortfolioHistory(selection.range, selection.ticker || undefined);
      if (current !== requestId.current) return;
      setData(res);
      setCompanies(res.companies);
      setError(null);
      setActiveIndex(null);
      onCompanies?.(res.companies, res.as_of);
    } catch (err: any) {
      if (current !== requestId.current) return;
      // A saved company may have since left the portfolio; fall back to the whole portfolio.
      if (selection.ticker && String(err.message).includes('not in the portfolio')) {
        setSelection((prev) => ({ ...prev, ticker: '' }));
        return;
      }
      setError(err.message || 'Could not load live prices');
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }, [selection, onCompanies]);

  useEffect(() => {
    load();
    const interval = setInterval(load, REFRESH_MS);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    api.getPortfolios().then(setPortfolios).catch(() => {});
  }, []);

  const switchPortfolio = async (value: string) => {
    const id = value ? Number(value) : null;
    try {
      await api.setActivePortfolio(id);
      setPortfolios((prev) => (prev ? { ...prev, active_id: id } : prev));
      // A company picked in the old portfolio may not be in the new one.
      const merged = { ...selection, ticker: '' };
      setSelection(merged);
      writeStored(SELECTION_KEY, merged);
      onPortfolioChange?.();
    } catch (err: any) {
      setError(err.message || 'Could not switch portfolio');
    }
  };

  const choose = (next: Partial<typeof selection>) => {
    const merged = { ...selection, ...next };
    setSelection(merged);
    writeStored(SELECTION_KEY, merged);
  };

  const points = data?.points || [];
  const plotWidth = Math.max(0, width - AXIS_WIDTH);
  const isCompany = data?.unit === 'INR';
  const formatValue = (value: number) => (isCompany ? inr(value, 2) : value.toFixed(2));

  const values = points.map((p) => p.value);
  const low = values.length ? Math.min(...values) : 0;
  const high = values.length ? Math.max(...values) : 1;
  const pad = (high - low) * 0.1 || 1;
  const yMin = low - pad;
  const yMax = high + pad;
  const x = (i: number) => (points.length < 2 ? plotWidth / 2 : (i / (points.length - 1)) * (plotWidth - 8) + 4);
  const y = (v: number) => PLOT_HEIGHT - 6 - ((v - yMin) / (yMax - yMin)) * (PLOT_HEIGHT - 12);

  const shownIndex = activeIndex !== null && activeIndex < points.length ? activeIndex : points.length - 1;
  const shown = points[shownIndex];
  const startValue = data?.start_value;
  const shownChange = shown && startValue ? ((shown.value - startValue) / Math.abs(startValue)) * 100 : null;

  const pickIndex = (clientX: number, target: SVGSVGElement) => {
    const ratio = (clientX - target.getBoundingClientRect().left - 4) / Math.max(1, plotWidth - 8);
    setActiveIndex(Math.min(points.length - 1, Math.max(0, Math.round(ratio * (points.length - 1)))));
  };

  const ranked = companies
    .filter((c) => c.range_change_pct !== null)
    .sort((a, b) => (b.range_change_pct ?? 0) - (a.range_change_pct ?? 0));
  const leaders = ranked.length >= 6 ? [...ranked.slice(0, 3), ...ranked.slice(-3)] : ranked;

  return (
    <section aria-label="Portfolio performance" className="p-4 rounded-xl bg-[#111520] border border-[#1e2433] space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-xs font-semibold text-white uppercase tracking-wider font-mono flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-blue-400" />
          Portfolio progress
        </h2>
        <span className="text-[10px] font-mono text-slate-400">
          {data ? `${data.source} · close of ${formatDate(data.as_of)}` : 'Yahoo Finance'}
        </span>
      </div>

      {/* Filters scope everything below them */}
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={portfolios?.active_id ?? ''}
          onChange={(e) => switchPortfolio(e.target.value)}
          aria-label="Choose portfolio"
          className="flex-1 min-w-[150px] bg-[#0a0d14] border border-[#1e2433] rounded-lg px-2.5 py-2 text-base md:text-xs text-slate-200 focus:outline-none focus:border-blue-500"
        >
          <option value="">Mock portfolio</option>
          {(portfolios?.portfolios || []).map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select
          value={selection.ticker}
          onChange={(e) => choose({ ticker: e.target.value })}
          aria-label="Show whole portfolio or one company"
          className="flex-1 min-w-[180px] bg-[#0a0d14] border border-[#1e2433] rounded-lg px-2.5 py-2 text-base md:text-xs text-slate-200 focus:outline-none focus:border-blue-500"
        >
          <option value="">Whole portfolio ({data?.portfolio.is_custom ? 'your weights' : 'equal-weighted'})</option>
          {[...companies].sort((a, b) => a.name.localeCompare(b.name)).map((c) => (
            <option key={c.ticker} value={c.ticker} disabled={!c.has_data}>
              {c.name} ({c.ticker}){c.weight !== null ? ` · ${c.weight}%` : ''}{c.has_data ? '' : ' - no data'}
            </option>
          ))}
        </select>
        <div role="group" aria-label="Chart range" className="flex items-center bg-[#0a0d14] border border-[#1e2433] rounded-lg p-0.5 font-mono text-[11px] shrink-0">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => choose({ range: r })}
              aria-pressed={selection.range === r}
              className={`px-2.5 py-1.5 rounded transition-colors ${
                selection.range === r ? 'bg-blue-600 text-white font-medium' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {error && !data ? (
        <div className="py-8 text-center space-y-3">
          <p className="text-xs text-rose-300 font-mono">Live prices are unavailable: {error}</p>
          <button onClick={load} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium">
            <RefreshCw className="w-3.5 h-3.5" />
            Try again
          </button>
        </div>
      ) : (
        <div className={`space-y-2 transition-opacity ${loading && data ? 'opacity-50' : ''}`}>
          {/* Readout stays in a fixed row so a finger never covers the value */}
          <div className="min-h-[52px]" aria-live="off">
            {shown ? (
              <>
                <div className="flex items-baseline gap-2 flex-wrap font-mono">
                  <span className="text-xl font-bold text-white">{formatValue(shown.value)}</span>
                  <span className={`text-sm font-semibold ${changeTone(shownChange)}`}>{signedPct(shownChange)}</span>
                </div>
                <p className="text-[11px] font-mono text-slate-400">
                  {data?.name} · {formatDate(shown.date)} · since {formatDate(points[0].date)}
                </p>
              </>
            ) : (
              <div className="h-[52px] rounded bg-[#0a0d14] animate-pulse" />
            )}
          </div>

          <div ref={containerRef} className="w-full" style={{ minHeight: PLOT_HEIGHT + 20 }}>
            {width > 0 && points.length > 0 ? (
              <svg
                width={width}
                height={PLOT_HEIGHT + 20}
                role="img"
                tabIndex={0}
                aria-label={`${data?.name}: ${formatValue(data?.start_value ?? 0)} to ${formatValue(data?.latest_value ?? 0)} over ${points.length} trading days. Use left and right arrow keys to move between days.`}
                className="block touch-pan-y cursor-crosshair rounded"
                onPointerMove={(e) => pickIndex(e.clientX, e.currentTarget)}
                onPointerDown={(e) => pickIndex(e.clientX, e.currentTarget)}
                onPointerLeave={(e) => {
                  if (e.pointerType === 'mouse') setActiveIndex(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    setActiveIndex(Math.max(0, shownIndex - 1));
                  } else if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    setActiveIndex(Math.min(points.length - 1, shownIndex + 1));
                  }
                }}
              >
                {[high, (high + low) / 2, low].map((tick) => (
                  <g key={tick}>
                    <line x1={0} x2={plotWidth} y1={y(tick)} y2={y(tick)} stroke="#1e2433" strokeWidth="1" />
                    <text x={width} y={y(tick) + 3} textAnchor="end" fontSize="10" fill="#94a3b8" fontFamily="ui-monospace, monospace">
                      {isCompany ? Math.round(tick).toLocaleString('en-IN') : tick.toFixed(1)}
                    </text>
                  </g>
                ))}

                {/* The starting level is what "progress" is measured against */}
                {startValue !== undefined && (
                  <line x1={0} x2={plotWidth} y1={y(startValue)} y2={y(startValue)} stroke="#64748b" strokeWidth="1" />
                )}

                <polyline
                  points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')}
                  fill="none"
                  stroke={LINE_COLOR}
                  strokeWidth="2"
                  strokeLinejoin="round"
                />

                {[0, points.length - 1].map((i) => (
                  <text
                    key={i}
                    x={i === 0 ? 0 : plotWidth}
                    y={PLOT_HEIGHT + 14}
                    textAnchor={i === 0 ? 'start' : 'end'}
                    fontSize="10"
                    fill="#94a3b8"
                    fontFamily="ui-monospace, monospace"
                  >
                    {formatDate(points[i].date)}
                  </text>
                ))}

                <line x1={x(shownIndex)} x2={x(shownIndex)} y1={0} y2={PLOT_HEIGHT} stroke="#94a3b8" strokeWidth="1" opacity={activeIndex === null ? 0 : 0.7} />
                <circle cx={x(shownIndex)} cy={y(shown.value)} r="4" fill={LINE_COLOR} stroke="#111520" strokeWidth="2" />
              </svg>
            ) : (
              <div className="rounded-lg bg-[#0a0d14] animate-pulse" style={{ height: PLOT_HEIGHT }} aria-label="Loading chart" />
            )}
          </div>

          {data && (
            <p className="text-[10px] font-mono text-slate-500 leading-relaxed">
              {data.method}
              {data.view === 'portfolio' && data.unavailable.length > 0 && ` Not included, no price data: ${data.unavailable.join(', ')}.`}
            </p>
          )}
          {(data?.is_stale || (error && data)) && (
            <p className="text-[11px] font-mono text-amber-400">
              Couldn&apos;t refresh from {data?.source}, so this is the last good copy.
            </p>
          )}

          {/* Biggest movers over the range double as shortcuts into the dropdown */}
          {!selection.ticker && leaders.length > 0 && (
            <div className="pt-1">
              <p className="text-[10px] font-mono text-slate-400 mb-1.5">Best and worst over {selection.range}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5">
                {leaders.map((c) => (
                  <button
                    key={c.ticker}
                    onClick={() => choose({ ticker: c.ticker })}
                    className="flex items-center justify-between gap-1.5 px-2 py-1.5 rounded-lg bg-[#0a0d14] border border-[#1e2433] hover:border-blue-500/50 text-[11px] font-mono transition-colors"
                  >
                    <span className="font-semibold text-slate-200 truncate">{c.ticker}</span>
                    <span className={`whitespace-nowrap ${changeTone(c.range_change_pct)}`}>{signedPct(c.range_change_pct, 1)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {points.length > 0 && (
            <details className="text-[11px] font-mono text-slate-400">
              <summary className="cursor-pointer py-1 hover:text-slate-200">View as table</summary>
              <div className="max-h-48 overflow-y-auto mt-1 border border-[#1e2433] rounded-lg">
                <table className="w-full text-left">
                  <thead className="bg-[#0a0d14] text-[10px] uppercase sticky top-0">
                    <tr>
                      <th className="py-1.5 px-2">Date</th>
                      <th className="py-1.5 px-2 text-right">{isCompany ? 'Close' : 'Index'}</th>
                      <th className="py-1.5 px-2 text-right">Since start</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1e2433] tabular-nums">
                    {[...points].reverse().map((p) => {
                      const change = startValue ? ((p.value - startValue) / Math.abs(startValue)) * 100 : null;
                      return (
                        <tr key={p.date}>
                          <td className="py-1 px-2">{p.date}</td>
                          <td className="py-1 px-2 text-right text-slate-200">{formatValue(p.value)}</td>
                          <td className={`py-1 px-2 text-right ${changeTone(change)}`}>{signedPct(change)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
