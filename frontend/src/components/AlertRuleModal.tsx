'use client';

import React, { useState } from 'react';
import { X, Plus, AlertCircle } from 'lucide-react';
import { AlertRule } from '@/types';

const CATEGORIES = [
  'results', 'M&A', 'fund_raise', 'management_change', 'litigation',
  'insider_trading', 'credit_rating', 'dividend', 'bonus_split', 'capex',
  'earnings_call', 'investor_meetings', 'press_release', 'pledging'
];

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
  const [name, setName] = useState(rule?.name || '');
  const [ruleType, setRuleType] = useState<AlertRule['rule_type']>(rule?.rule_type || 'price_movement');
  const [thresholdValue, setThresholdValue] = useState<number>(rule?.threshold_value || 3.0);
  const [thresholdDirection, setThresholdDirection] = useState<'above' | 'below' | 'both'>(rule?.threshold_direction || 'both');
  const [volumeMultiplier, setVolumeMultiplier] = useState<number>(rule?.volume_multiplier || 2.0);
  const [volumeLookback, setVolumeLookback] = useState<number>(rule?.volume_lookback_days || 20);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(rule?.announcement_categories || ['results', 'M&A']);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

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
      alert(err.message || 'Failed to save alert rule');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#111520] border border-[#1e2433] rounded-xl max-w-md w-full shadow-2xl p-6">
        <div className="flex items-center justify-between pb-4 border-b border-[#1e2433]">
          <h3 className="text-base font-semibold text-white">
            {rule ? 'Edit Alert Rule' : 'Create Alert Rule'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-[#1a2030]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4 text-xs">
          {/* Rule Name */}
          <div>
            <label className="block text-slate-300 font-medium mb-1">Rule Name</label>
            <input
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
            <label className="block text-slate-300 font-medium mb-1">Alert Condition Type</label>
            <select
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
                <label className="block text-slate-400 mb-1">Threshold Percentage (%)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="50"
                  value={thresholdValue}
                  onChange={(e) => setThresholdValue(parseFloat(e.target.value))}
                  className="w-full bg-[#111520] border border-[#1e2433] rounded px-2.5 py-1.5 text-slate-200 font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Direction</label>
                <select
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
                <label className="block text-slate-400 mb-1">Volume Multiple (x average)</label>
                <input
                  type="number"
                  step="0.5"
                  min="1.0"
                  max="10"
                  value={volumeMultiplier}
                  onChange={(e) => setVolumeMultiplier(parseFloat(e.target.value))}
                  className="w-full bg-[#111520] border border-[#1e2433] rounded px-2.5 py-1.5 text-slate-200 font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Lookback Window (trading days)</label>
                <input
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
              <label className="block text-slate-400 mb-2">Subscribed Announcement Categories</label>
              <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                {CATEGORIES.map((cat) => {
                  const isSelected = selectedCategories.includes(cat);
                  return (
                    <button
                      type="button"
                      key={cat}
                      onClick={() => toggleCategory(cat)}
                      className={`px-2 py-1 rounded text-[11px] font-mono transition-colors border ${
                        isSelected
                          ? 'bg-blue-600/20 text-blue-300 border-blue-500/40'
                          : 'bg-[#111520] text-slate-400 border-[#1e2433] hover:text-slate-200'
                      }`}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="pt-3 border-t border-[#1e2433] flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg border border-[#1e2433] text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : 'Save Rule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

