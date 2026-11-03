'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { QuarterlyComparisonResponse } from '@/types';
import { changeTone, signedPct } from '@/lib/ui';

// First cut of a results filing: Revenue, EBITDA, PBT and PAT against QoQ and YoY.
export function ResultsHeadline({ ticker }: { ticker: string }) {
  const [data, setData] = useState<QuarterlyComparisonResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    api.getFinancials(ticker)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Could not load results');
      });
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  if (error) {
    return <p className="text-[11px] text-rose-400 font-mono">No results comparison available: {error}</p>;
  }
  if (!data) {
    return <div className="h-28 rounded-lg bg-[#0a0d14] border border-[#1e2433] animate-pulse" />;
  }
  // Companies with no stored quarters get a different response shape with an empty metrics list.
  if (data.metrics.length === 0) {
    return (
      <p className="p-3 rounded-lg bg-[#0a0d14] border border-[#1e2433] text-[11px] text-slate-400 font-mono">
        No quarterly numbers on file for {ticker}.
      </p>
    );
  }

  return (
    <div className="rounded-lg bg-[#0a0d14] border border-[#1e2433] overflow-hidden animate-fade-in">
      <table className="w-full text-xs text-left">
        <thead className="text-slate-400 font-mono uppercase text-[10px] border-b border-[#1e2433]">
          <tr>
            <th className="py-2 px-3">₹ Cr · {data.current_period}</th>
            <th className="py-2 px-2 text-right">Value</th>
            <th className="py-2 px-2 text-right">QoQ</th>
            <th className="py-2 px-3 text-right">YoY</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#1e2433] font-mono tabular-nums">
          {data.metrics.map((row) => (
            <tr key={row.metric}>
              <td className="py-2 px-3 font-semibold text-slate-200">{row.metric === 'REVENUE' ? 'Revenue' : row.metric}</td>
              <td className="py-2 px-2 text-right text-white">
                {row.current_quarter !== null ? row.current_quarter.toLocaleString('en-IN') : '—'}
              </td>
              <td className={`py-2 px-2 text-right whitespace-nowrap ${changeTone(row.qoq_pct)}`}>{signedPct(row.qoq_pct, 1)}</td>
              <td className={`py-2 px-3 text-right whitespace-nowrap ${changeTone(row.yoy_pct)}`}>{signedPct(row.yoy_pct, 1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-3 py-2 border-t border-[#1e2433] text-[10px] font-mono text-slate-400 flex flex-wrap justify-between gap-x-3 gap-y-1">
        <span>
          EBITDA margin {data.ebitda_margin_current !== null ? `${data.ebitda_margin_current.toFixed(1)}%` : '—'}
          {' '}vs {data.ebitda_margin_previous !== null ? `${data.ebitda_margin_previous.toFixed(1)}%` : '—'} ({data.previous_period})
        </span>
        <span className={data.is_demo ? 'text-amber-400' : ''}>{data.is_demo ? 'Demo figures' : data.source}</span>
      </div>
    </div>
  );
}
