'use client';

import React, { useMemo, useRef, useState } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Info } from 'lucide-react';

// Validated against the #111520 surface: blue, orange, aqua (dataviz palette, dark steps).
const PRICE = '#3987e5';
const MA50 = '#d95926';
const MA200 = '#199e70';
const CARD = 'p-4 rounded-xl bg-[#111520] border border-[#1e2433] space-y-3';
const HEADING = 'text-xs font-bold text-white uppercase tracking-wider font-mono';
// Close to phone width, so 10px labels stay readable when the chart scales.
const WIDTH = 380;
const HEIGHT = 220;
const PAD = { top: 12, right: 50, bottom: 22, left: 6 };

interface SeriesPoint {
  date: string;
  close: number | null;
  ma50: number | null;
  ma200: number | null;
  upper: number | null;
  lower: number | null;
}

interface ConePoint {
  date: string;
  low_68: number;
  high_68: number;
  low_95: number;
  high_95: number;
}

const rupees = (value: number | null | undefined, digits = 0) =>
  value === null || value === undefined ? '—' : `₹${value.toLocaleString('en-IN', { maximumFractionDigits: digits })}`;

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
}

// Price with its averages, then the volatility range stretching ahead. One y-axis in rupees.
function ScenarioChart({ series, cone }: { series: SeriesPoint[]; cone: ConePoint[] | null }) {
  const [show, setShow] = useState({ ma50: true, ma200: true, bands: false, range: true });
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const future = show.range && cone ? cone.slice(1) : [];
  const total = series.length + future.length;
  const values = useMemo(() => {
    const all: number[] = [];
    series.forEach((p) => {
      [p.close, show.ma50 ? p.ma50 : null, show.ma200 ? p.ma200 : null, show.bands ? p.upper : null, show.bands ? p.lower : null]
        .forEach((v) => v !== null && all.push(v));
    });
    future.forEach((p) => all.push(p.low_95, p.high_95));
    return all;
  }, [series, future, show]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => PAD.left + (i / Math.max(1, total - 1)) * (WIDTH - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - min) / span) * (HEIGHT - PAD.top - PAD.bottom);

  const path = (key: keyof SeriesPoint) => {
    let d = '';
    series.forEach((p, i) => {
      const v = p[key] as number | null;
      if (v === null) return;
      d += `${d && series[i - 1]?.[key] !== null ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    });
    return d;
  };
  const band = (points: Array<{ i: number; low: number; high: number }>) =>
    points.length
      ? `M${points.map((p) => `${x(p.i).toFixed(1)},${y(p.high).toFixed(1)}`).join('L')}L${[...points].reverse().map((p) => `${x(p.i).toFixed(1)},${y(p.low).toFixed(1)}`).join('L')}Z`
      : '';

  const last = series.length - 1;
  const lastClose = series[last]?.close ?? 0;
  const cone68 = future.length ? band([{ i: last, low: lastClose, high: lastClose }, ...future.map((p, k) => ({ i: last + 1 + k, low: p.low_68, high: p.high_68 }))]) : '';
  const cone95 = future.length ? band([{ i: last, low: lastClose, high: lastClose }, ...future.map((p, k) => ({ i: last + 1 + k, low: p.low_95, high: p.high_95 }))]) : '';
  const bollinger = show.bands
    ? band(series.map((p, i) => ({ i, low: p.lower ?? NaN, high: p.upper ?? NaN })).filter((p) => !Number.isNaN(p.low)))
    : '';
  const ticks = [min, min + span / 2, max];

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) return;
    const ratio = ((e.clientX - box.left) / box.width * WIDTH - PAD.left) / (WIDTH - PAD.left - PAD.right);
    setHover(Math.max(0, Math.min(total - 1, Math.round(ratio * (total - 1)))));
  };

  const hovered = hover === null ? null : hover <= last ? { kind: 'past' as const, point: series[hover] } : { kind: 'future' as const, point: future[hover - last - 1] };
  const toggles: Array<[keyof typeof show, string, string | null]> = [
    ['ma50', '50-day avg', MA50],
    ['ma200', '200-day avg', MA200],
    ['bands', 'Bollinger', null],
    ['range', '3-month range', null],
  ];

  return (
    <div className="space-y-2">
      <div role="group" aria-label="Chart layers" className="flex items-center gap-1.5 flex-wrap text-[11px] font-mono">
        {toggles.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setShow((s) => ({ ...s, [key]: !s[key] }))}
            aria-pressed={show[key]}
            className={`px-2 py-1 rounded border transition-colors ${show[key] ? 'border-blue-500/50 text-slate-100 bg-blue-600/15' : 'border-[#1e2433] text-slate-400'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="min-h-[34px] font-mono text-[11px]" aria-live="polite">
        {hovered?.kind === 'past' && hovered.point ? (
          <p className="text-slate-300">
            <span className="text-slate-400">{shortDate(hovered.point.date)}</span> · close <span className="text-white">{rupees(hovered.point.close, 1)}</span>
            {show.ma50 && hovered.point.ma50 !== null && <> · 50-day {rupees(hovered.point.ma50)}</>}
            {show.ma200 && hovered.point.ma200 !== null && <> · 200-day {rupees(hovered.point.ma200)}</>}
          </p>
        ) : hovered?.kind === 'future' && hovered.point ? (
          <p className="text-slate-300">
            <span className="text-slate-400">{shortDate(hovered.point.date)}</span> · usual range <span className="text-white">{rupees(hovered.point.low_68)}–{rupees(hovered.point.high_68)}</span> · wide {rupees(hovered.point.low_95)}–{rupees(hovered.point.high_95)}
          </p>
        ) : (
          <p className="text-slate-500">Hover or touch the chart to read a day.</p>
        )}
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full h-auto touch-none select-none"
        role="img"
        aria-label="Closing price for the last year with moving averages, and the usual range for the next three months"
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(null)}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(tick)} y2={y(tick)} stroke="#1e2433" strokeWidth="1" />
            <text x={WIDTH - PAD.right + 6} y={y(tick) + 3} fill="#94a3b8" fontSize="10" fontFamily="monospace">{rupees(tick)}</text>
          </g>
        ))}
        {cone95 && <path d={cone95} fill={PRICE} fillOpacity="0.12" />}
        {cone68 && <path d={cone68} fill={PRICE} fillOpacity="0.22" />}
        {bollinger && <path d={bollinger} fill="#94a3b8" fillOpacity="0.1" />}
        {show.ma200 && <path d={path('ma200')} fill="none" stroke={MA200} strokeWidth="2" vectorEffect="non-scaling-stroke" />}
        {show.ma50 && <path d={path('ma50')} fill="none" stroke={MA50} strokeWidth="2" vectorEffect="non-scaling-stroke" />}
        <path d={path('close')} fill="none" stroke={PRICE} strokeWidth="2" vectorEffect="non-scaling-stroke" />
        {future.length > 0 && <line x1={x(last)} x2={x(last)} y1={PAD.top} y2={HEIGHT - PAD.bottom} stroke="#2a3449" strokeDasharray="3 3" />}
        <text x={PAD.left} y={HEIGHT - 6} fill="#94a3b8" fontSize="10" fontFamily="monospace">{series[0] ? shortDate(series[0].date) : ''}</text>
        <text x={x(last)} y={HEIGHT - 6} fill="#94a3b8" fontSize="10" fontFamily="monospace" textAnchor="middle">Today</text>
        {hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={HEIGHT - PAD.bottom} stroke="#cbd5e1" strokeWidth="1" opacity="0.5" />
        )}
        {hover !== null && hover <= last && series[hover]?.close !== null && (
          <circle cx={x(hover)} cy={y(series[hover].close as number)} r="4" fill={PRICE} stroke="#111520" strokeWidth="2" />
        )}
      </svg>

      <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-[11px] font-mono text-slate-300">
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-0.5 rounded" style={{ background: PRICE }} />Price</span>
        {show.ma50 && <span className="inline-flex items-center gap-1.5"><span className="w-3 h-0.5 rounded" style={{ background: MA50 }} />50-day average</span>}
        {show.ma200 && <span className="inline-flex items-center gap-1.5"><span className="w-3 h-0.5 rounded" style={{ background: MA200 }} />200-day average</span>}
        {show.range && future.length > 0 && <span className="inline-flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm" style={{ background: PRICE, opacity: 0.35 }} />Usual / wide range ahead</span>}
      </div>
    </div>
  );
}

const TONE: Record<string, { icon: React.ElementType; className: string }> = {
  up: { icon: ArrowUpRight, className: 'text-emerald-400' },
  down: { icon: ArrowDownRight, className: 'text-rose-400' },
  flat: { icon: ArrowRight, className: 'text-slate-400' },
};

function Segmented<T extends string | number>({ label, options, value, onChange, format }: {
  label: string;
  options: T[];
  value: T;
  onChange: (next: T) => void;
  format: (option: T) => string;
}) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-1 bg-[#0a0d14] border border-[#1e2433] rounded-lg p-1 text-xs font-mono w-fit">
      {options.map((option) => (
        <button
          key={String(option)}
          type="button"
          onClick={() => onChange(option)}
          aria-pressed={value === option}
          className={`px-2.5 py-1.5 rounded transition-colors ${value === option ? 'bg-blue-600 text-white font-medium' : 'text-slate-400 hover:text-slate-200'}`}
        >
          {format(option)}
        </button>
      ))}
    </div>
  );
}

function RangeCard({ data }: { data: any }) {
  const [horizon, setHorizon] = useState('3M');
  const range = data.ranges.find((r: any) => r.horizon === horizon);
  const names: Record<string, string> = { '1M': '1 month', '3M': '3 months', '1Y': '1 year' };
  return (
    <div className={CARD}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className={HEADING}>Volatility range</h3>
        <Segmented label="Range horizon" options={['1M', '3M', '1Y']} value={horizon} onChange={setHorizon} format={(o) => o} />
      </div>
      <p className="text-[11px] text-slate-400 leading-relaxed">
        The stock moves about {data.daily_pct}% on a typical day ({data.annual_pct}% a year). If the next {names[horizon]} are like the last year, with no trend assumed:
      </p>
      <div className="grid grid-cols-2 gap-2 font-mono">
        <div className="p-3 rounded-lg bg-[#0a0d14] border border-[#1e2433]">
          <div className="text-[10px] text-slate-400 uppercase">Usual range, 2 in 3 chance</div>
          <div className="text-sm font-bold text-white mt-0.5 tabular-nums">{rupees(range.low_68)}–{rupees(range.high_68)}</div>
        </div>
        <div className="p-3 rounded-lg bg-[#0a0d14] border border-[#1e2433]">
          <div className="text-[10px] text-slate-400 uppercase">Wide range, 19 in 20</div>
          <div className="text-sm font-bold text-white mt-0.5 tabular-nums">{rupees(range.low_95)}–{rupees(range.high_95)}</div>
        </div>
      </div>
      {range.backtest ? (
        <p className="text-[11px] font-mono text-slate-300 leading-relaxed">
          Checked against this stock&apos;s own past: ranges drawn this way held <span className="text-white font-bold">{range.backtest.inside_68}%</span> of the time (68% expected)
          and the wide one <span className="text-white font-bold">{range.backtest.inside_95}%</span> (95% expected), over {range.backtest.samples} past {names[horizon]} windows.
        </p>
      ) : (
        <p className="text-[11px] font-mono text-slate-500">Not enough history to check how often this range has held before.</p>
      )}
    </div>
  );
}

// Where today's P/E sits within the stock's own history, and what price each end would mean.
function PeBand({ band }: { band: any }) {
  if (!band.available) {
    return (
      <div className={CARD}>
        <h3 className={HEADING}>P/E band</h3>
        <p className="text-xs text-slate-400">{band.reason}</p>
      </div>
    );
  }
  const low = band.low.pe;
  const high = band.high.pe;
  const lo = Math.min(low, band.current_pe);
  const hi = Math.max(high, band.current_pe);
  const at = (pe: number) => `${((pe - lo) / (hi - lo || 1)) * 100}%`;
  const marker = (band.current_pe - lo) / (hi - lo || 1);
  return (
    <div className={CARD}>
      <h3 className={HEADING}>P/E band, {band.years.length} years</h3>
      <div className="relative h-10 mx-2" role="img" aria-label={`P/E ranged from ${low} to ${high}, median ${band.median.pe}. Today ${band.current_pe}.`}>
        <div className="absolute top-4 h-1.5 rounded-full bg-[#1e2433] left-0 right-0" />
        <div className="absolute top-4 h-1.5 rounded-full bg-blue-500/50" style={{ left: at(low), width: `calc(${at(high)} - ${at(low)})` }} />
        <div className="absolute top-2.5 w-0.5 h-4 bg-slate-300" style={{ left: at(band.median.pe) }} />
        <div className="absolute top-2.5 w-3.5 h-3.5 rounded-full bg-white ring-2 ring-[#111520] -translate-x-1/2 translate-y-0.5" style={{ left: at(band.current_pe) }} />
        {/* Near either end the label hangs inward, so it never runs off the card. */}
        <span
          className={`absolute top-7 text-[10px] font-mono text-white whitespace-nowrap ${
            marker < 0.2 ? '' : marker > 0.8 ? '-translate-x-full' : '-translate-x-1/2'
          }`}
          style={{ left: at(band.current_pe) }}
        >
          today {band.current_pe}x
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 font-mono text-center">
        {([['At its lowest', band.low], ['At its median', band.median], ['At its highest', band.high]] as Array<[string, any]>).map(([label, point]) => (
          <div key={label} className="p-2.5 rounded-lg bg-[#0a0d14] border border-[#1e2433]">
            <div className="text-[10px] text-slate-400">{label} ({point.pe}x)</div>
            <div className="text-sm font-bold text-white tabular-nums mt-0.5">{rupees(point.price)}</div>
          </div>
        ))}
      </div>
      {band.note && <p className="text-[11px] font-mono text-amber-400">{band.note}</p>}
      <p className="text-[10px] font-mono text-slate-500 leading-relaxed">
        Year-end price ÷ that year&apos;s reported EPS, applied to the last 12 months&apos; EPS of ₹{band.ttm_eps}.
        {band.dropped.length > 0 && ` Left out ${band.dropped.join(', ')}: far from the rest, usually a split the reported EPS wasn't adjusted for.`}
      </p>
      <details className="text-[11px]">
        <summary className="cursor-pointer font-mono text-slate-400 hover:text-slate-200">Each year</summary>
        <table className="w-full mt-2 font-mono tabular-nums">
          <thead className="text-[10px] uppercase text-slate-400"><tr><th className="text-left py-1">Year</th><th className="text-right">Price</th><th className="text-right">EPS</th><th className="text-right">P/E</th></tr></thead>
          <tbody className="divide-y divide-[#1e2433]">
            {band.years.map((year: any) => (
              <tr key={year.period}><td className="py-1 text-slate-300">{year.period}</td><td className="text-right text-slate-200">{rupees(year.price)}</td><td className="text-right text-slate-200">{year.eps}</td><td className="text-right text-slate-200">{year.pe}x</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function ReverseDcf({ dcf }: { dcf: any }) {
  const [discount, setDiscount] = useState(12);
  const [terminal, setTerminal] = useState(5);
  if (!dcf.available) {
    return (
      <div className={CARD}>
        <h3 className={HEADING}>Reverse DCF</h3>
        <p className="text-xs text-slate-400">{dcf.reason}</p>
      </div>
    );
  }
  const cell = dcf.grid.find((g: any) => g.discount === discount && g.terminal === terminal);
  const past = dcf.past_growth;
  return (
    <div className={CARD}>
      <h3 className={HEADING}>What the price assumes</h3>
      <p className="text-[11px] text-slate-400 leading-relaxed">
        A reverse DCF asks how fast free cash flow must grow for the next 10 years to justify today&apos;s value. Pick the return an investor wants and the growth after year 10:
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <Segmented label="Required return" options={[10, 11, 12, 13, 14]} value={discount} onChange={setDiscount} format={(o) => `${o}%`} />
        <Segmented label="Growth after year 10" options={[4, 5, 6]} value={terminal} onChange={setTerminal} format={(o) => `${o}%`} />
      </div>
      <div className="p-3 rounded-lg bg-[#0a0d14] border border-[#1e2433] font-mono" aria-live="polite">
        <div className="text-[10px] text-slate-400 uppercase">Growth the price needs, each year for 10 years</div>
        <div className="text-2xl font-bold text-white mt-0.5">
          {cell?.growth !== null && cell?.growth !== undefined ? `${cell.growth}%` : cell?.bound === 'above' ? 'Over 60%' : 'Below -30%'}
        </div>
        <div className="text-[11px] text-slate-400 mt-1">
          For comparison, over the last 5 years revenue grew {past.revenue_5y ?? '—'}% a year and profit {past.pat_5y ?? '—'}% a year.
        </div>
      </div>
      <p className="text-[10px] font-mono text-slate-500 leading-relaxed">
        Market value ₹{dcf.market_cap.toLocaleString('en-IN')} Cr plus borrowings ₹{dcf.debt.toLocaleString('en-IN')} Cr, against average free cash flow of ₹{dcf.base_fcf.toLocaleString('en-IN')} Cr over three years.
        Cash on the balance sheet isn&apos;t subtracted, because the reported tables don&apos;t separate it, so for cash-rich companies the growth shown is a little high.
      </p>
    </div>
  );
}

export function PriceScenariosView({ data }: { data: any }) {
  if (!data.available) {
    return <p className="p-4 rounded-xl bg-[#111520] border border-[#1e2433] text-xs text-slate-400">{data.reason}</p>;
  }
  const technicals = data.technicals;
  return (
    <>
      <p className="flex items-start gap-2 p-3 rounded-lg bg-[#0a0d14] border border-amber-500/30 text-[11px] text-amber-200/90 leading-relaxed">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>Scenarios worked out from past prices and reported numbers, not forecasts or advice. No method here predicts where the price will go.</span>
      </p>
      <div className={CARD}>
        <div className="flex items-baseline justify-between gap-3">
          <h3 className={HEADING}>Price, last year</h3>
          <span className="text-[11px] font-mono text-slate-400">{rupees(data.price, 1)} on {shortDate(data.as_of)}</span>
        </div>
        <ScenarioChart series={technicals.series} cone={data.volatility?.cone || null} />
      </div>
      {data.volatility && <RangeCard data={data.volatility} />}
      <div className={CARD}>
        <h3 className={HEADING}>Trend signals</h3>
        <ul className="space-y-2 text-xs">
          {technicals.signals.map((signal: any, i: number) => {
            const tone = TONE[signal.tone] || TONE.flat;
            const Icon = tone.icon;
            return (
              <li key={i} className="flex items-start gap-2 text-slate-200 leading-relaxed">
                <Icon className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${tone.className}`} aria-hidden="true" />
                <span>{signal.text}</span>
              </li>
            );
          })}
        </ul>
        <p className="text-[10px] font-mono text-slate-500">Technical signals describe recent price behaviour. On their own they have a weak record of predicting what comes next.</p>
      </div>
      <PeBand band={data.pe_band} />
      <ReverseDcf dcf={data.reverse_dcf} />
    </>
  );
}
