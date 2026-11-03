'use client';

import React from 'react';
import { Search, Database, RefreshCw, Menu } from 'lucide-react';
import { OPEN_MENU_EVENT, OPEN_PALETTE_EVENT } from '@/lib/ui';
import { ThemeButton } from '@/components/ThemeToggle';

export function Header({
  isDemo = false,
  dataFreshness = '',
  onRefresh,
  isRefreshing = false
}: {
  isDemo?: boolean;
  dataFreshness?: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}) {
  return (
    <header className="h-14 border-b border-[#1e2433] bg-[#0d111a] px-4 flex items-center justify-between gap-3 sticky top-0 z-40">
      <button
        onClick={() => window.dispatchEvent(new Event(OPEN_MENU_EVENT))}
        aria-label="Open menu"
        className="md:hidden -ml-1 p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-[#161c28] shrink-0"
      >
        <Menu className="w-5 h-5" />
      </button>
      {/* Opens the command palette: company search plus every page, including those off the mobile nav */}
      <button
        onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))}
        className="flex-1 min-w-0 max-w-md flex items-center gap-2.5 bg-[#161c28] border border-[#1e2433] hover:border-[#2a3449] rounded-lg px-3 py-2 text-xs text-slate-400 font-mono transition-colors text-left"
      >
        <Search className="w-4 h-4 shrink-0" />
        <span className="flex-1 truncate">Search companies and pages...</span>
        <kbd className="hidden md:inline text-[10px] border border-[#2a3449] rounded px-1.5 py-0.5 shrink-0">Ctrl K</kbd>
      </button>

      {/* Freshness & Status Indicators */}
      <div className="flex items-center gap-3 shrink-0 text-xs">
        {/* Demo Mode Badge */}
        {isDemo && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 font-mono text-[11px]" title="Sample data, not real filings">
            <Database className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">DEMO DATASET</span>
            <span className="sm:hidden">DEMO</span>
          </div>
        )}

        {/* Data Freshness Indicator */}
        {dataFreshness && (
          <div className="hidden lg:flex items-center gap-2 text-slate-400 text-[11px] font-mono border-l border-[#1e2433] pl-3">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            <span>{dataFreshness}</span>
          </div>
        )}

        <ThemeButton />

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

