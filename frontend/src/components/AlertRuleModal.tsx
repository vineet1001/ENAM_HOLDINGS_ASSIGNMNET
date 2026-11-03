'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { AlertRule, LiveCompany } from '@/types';
import { api } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { Sheet } from '@/components/Sheet';
import { changeTone, signedPct } from '@/lib/ui';

const CATEGORIES = [
  'results', 'M&A', 'fund_raise', 'management_change', 'litigation',
  'insider_trading', 'credit_rating', 'dividend', 'bonus_split', 'capex',
  'earnings_call', 'investor_meetings', 'press_release', 'pledging'
];

interface VolumeSnapshot {
  ticker: string;
  multiple: number;
}

interface VolumeHistory {
  ticker: string;
  volumes: number[];
}

export function AlertRuleModal({
  rule,
  isOpen,
  onClose,
  onSave
}: {
  rule?: AlertRule | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (ruleData: Partial<AlertRule>) => Promise<void>;
}) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [ruleType, setRuleType] = useState<AlertRule['rule_type']>('price_movement');
  const [thresholdValue, setThresholdValue] = useState<number>(3.0);
  const [thresholdDirection, setThresholdDirection] = useState<'above' | 'below' | 'both'>('both');
  const [volumeMultiplier, setVolumeMultiplier] = useState<number>(2.0);
  const [volumeLookback, setVolumeLookback] = useState<number>(20);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(['results', 'M&A']);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Live preview inputs
  const [holdings, setHoldings] = useState<LiveCompany[]>([]);
  const [volumeHistory, setVolumeHistory] = useState<VolumeHistory[] | null>(null);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});

  // This component stays mounted, so the form has to be re-seeded each time it opens.
  useEffect(() => {
    if (!isOpen) return;
    setName(rule?.name || '');
    setRuleType(rule?.rule_type || 'price_movement');
    setThresholdValue(rule?.threshold_value || 3.0);
    setThresholdDirection(rule?.threshold_direction || 'both');
    setVolumeMultiplier(rule?.volume_multiplier || 2.0);
    setVolumeLookback(rule?.volume_lookback_days || 20);
    setSelectedCategories(rule?.announcement_categories || ['results', 'M&A']);
  }, [isOpen, rule]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    api.getLivePortfolioHistory('1M').then((res) => {
      if (!cancelled) setHoldings(res.companies);
    }).catch(() => {});
    api.getLiveFilings().then((res) => {
      if (cancelled) return;
      const counts: Record<string, number> = {};
      res.filings.forEach((f) => {
        counts[f.category] = (counts[f.category] || 0) + 1;
      });
      setCategoryCounts(counts);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // Price history is only worth fetching once a volume rule is being edited.
  useEffect(() => {
    if (!isOpen || ruleType !== 'unusual_volume' || holdings.length === 0 || volumeHistory) return;
    let cancelled = false;
    Promise.all(
      holdings.map((c) =>
        api.getLiveCompanyPrices(c.ticker, 65)
          .then((res) => ({ ticker: c.ticker, volumes: res.prices.map((p) => p.volume) }))
          .catch(() => null)
      )
    ).then((rows) => {
      if (!cancelled) setVolumeHistory(rows.filter((r): r is VolumeHistory => r !== null));
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, ruleType, holdings, volumeHistory]);

  // Mirrors evaluate_volume_alerts: the latest session against the lookback sessions before it.
  const volumes = useMemo<VolumeSnapshot[] | null>(() => {
    if (!volumeHistory) return null;
    return volumeHistory.flatMap(({ ticker, volumes: series }) => {
      if (series.length < 2) return [];
      const prior = series.slice(0, -1).filter((v) => v > 0).slice(-volumeLookback);
      const average = prior.reduce((sum, v) => sum + v, 0) / (prior.length || 1);
      return average ? [{ ticker, multiple: series[series.length - 1] / average }] : [];
    });
  }, [volumeHistory, volumeLookback]);

  const priceMatches = useMemo(() => {
    return holdings
      .filter((c) => {
        const change = c.daily_change_pct;
        if (change === null) return false;
        if (thresholdDirection === 'above') return change >= thresholdValue;
        if (thresholdDirection === 'below') return change <= -thresholdValue;
        return Math.abs(change) >= thresholdValue;
      })
      .sort((a, b) => Math.abs(b.daily_change_pct ?? 0) - Math.abs(a.daily_change_pct ?? 0));
  }, [holdings, thresholdValue, thresholdDirection]);

  const closestMove = useMemo(() => {
    return holdings.reduce<LiveCompany | null>((best, c) => {
      if (c.daily_change_pct === null) return best;
      return !best || Math.abs(c.daily_change_pct) > Math.abs(best.daily_change_pct ?? 0) ? c : best;
    }, null);
  }, [holdings]);

  const volumeMatches = useMemo(() => {
    return (volumes || []).filter((v) => v.multiple >= volumeMultiplier).sort((a, b) => b.multiple - a.multiple);
  }, [volumes, volumeMultiplier]);

  const peakVolume = useMemo(() => {
    return (volumes || []).reduce<VolumeSnapshot | null>((best, v) => (!best || v.multiple > best.multiple ? v : best), null);
  }, [volumes]);

  const matchingFilings = selectedCategories.reduce((sum, cat) => sum + (categoryCounts[cat] || 0), 0);

  const toggleCategory = (cat: string) => {
    if (selectedCategories.includes(cat)) {
      setSelectedCategories(selectedCategories.filter(c => c !== cat));
    } else {
      setSelectedCategories([...selectedCategories, cat]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSave({
        name: name || `${ruleType} alert`,
        rule_type: ruleType,
        threshold_value: ruleType === 'price_movement' ? thresholdValue : undefined,
        threshold_direction: ruleType === 'price_movement' ? thresholdDirection : undefined,
        volume_multiplier: ruleType === 'unusual_volume' ? volumeMultiplier : undefined,
        volume_lookback_days: ruleType === 'unusual_volume' ? volumeLookback : undefined,
        announcement_categories: ruleType === 'material_announcement' ? selectedCategories : undefined,
        is_enabled: true
      });
      onClose();
    } catch (err: any) {
      toast({ message: err.message || 'Failed to save alert rule', tone: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={isOpen} onClose={onClose} label={rule ? 'Edit alert rule' : 'Create alert rule'} maxWidth="md:max-w-md">
      <div className="px-4 pb-6 md:p-6">
        <div className="flex items-center justify-between pb-4 border-b border-[#1e2433]">
          <h3 className="text-base font-semibold text-white">
            {rule ? 'Edit Alert Rule' : 'Create Alert Rule'}
          </h3>
          <button onClick={onClose} aria-label="Close rule editor" className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-[#1a2030]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4 text-xs">
          {/* Rule Name */}
          <div>
            <label htmlFor="rule-name" className="block text-slate-300 font-medium mb-1">Rule Name</label>
            <input
              id="rule-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Large Move Watch (>3%)"
              className="w-full bg-[#0a0d14] border border-[#1e2433] rounded-lg px-3 py-2 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Rule Type */}
          <div>
            <label htmlFor="rule-type" className="block text-slate-300 font-medium mb-1">Alert Condition Type</label>
            <select
              id="rule-type"
              value={ruleType}
              onChange={(e) => setRuleType(e.target.value as any)}
              className="w-full bg-[#0a0d14] border border-[#1e2433] rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
            >
              <option value="price_movement">Type A: Daily Price Movement (%)</option>
              <option value="unusual_volume">Type B: Unusual Trading Volume Spike (x Average)</option>
              <option value="material_announcement">Type C: Material Announcement Category</option>
            </select>
          </div>

          {/* Type A Fields */}
          {ruleType === 'price_movement' && (
            <div className="space-y-3 p-3 rounded-lg bg-[#0a0d14] border border-[#1e2433]">
              <div>
                <label htmlFor="rule-threshold" className="flex justify-between text-slate-400 mb-1">
                  <span>Threshold Percentage</span>
                  <span className="font-mono font-semibold text-white">±{thresholdValue.toFixed(1)}%</span>
                </label>
                <input
                  id="rule-threshold"
                  type="range"
                  step="0.5"
                  min="0.5"
                  max="10"
                  value={thresholdValue}
                  onChange={(e) => setThresholdValue(parseFloat(e.target.value))}
                  className="finn-range"
                />
              </div>
              <div>
                <label htmlFor="rule-direction" className="block text-slate-400 mb-1">Direction</label>
                <select
                  id="rule-direction"
                  value={thresholdDirection}
                  onChange={(e) => setThresholdDirection(e.target.value as any)}
                  className="w-full bg-[#111520] border border-[#1e2433] rounded px-2.5 py-1.5 text-slate-200"
                >
                  <option value="both">Both (+ or -)</option>
                  <option value="above">Positive Only (+)</option>
                  <option value="below">Negative Only (-)</option>
                </select>
              </div>
            </div>
          )}

          {/* Type B Fields */}
          {ruleType === 'unusual_volume' && (
            <div className="space-y-3 p-3 rounded-lg bg-[#0a0d14] border border-[#1e2433]">
              <div>
                <label htmlFor="rule-multiple" className="flex justify-between text-slate-400 mb-1">
                  <span>Volume Multiple</span>
                  <span className="font-mono font-semibold text-white">{volumeMultiplier.toFixed(1)}× average</span>
                </label>
                <input
                  id="rule-multiple"
                  type="range"
                  step="0.1"
                  min="1"
                  max="5"
                  value={volumeMultiplier}
                  onChange={(e) => setVolumeMultiplier(parseFloat(e.target.value))}
                  className="finn-range"
                />
              </div>
              <div>
                <label htmlFor="rule-lookback" className="block text-slate-400 mb-1">Lookback Window (trading days)</label>
                <input
                  id="rule-lookback"
                  type="number"
                  min="5"
                  max="60"
                  value={volumeLookback}
                  onChange={(e) => setVolumeLookback(parseInt(e.target.value))}
                  className="w-full bg-[#111520] border border-[#1e2433] rounded px-2.5 py-1.5 text-slate-200 font-mono"
                />
              </div>
            </div>
          )}

          {/* Type C Fields */}
          {ruleType === 'material_announcement' && (
            <div className="p-3 rounded-lg bg-[#0a0d14] border border-[#1e2433]">
              <span className="block text-slate-400 mb-2">Subscribed Announcement Categories</span>
              <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                {CATEGORIES.map((cat) => {
                  const isSelected = selectedCategories.includes(cat);
                  return (
                    <button
                      type="button"
                      key={cat}
                      onClick={() => toggleCategory(cat)}
                      aria-pressed={isSelected}
                      className={`px-2 py-1 rounded text-[11px] font-mono transition-colors border ${
                        isSelected
                          ? 'bg-blue-600/20 text-blue-300 border-blue-500/40'
                          : 'bg-[#111520] text-slate-400 border-[#1e2433] hover:text-slate-200'
                      }`}
                    >
                      {cat} <span className="opacity-70">{categoryCounts[cat] || 0}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* What-if preview: see the consequence of a threshold before saving it */}
          <div className="p-3 rounded-lg border border-blue-500/30 bg-blue-950/20 space-y-2" aria-live="polite">
            <div className="text-[10px] font-mono font-semibold text-blue-300 uppercase tracking-wider">
              Preview against live data
            </div>

            {ruleType === 'price_movement' && (
              <>
                <p className="text-slate-200">
                  Would fire for <span className="font-mono font-bold text-white">{priceMatches.length}</span> of {holdings.length} holdings.
                </p>
                {priceMatches.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 font-mono text-[11px]">
                    {priceMatches.slice(0, 12).map((c) => (
                      <span key={c.ticker} className="px-1.5 py-0.5 rounded bg-[#0a0d14] border border-[#1e2433] text-slate-200">
                        {c.ticker} <span className={changeTone(c.daily_change_pct)}>{signedPct(c.daily_change_pct, 1)}</span>
                      </span>
                    ))}
                  </div>
                ) : closestMove && (
                  <p className="text-[11px] text-slate-400">
                    Biggest move is {closestMove.ticker} at <span className={`font-mono ${changeTone(closestMove.daily_change_pct)}`}>{signedPct(closestMove.daily_change_pct)}</span>.
                  </p>
                )}
              </>
            )}

            {ruleType === 'unusual_volume' && (
              volumes === null ? (
                <p className="text-slate-400 font-mono animate-pulse">Checking volume history...</p>
              ) : (
                <>
                  <p className="text-slate-200">
                    Would fire for <span className="font-mono font-bold text-white">{volumeMatches.length}</span> of {volumes.length} holdings.
                  </p>
                  {volumeMatches.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 font-mono text-[11px]">
                      {volumeMatches.slice(0, 12).map((v) => (
                        <span key={v.ticker} className="px-1.5 py-0.5 rounded bg-[#0a0d14] border border-[#1e2433] text-slate-200">
                          {v.ticker} {v.multiple.toFixed(1)}×
                        </span>
                      ))}
                    </div>
                  ) : peakVolume && (
                    <p className="text-[11px] text-slate-400">
                      Highest is {peakVolume.ticker} at <span className="font-mono">{peakVolume.multiple.toFixed(1)}×</span> its average.
                    </p>
                  )}
                </>
              )
            )}

            {ruleType === 'material_announcement' && (
              <p className="text-slate-200">
                Matches <span className="font-mono font-bold text-white">{matchingFilings}</span> real filings from the last 30 days across {selectedCategories.length} categories.
              </p>
            )}
          </div>

          <div className="pt-3 border-t border-[#1e2433] flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-lg border border-[#1e2433] text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : 'Save Rule'}
            </button>
          </div>
        </form>
      </div>
    </Sheet>
  );
}
