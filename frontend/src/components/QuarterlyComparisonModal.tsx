'use client';

import React from 'react';
import { X, TrendingUp, TrendingDown, FileText, CheckCircle2 } from 'lucide-react';
import { QuarterlyComparisonResponse } from '@/types';

export function QuarterlyComparisonModal({
  data,
  onClose
}: {
  data: QuarterlyComparisonResponse | null;
  onClose: () => void;
}) {
  if (!data) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#111520] border border-[#1e2433] rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl p-6">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-[#1e2433]">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                {data.company_ticker}
              </span>
              <h3 className="text-base font-semibold text-white">Quarterly Results Comparison</h3>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Reporting Basis: <span className="text-slate-200 capitalize font-medium">{data.reporting_basis}</span> | Source: <span className="text-slate-200">{data.source || 'Exchange Filings'}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-[#1a2030] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* EBITDA Margin Highlights */}
        <div className="grid grid-cols-3 gap-3 my-5">
          <div className="p-3 rounded-lg bg-[#0a0d14] border border-[#1e2433]">
            <div className="text-[11px] text-slate-400 font-mono">Current ({data.current_period})</div>
            <div className="text-lg font-bold text-white font-mono mt-0.5">
              {data.ebitda_margin_current !== null ? `${data.ebitda_margin_current.toFixed(1)}%` : 'N/A'}
            </div>
            <div className="text-[10px] text-slate-400">EBITDA Margin</div>
          </div>
          <div className="p-3 rounded-lg bg-[#0a0d14] border border-[#1e2433]">
            <div className="text-[11px] text-slate-400 font-mono">Preceding ({data.previous_period})</div>
            <div className="text-lg font-bold text-slate-300 font-mono mt-0.5">
              {data.ebitda_margin_previous !== null ? `${data.ebitda_margin_previous.toFixed(1)}%` : 'N/A'}
            </div>
            <div className="text-[10px] text-slate-400">EBITDA Margin</div>
          </div>
          <div className="p-3 rounded-lg bg-[#0a0d14] border border-[#1e2433]">
            <div className="text-[11px] text-slate-400 font-mono">Year-Ago ({data.year_ago_period})</div>
            <div className="text-lg font-bold text-slate-300 font-mono mt-0.5">
              {data.ebitda_margin_yago !== null ? `${data.ebitda_margin_yago.toFixed(1)}%` : 'N/A'}
            </div>
            <div className="text-[10px] text-slate-400">EBITDA Margin</div>
          </div>
        </div>

        {/* Comparison Table */}
        <div className="overflow-x-auto border border-[#1e2433] rounded-lg">
          <table className="w-full text-xs text-left">
            <thead className="bg-[#0a0d14] text-slate-400 font-mono uppercase text-[10px] border-b border-[#1e2433]">
              <tr>
                <th className="py-2.5 px-3">Metric (₹ Cr)</th>
                <th className="py-2.5 px-3 text-right">{data.current_period}</th>
                <th className="py-2.5 px-3 text-right">{data.previous_period}</th>
                <th className="py-2.5 px-3 text-right">{data.year_ago_period}</th>
                <th className="py-2.5 px-3 text-right">QoQ %</th>
                <th className="py-2.5 px-3 text-right">YoY %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e2433] font-mono">
              {data.metrics.map((row) => {
                const isQoqPositive = (row.qoq_pct ?? 0) >= 0;
                const isYoyPositive = (row.yoy_pct ?? 0) >= 0;
                return (
                  <tr key={row.metric} className="hover:bg-[#161c28]/50 transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-slate-200">
                      {row.metric}
                    </td>
                    <td className="py-2.5 px-3 text-right text-white font-medium">
                      {row.current_quarter !== null ? row.current_quarter.toLocaleString() : 'N/A'}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-300">
                      {row.previous_quarter !== null ? row.previous_quarter.toLocaleString() : 'N/A'}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-300">
                      {row.year_ago_quarter !== null ? row.year_ago_quarter.toLocaleString() : 'N/A'}
                    </td>
                    <td className={`py-2.5 px-3 text-right font-medium ${isQoqPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {row.qoq_pct !== null ? `${isQoqPositive ? '+' : ''}${row.qoq_pct.toFixed(1)}%` : '—'}
                    </td>
                    <td className={`py-2.5 px-3 text-right font-medium ${isYoyPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {row.yoy_pct !== null ? `${isYoyPositive ? '+' : ''}${row.yoy_pct.toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Safeguards & Disclaimers Footer */}
        <div className="mt-4 p-3 rounded-lg bg-[#0a0d14]/60 border border-[#1e2433] text-[11px] text-slate-400 space-y-1">
          <div className="flex items-center gap-1.5 text-slate-300 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
            <span>Analytical Safeguards Applied</span>
          </div>
          <p>
            • QoQ % = ((Current - Previous) / |Previous|) × 100.
          </p>
          <p>
            • YoY % = ((Current - Year-ago) / |Year-ago|) × 100.
          </p>
          <p>
            • Reporting basis verified consistent ({data.reporting_basis}). No consolidated vs standalone mixing.
          </p>
        </div>
      </div>
    </div>
  );
}
