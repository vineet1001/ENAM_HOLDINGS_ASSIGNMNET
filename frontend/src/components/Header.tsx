'use client';

import React, { useState } from 'react';
import { Search, Database, RefreshCw, AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function Header({
  isDemo = true,
  dataFreshness = 'Market close: 2024-12-31',
  onRefresh,
  isRefreshing = false
}: {
  isDemo?: boolean;
  dataFreshness?: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const router = useRouter();

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    router.push(`/research?ticker=${searchQuery.trim().toUpperCase()}`);
    setSearchQuery('');
  };

  return (
    <header className="h-14 border-b border-[#1e2433] bg-[#0d111a] px-4 flex items-center justify-between gap-4 sticky top-0 z-40">
      {/* Search Input for Any NSE Ticker */}
      <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder="Search any NSE ticker (e.g., RELIANCE, INFY, TRENT)..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-[#161c28] border border-[#1e2433] rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-mono"
        />
      </form>

      {/* Freshness & Status Indicators */}
      <div className="flex items-center gap-3 shrink-0 text-xs">
        {/* Demo Mode Badge */}
        {isDemo && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 font-mono text-[11px]" title="Deterministic simulation data for challenge evaluation">
            <Database className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">DEMO DATASET</span>
            <span className="sm:hidden">DEMO</span>
          </div>
        )}

        {/* Data Freshness Indicator */}
        <div className="hidden lg:flex items-center gap-2 text-slate-400 text-[11px] font-mono border-l border-[#1e2433] pl-3">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
          <span>{dataFreshness}</span>
        </div>

        {/* Refresh Action Button */}
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="p-1.5 rounded-lg border border-[#1e2433] text-slate-400 hover:text-slate-200 hover:bg-[#161c28] transition-all disabled:opacity-50"
            title="Refresh data from server"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-blue-400' : ''}`} />
          </button>
        )}
      </div>
    </header>
  );
}
