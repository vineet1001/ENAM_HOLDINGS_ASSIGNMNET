'use client';

import React, { useState } from 'react';
import { ChevronDown, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { OptimiseResult } from '@/types';

// Validated against the #111520 surface (dataviz palette, dark steps).
const FRONTIER = '#3987e5';
const CURRENT = '#d95926';
const SUGGESTED = '#199e70';
const EQUAL = '#c98500';
// Close to phone width, so 10px labels stay readable when the chart scales.
const WIDTH = 360;
const HEIGHT = 240;
const PAD = { top: 14, right: 40, bottom: 34, left: 40 };

interface Marker {
  key: string;
  label: string;
  color: string;
  risk: number;
  ret: number;
}

// Risk across, expected return up. Each stock is a grey dot; the line is the best return for each level of risk.
function FrontierChart({ result }: { result: OptimiseResult }) {
  const [active, setActive] = useState<string | null>(null);
  const markers: Marker[] = [
    { key: 'suggested', label: 'Suggested', color: SUGGESTED, risk: result.suggested.risk_pct, ret: result.suggested.return_pct },
    ...(result.current ? [{ key: 'current', label: 'Your weights', color: CURRENT, risk: result.current.risk_pct, ret: result.current.return_pct }] : []),
    { key: 'equal', label: 'Equal weights', color: EQUAL, risk: result.equal.risk_pct, ret: result.equal.return_pct },
  ];
  const risks = [...result.frontier.map((p) => p.risk_pct), ...result.stocks.map((s) => s.risk_pct), ...markers.map((m) => m.risk)];
  const returns = [...result.frontier.map((p) => p.return_pct), ...result.stocks.map((s) => s.return_pct), ...markers.map((m) => m.ret)];
  const [xMin, xMax] = [Math.min(0, ...risks), Math.max(...risks) * 1.08];
  const yLow = Math.min(...returns);
  const yHigh = Math.max(...returns);
  const yPad = (yHigh - yLow) * 0.1 || 1;
  const [yMin, yMax] = [yLow - yPad, yHigh + yPad];
  const x = (v: number) => PAD.left + ((v - xMin) / (xMax - xMin || 1)) * (WIDTH - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin || 1)) * (HEIGHT - PAD.top - PAD.bottom);
  const line = result.frontier.map((p, i) => `${i ? 'L' : 'M'}${x(p.risk_pct).toFixed(1)},${y(p.return_pct).toFixed(1)}`).join('');
  const yTicks = [yMin + yPad, (yMin + yMax) / 2, yMax - yPad];
  const xTicks = [xMax * 0.25, xMax * 0.5, xMax * 0.75].map((v) => Math.round(v));

  const shown = active ? [...markers, ...result.stocks.map((s) => ({ key: s.ticker, label: s.ticker, color: '#94a3b8', risk: s.risk_pct, ret: s.return_pct }))].find((m) => m.key === active) : null;

  return (
    <div className="space-y-2">
      <p className="min-h-[18px] text-[11px] font-mono text-slate-300" aria-live="polite">
        {shown ? <>{shown.label}: return {shown.ret}% a year, risk {shown.risk}%</> : <span className="text-slate-500">Touch a point to read it.</span>}
      </p>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-auto" role="img" aria-label="Expected return against risk for each stock, the efficient frontier, and the suggested, current and equal-weight portfolios">
        {yTicks.map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(tick)} y2={y(tick)} stroke="#1e2433" />
            <text x={PAD.left - 6} y={y(tick) + 3} fill="#94a3b8" fontSize="10" fontFamily="monospace" textAnchor="end">{tick.toFixed(0)}%</text>
          </g>
        ))}
        {xTicks.map((tick) => (
          <text key={tick} x={x(tick)} y={HEIGHT - PAD.bottom + 14} fill="#94a3b8" fontSize="10" fontFamily="monospace" textAnchor="middle">{tick}%</text>
        ))}
        <text x={(PAD.left + WIDTH - PAD.right) / 2} y={HEIGHT - 4} fill="#94a3b8" fontSize="10" fontFamily="monospace" textAnchor="middle">Risk (yearly volatility)</text>
        <text x={10} y={PAD.top + 4} fill="#94a3b8" fontSize="10" fontFamily="monospace">Return</text>
        <path d={line} fill="none" stroke={FRONTIER} strokeWidth="2" />
        {result.stocks.map((stock) => (
          <g key={stock.ticker} onPointerEnter={() => setActive(stock.ticker)} onClick={() => setActive(stock.ticker)} className="cursor-pointer">
            <circle cx={x(stock.risk_pct)} cy={y(stock.return_pct)} r="12" fill="transparent" />
            <circle cx={x(stock.risk_pct)} cy={y(stock.return_pct)} r="4" fill="#94a3b8" stroke="#111520" strokeWidth="2" />
            <text x={x(stock.risk_pct) + 7} y={y(stock.return_pct) + 3} fill="#cbd5e1" fontSize="10" fontFamily="monospace">{stock.ticker}</text>
          </g>
        ))}
        {markers.map((marker) => (
          <g key={marker.key} onPointerEnter={() => setActive(marker.key)} onClick={() => setActive(marker.key)} className="cursor-pointer">
            <circle cx={x(marker.risk)} cy={y(marker.ret)} r="14" fill="transparent" />
            <circle cx={x(marker.risk)} cy={y(marker.ret)} r={active === marker.key ? 7 : 6} fill={marker.color} stroke="#111520" strokeWidth="2" />
          </g>
        ))}
      </svg>
      <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-[11px] font-mono text-slate-300">
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-0.5 rounded" style={{ background: FRONTIER }} />Best return for each risk</span>
        {markers.map((marker) => (
          <span key={marker.key} className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: marker.color }} />{marker.label}</span>
        ))}
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-slate-400" />One stock</span>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] text-slate-400">{label}</dt>
      <dd className="text-slate-100 tabular-nums">{value}</dd>
    </div>
  );
}

export function WeightSuggestions({
  holdings,
  onApply
}: {
  holdings: Array<{ ticker: string; weight: number }>;
  onApply: (weights: Record<string, number>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [objective, setObjective] = useState<'max_sharpe' | 'min_variance'>('max_sharpe');
  const [maxWeight, setMaxWeight] = useState(40);
  const [years, setYears] = useState(3);
  const [result, setResult] = useState<OptimiseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(await api.optimisePortfolio({
        holdings: holdings.map((h) => ({ ticker: h.ticker, weight: h.weight > 0 ? h.weight : 1 })),
        objective,
        max_weight: maxWeight,
        years,
      }));
    } catch (err: any) {
      setResult(null);
      setError(err.message || 'Weights could not be worked out');
    } finally {
      setLoading(false);
    }
  };

  const weights = result?.suggested.weights || {};
  const kept = Object.entries(weights).filter(([, w]) => w > 0);
  const dropped = holdings.map((h) => h.ticker).filter((t) => !(weights[t] > 0));

  return (
    <div className="rounded-lg border border-[#1e2433] bg-[#0a0d14]">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left">
        <span className="inline-flex items-center gap-2 font-medium text-slate-200">
          <Sparkles className="w-3.5 h-3.5 text-blue-400" />
          Suggest weights (Markowitz)
        </span>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-3 animate-fade-in">
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Finds weights from how these stocks moved, and moved together, in the past. Past returns are a weak guide to future ones, so treat the result as a starting point.
          </p>
          <div className="flex items-center gap-2 flex-wrap font-mono">
            <div role="group" aria-label="Goal" className="flex items-center gap-1 bg-[#111520] border border-[#1e2433] rounded-lg p-1">
              {([['max_sharpe', 'Best return for the risk'], ['min_variance', 'Lowest risk']] as const).map(([value, label]) => (
                <button key={value} type="button" onClick={() => setObjective(value)} aria-pressed={objective === value} className={`px-2.5 py-1.5 rounded ${objective === value ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
                  {label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-1.5 text-slate-400">
              Max per stock
              <select value={maxWeight} onChange={(e) => setMaxWeight(Number(e.target.value))} className="bg-[#111520] border border-[#1e2433] rounded px-2 py-1.5 text-base md:text-xs text-slate-200">
                {[20, 25, 40, 60, 100].map((v) => <option key={v} value={v}>{v}%</option>)}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-slate-400">
              History
              <select value={years} onChange={(e) => setYears(Number(e.target.value))} className="bg-[#111520] border border-[#1e2433] rounded px-2 py-1.5 text-base md:text-xs text-slate-200">
                {[1, 3, 5].map((v) => <option key={v} value={v}>{v} year{v > 1 ? 's' : ''}</option>)}
              </select>
            </label>
            <button type="button" onClick={run} disabled={loading || holdings.length < 2} className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium disabled:opacity-50">
              {loading ? 'Working out...' : 'Suggest'}
            </button>
          </div>
          {holdings.length < 2 && <p className="text-[11px] font-mono text-slate-400">Add at least two companies first.</p>}
          {error && <p className="text-[11px] font-mono text-rose-300">{error}</p>}

          {result && (
            <div className="space-y-3 animate-fade-in">
              <FrontierChart result={result} />
              <dl className="grid grid-cols-3 gap-2 text-xs font-mono">
                {([['Suggested', result.suggested], ['Your weights', result.current], ['Equal', result.equal]] as const).map(([label, s]) =>
                  s ? (
                    <div key={label} className="p-2 rounded bg-[#111520] border border-[#1e2433] space-y-1">
                      <div className="text-[10px] uppercase text-slate-300">{label}</div>
                      <Stat label="Return / yr" value={`${s.return_pct}%`} />
                      <Stat label="Risk" value={`${s.risk_pct}%`} />
                      <Stat label="Sharpe" value={s.sharpe === null ? '—' : String(s.sharpe)} />
                    </div>
                  ) : null
                )}
              </dl>
              <table className="w-full text-xs font-mono tabular-nums">
                <thead className="text-[10px] uppercase text-slate-400 border-b border-[#1e2433]">
                  <tr><th className="text-left py-1.5">Stock</th><th className="text-right">Now</th><th className="text-right">Suggested</th></tr>
                </thead>
                <tbody className="divide-y divide-[#1e2433]">
                  {holdings.map((h) => (
                    <tr key={h.ticker}>
                      <td className="py-1.5 text-slate-200">{h.ticker}</td>
                      <td className="text-right text-slate-400">{h.weight}%</td>
                      <td className="text-right text-white">{weights[h.ticker] !== undefined ? `${weights[h.ticker]}%` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[10px] font-mono text-slate-500 leading-relaxed">
                {result.sessions} trading days, {result.start} to {result.end}. Sharpe uses a {result.risk_free_pct}% risk-free rate, roughly the 10-year government bond yield.
                {result.left_out.length > 0 && ` Left out: ${result.left_out.map((l) => `${l.ticker} (${l.reason})`).join(', ')}.`}
              </p>
              <button
                type="button"
                onClick={() => onApply(Object.fromEntries(kept))}
                className="w-full px-3 py-2 rounded-lg border border-blue-500/50 text-blue-300 hover:bg-blue-600/15 font-medium"
              >
                Use these weights{dropped.length > 0 ? `, removing ${dropped.join(', ')}` : ''}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
