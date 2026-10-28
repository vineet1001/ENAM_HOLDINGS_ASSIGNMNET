'use client';

import React, { useState, useEffect } from 'react';
import { Header } from '@/components/Header';
import { api } from '@/lib/api';
import { Company, PortfolioResponse } from '@/types';
import {
  Layers,
  Plus,
  Trash2,
  TrendingUp,
  TrendingDown,
  Search,
  Filter,
  CheckCircle,
  ExternalLink,
  Star,
  Activity
} from 'lucide-react';
import Link from 'next/link';

export default function PortfolioPage() {
  const [portfolio, setPortfolio] = useState<PortfolioResponse | null>(null);
  const [selectedSector, setSelectedSector] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTicker, setNewTicker] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const loadPortfolio = async () => {
    try {
      setLoading(true);
      const res = await api.getPortfolio();
      setPortfolio(res);
    } catch (err) {
      console.error('Failed to load portfolio:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPortfolio();
  }, []);

  const handleAddCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTicker.trim()) return;
    setIsAdding(true);
    try {
      await api.addToPortfolio(newTicker.trim().toUpperCase());
      setNewTicker('');
      setShowAddModal(false);
      await loadPortfolio();
    } catch (err: any) {
      alert(err.message || 'Failed to add ticker to portfolio');
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveCompany = async (ticker: string) => {
    if (!confirm(`Are you sure you want to remove ${ticker} from the portfolio?`)) return;
    try {
      await api.removeFromPortfolio(ticker);
      await loadPortfolio();
    } catch (err: any) {
      alert(err.message || 'Failed to remove ticker');
    }
  };

  // Filter companies
  const filteredCompanies = (portfolio?.companies || []).filter((c) => {
    const matchesSector = selectedSector === 'All' || c.sector === selectedSector;
    const matchesSearch =
      c.ticker.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSector && matchesSearch;
  });

  const sectors = ['All', ...(portfolio?.sectors || [])];

  return (
    <div className="flex-1 flex flex-col bg-[#0a0d14]">
      <Header onRefresh={loadPortfolio} isRefreshing={loading} />

      <main className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto w-full">
        {/* Header Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white tracking-tight">Portfolio & Universe</h1>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/30">
                {portfolio?.total || 0} HOLDINGS
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Active Indian equity coverage universe across sectors, market capitalization, and surveillance rules.
            </p>
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors shadow-sm self-start sm:self-auto font-mono"
          >
            <Plus className="w-4 h-4" />
            Add NSE Ticker
          </button>
        </div>

        {/* Filters and Search */}
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          {/* Sector Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            {sectors.map((sec) => (
              <button
                key={sec}
                onClick={() => setSelectedSector(sec)}
                className={`px-3 py-1 rounded-lg text-xs font-mono transition-colors whitespace-nowrap border ${
                  selectedSector === sec
                    ? 'bg-blue-600/20 text-blue-400 border-blue-500/40 font-semibold'
                    : 'bg-[#111520] text-slate-400 border-[#1e2433] hover:text-slate-200'
                }`}
              >
                {sec}
              </button>
            ))}
          </div>

          {/* Search box */}
          <div className="relative min-w-[220px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filter by name or ticker..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#111520] border border-[#1e2433] rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-400 focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>
        </div>

        {/* Companies Table / Cards */}
        {loading ? (
          <div className="p-8 rounded-xl bg-[#111520] border border-[#1e2433] text-center text-xs text-slate-400 font-mono animate-pulse">
            Loading portfolio holdings...
          </div>
        ) : filteredCompanies.length === 0 ? (
          <div className="p-8 rounded-xl bg-[#111520] border border-[#1e2433] text-center text-xs text-slate-400 font-mono">
            No companies match the selected filter.
          </div>
        ) : (
          <div className="border border-[#1e2433] rounded-xl overflow-hidden bg-[#111520] shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-[#0a0d14] text-slate-400 font-mono uppercase text-[10px] border-b border-[#1e2433]">
                  <tr>
                    <th className="py-3 px-4">Ticker & Company</th>
                    <th className="py-3 px-3">Sector</th>
                    <th className="py-3 px-3 text-right">EOD Close</th>
                    <th className="py-3 px-3 text-right">Daily Change</th>
                    <th className="py-3 px-4">Latest Exchange Filing</th>
                    <th className="py-3 px-3 text-center">Alerts</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1e2433] font-mono">
                  {filteredCompanies.map((c) => {
                    const isGain = (c.daily_change_pct ?? 0) >= 0;
                    return (
                      <tr key={c.ticker} className="hover:bg-[#161c28]/60 transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            {c.is_watchlist && (
                              <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" />
                            )}
                            <div>
                              <Link
                                href={`/research?ticker=${c.ticker}`}
                                className="font-bold text-white hover:text-blue-400 transition-colors"
                              >
                                {c.ticker}
                              </Link>
                              <div className="text-[11px] text-slate-400 truncate max-w-[180px] font-sans">
                                {c.name}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-slate-300">
                          <span className="px-2 py-0.5 rounded bg-[#0a0d14] border border-[#1e2433] text-[10px]">
                            {c.sector}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right text-white font-medium">
                          {c.latest_price !== null ? `₹${c.latest_price.toLocaleString()}` : '—'}
                        </td>
                        <td className={`py-3 px-3 text-right font-medium ${isGain ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {c.daily_change_pct !== null ? `${isGain ? '+' : ''}${c.daily_change_pct.toFixed(2)}%` : '—'}
                        </td>
                        <td className="py-3 px-4 text-slate-300 font-sans max-w-xs truncate">
                          {c.latest_announcement || 'No recent filings'}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {c.alert_count > 0 ? (
                            <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px]">
                              {c.alert_count} active
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Link
                              href={`/research?ticker=${c.ticker}`}
                              className="px-2.5 py-1 rounded bg-blue-600/10 text-blue-400 hover:bg-blue-600/20 border border-blue-500/30 transition-colors text-[11px]"
                            >
                              Research
                            </Link>
                            <button
                              onClick={() => handleRemoveCompany(c.ticker)}
                              className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                              title="Remove from portfolio"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Add Company Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#111520] border border-[#1e2433] rounded-xl max-w-md w-full shadow-2xl p-6">
            <h3 className="text-base font-semibold text-white">Add NSE Company to Portfolio</h3>
            <p className="text-xs text-slate-400 mt-1">
              Supports any listed NSE ticker in the universe (e.g., ADANIPORTS, TRENT, BEL, DMART, ZOMATO).
            </p>

            <form onSubmit={handleAddCompany} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">NSE Symbol</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., ZOMATO"
                  value={newTicker}
                  onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
                  className="w-full bg-[#0a0d14] border border-[#1e2433] rounded-lg px-3 py-2 text-slate-200 uppercase font-mono focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#1e2433]">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 rounded-lg border border-[#1e2433] text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAdding}
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors disabled:opacity-50"
                >
                  {isAdding ? 'Adding...' : 'Add to Portfolio'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
