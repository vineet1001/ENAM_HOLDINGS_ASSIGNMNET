'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PriceBar } from '@/types';
import { changeTone, compactNumber, inr, signedPct } from '@/lib/ui';

const RANGES = [20, 40, 60];
const PRICE_HEIGHT = 150;
const VOLUME_HEIGHT = 56;
const AXIS_WIDTH = 52;
const VOLUME_LOOKBACK = 20;
const LINE_COLOR = '#60a5fa';

export function Sparkline({ values, width = 72, height = 22 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return <span className="inline-block" style={{ width, height }} />;
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const points = values.map((v, i) => [
    (i / (values.length - 1)) * (width - 4) + 2,
    height - 3 - ((v - min) / span) * (height - 6)
  ]);
  const [endX, endY] = points[points.length - 1];
  return (
    <svg width={width} height={height} aria-hidden="true" className="inline-block align-middle">
      <polyline
        points={points.map((p) => p.join(',')).join(' ')}
        fill="none"
        stroke="#64748b"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx={endX} cy={endY} r="2" fill={LINE_COLOR} />
    </svg>
  );
}

// Price and volume sit in separate panels with their own axes, sharing only the date crosshair.
export function PriceChart({ bars }: { bars: PriceBar[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [range, setRange] = useState(60);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Averages use the whole history, so a narrow range still has a full lookback behind it.
  const rows = useMemo(() => {
    const all = bars.map((bar, i) => {
      const prior = bars.slice(Math.max(0, i - VOLUME_LOOKBACK), i);
      const avgVolume = prior.length >= VOLUME_LOOKBACK
        ? prior.reduce((sum, b) => sum + b.volume, 0) / prior.length
        : null;
      const prevClose = i > 0 ? bars[i - 1].close : null;
      return {
        ...bar,
        avgVolume,
        changePct: prevClose ? ((bar.close - prevClose) / prevClose) * 100 : null,
        volumeMultiple: avgVolume ? bar.volume / avgVolume : null
      };
    });
    return all.slice(-range);
  }, [bars, range]);

  if (rows.length === 0) {
    return <p className="text-xs text-slate-400 font-mono py-6 text-center">No price history available.</p>;
  }

  const plotWidth = Math.max(0, width - AXIS_WIDTH);
  const closes = rows.map((r) => r.close);
  const minClose = Math.min(...closes);
  const maxClose = Math.max(...closes);
  const pad = (maxClose - minClose) * 0.08 || 1;
  const yMin = minClose - pad;
  const yMax = maxClose + pad;
  const maxVolume = Math.max(...rows.map((r) => r.volume)) || 1;

  const x = (i: number) => (rows.length === 1 ? plotWidth / 2 : (i / (rows.length - 1)) * (plotWidth - 8) + 4);
  const y = (v: number) => PRICE_HEIGHT - 6 - ((v - yMin) / (yMax - yMin)) * (PRICE_HEIGHT - 12);
  const barWidth = Math.max(1, plotWidth / rows.length - 2);
  const volumeTop = PRICE_HEIGHT + 22;
  const vy = (v: number) => (v / maxVolume) * (VOLUME_HEIGHT - 4);

  const shownIndex = activeIndex !== null && activeIndex < rows.length ? activeIndex : rows.length - 1;
  const shown = rows[shownIndex];
  const avgPoints = rows
    .map((r, i) => (r.avgVolume ? `${x(i)},${volumeTop + VOLUME_HEIGHT - vy(r.avgVolume)}` : null))
    .filter(Boolean)
    .join(' ');

  const pickIndex = (clientX: number, target: SVGSVGElement) => {
    const left = target.getBoundingClientRect().left;
    const ratio = (clientX - left - 4) / Math.max(1, plotWidth - 8);
    setActiveIndex(Math.min(rows.length - 1, Math.max(0, Math.round(ratio * (rows.length - 1)))));
  };

  return (
    <div className="space-y-2">
      {/* Readout stays in a fixed row so a finger never covers the value */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 font-mono" aria-live="off">
          <div className="text-base font-bold text-white">{inr(shown.close, 2)}</div>
          <div className="text-[11px] text-slate-400">
            {new Date(shown.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            <span className={`ml-2 ${changeTone(shown.changePct)}`}>{signedPct(shown.changePct)}</span>
          </div>
          <div className="text-[11px] text-slate-400">
            Vol {compactNumber(shown.volume)}
            {shown.volumeMultiple !== null && (
              <span className={shown.volumeMultiple >= 2 ? 'text-amber-300 font-semibold' : ''}>
                {' '}· {shown.volumeMultiple.toFixed(1)}× 20d avg
              </span>
            )}
          </div>
        </div>
        <div role="group" aria-label="Chart range" className="flex items-center bg-[#0a0d14] border border-[#1e2433] rounded-lg p-0.5 font-mono text-[11px] shrink-0">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => {
                setRange(r);
                setActiveIndex(null);
              }}
              aria-pressed={range === r}
              className={`px-2.5 py-1.5 rounded transition-colors ${
                range === r ? 'bg-blue-600 text-white font-medium' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {r}D
            </button>
          ))}
        </div>
      </div>

      <div ref={containerRef} className="w-full">
        {width > 0 && (
          <svg
            width={width}
            height={volumeTop + VOLUME_HEIGHT + 18}
            role="img"
            tabIndex={0}
            aria-label={`Closing price and volume for ${rows.length} trading days. Use left and right arrow keys to move between days.`}
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
                setActiveIndex(Math.min(rows.length - 1, shownIndex + 1));
              }
            }}
          >
            {/* Price panel */}
            {[yMax - pad, (yMax + yMin) / 2, yMin + pad].map((tick) => (
              <g key={tick}>
                <line x1={0} x2={plotWidth} y1={y(tick)} y2={y(tick)} stroke="#1e2433" strokeWidth="1" />
                <text x={width} y={y(tick) + 3} textAnchor="end" fontSize="10" fill="#94a3b8" fontFamily="ui-monospace, monospace">
                  {Math.round(tick).toLocaleString('en-IN')}
                </text>
              </g>
            ))}
            <polyline
              points={rows.map((r, i) => `${x(i)},${y(r.close)}`).join(' ')}
              fill="none"
              stroke={LINE_COLOR}
              strokeWidth="2"
              strokeLinejoin="round"
            />

            {/* Volume panel */}
            <text x={0} y={volumeTop - 6} fontSize="10" fill="#94a3b8" fontFamily="ui-monospace, monospace">
              Volume · line = 20d avg · amber ≥ 2× avg
            </text>
            {rows.map((r, i) => {
              const h = Math.max(1, vy(r.volume));
              const spike = r.volumeMultiple !== null && r.volumeMultiple >= 2;
              return (
                <rect
                  key={r.date}
                  x={x(i) - barWidth / 2}
                  y={volumeTop + VOLUME_HEIGHT - h}
                  width={barWidth}
                  height={h}
                  rx={Math.min(1.5, barWidth / 2)}
                  fill={spike ? '#fbbf24' : i === shownIndex ? '#94a3b8' : '#475569'}
                />
              );
            })}
            {avgPoints && <polyline points={avgPoints} fill="none" stroke="#e2e8f0" strokeWidth="1" />}

            {/* X-axis endpoints */}
            {[0, rows.length - 1].map((i) => (
              <text
                key={i}
                x={i === 0 ? 0 : plotWidth}
                y={volumeTop + VOLUME_HEIGHT + 14}
                textAnchor={i === 0 ? 'start' : 'end'}
                fontSize="10"
                fill="#94a3b8"
                fontFamily="ui-monospace, monospace"
              >
                {new Date(rows[i].date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
              </text>
            ))}

            {/* Crosshair snaps to the nearest trading day */}
            <line
              x1={x(shownIndex)}
              x2={x(shownIndex)}
              y1={0}
              y2={volumeTop + VOLUME_HEIGHT}
              stroke="#94a3b8"
              strokeWidth="1"
              opacity={activeIndex === null ? 0 : 0.7}
            />
            <circle cx={x(shownIndex)} cy={y(shown.close)} r="4" fill={LINE_COLOR} stroke="#111520" strokeWidth="2" />
          </svg>
        )}
      </div>

      <details className="text-[11px] font-mono text-slate-400">
        <summary className="cursor-pointer py-1 hover:text-slate-200">View as table</summary>
        <div className="max-h-48 overflow-y-auto mt-1 border border-[#1e2433] rounded-lg">
          <table className="w-full text-left">
            <thead className="bg-[#0a0d14] text-[10px] uppercase sticky top-0">
              <tr>
                <th className="py-1.5 px-2">Date</th>
                <th className="py-1.5 px-2 text-right">Close</th>
                <th className="py-1.5 px-2 text-right">Change</th>
                <th className="py-1.5 px-2 text-right">Volume</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e2433] tabular-nums">
              {[...rows].reverse().map((r) => (
                <tr key={r.date}>
                  <td className="py-1 px-2">{r.date}</td>
                  <td className="py-1 px-2 text-right text-slate-200">{inr(r.close, 2)}</td>
                  <td className={`py-1 px-2 text-right ${changeTone(r.changePct)}`}>{signedPct(r.changePct)}</td>
                  <td className="py-1 px-2 text-right">{compactNumber(r.volume)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
