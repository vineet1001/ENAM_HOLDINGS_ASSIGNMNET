'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Bell, BellOff, CheckCircle2, Plus, Send, Trash2, XCircle } from 'lucide-react';
import { Header } from '@/components/Header';
import { api } from '@/lib/api';
import { AlertPreferences, AlertPreviewCompany, NotificationStatus, StockOverride } from '@/types';
import { useToast } from '@/components/Toast';
import {
  ALERTS_CHANGED_EVENT,
  BROWSER_ALERTS_KEY,
  DIGEST_FOCUS_KEY,
  DIGEST_WINDOW_KEY,
  categoryLabel,
  readStored,
  removeStored,
  writeStored
} from '@/lib/ui';

const PRESETS = [
  { id: 'conservative', label: 'Conservative', note: 'Only the big ones', price: 5, volume: 3, categories: ['results', 'M&A', 'management_change', 'fund_raise', 'litigation'] },
  { id: 'balanced', label: 'Balanced', note: 'The brief’s defaults', price: 3, volume: 2, categories: ['results', 'M&A', 'management_change', 'fund_raise', 'litigation', 'credit_rating', 'pledging', 'capex'] },
  { id: 'sensitive', label: 'Sensitive', note: 'Hear about more', price: 1.5, volume: 1.5, categories: ['results', 'M&A', 'management_change', 'fund_raise', 'litigation', 'credit_rating', 'pledging', 'capex', 'insider_trading', 'dividend', 'bonus_split', 'earnings_call'] },
];
const WINDOW_LABELS: Record<number, string> = { 24: '24 hours', 72: '3 days', 168: '7 days', 720: '30 days' };
const SYNC_OPTIONS = [5, 15, 30, 60, 240];
const LOOKBACK_OPTIONS = [1, 3, 7, 14, 30];
const CARD = 'p-4 rounded-xl bg-[#111520] border border-[#1e2433] space-y-3';
const HEADING = 'text-xs font-bold text-white uppercase tracking-wider font-mono';
const SELECT = 'bg-[#0a0d14] border border-[#1e2433] rounded-lg px-2.5 py-2 text-base md:text-xs text-slate-200 font-mono focus:outline-none focus:border-blue-500';

// A value saved earlier stays selectable even if it isn't one of the usual choices.
function withCurrent(options: number[], current: number): number[] {
  return options.includes(current) ? options : [...options, current].sort((a, b) => a - b);
}

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value) => b.includes(value));
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${checked ? 'bg-blue-600' : 'bg-[#2a3449]'}`}
    >
      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${checked ? 'left-5' : 'left-1'}`} />
    </button>
  );
}

// A slider for feel and a box for exact values, kept in step and held inside what the server accepts.
function ThresholdInput({
  id,
  label,
  value,
  min,
  max,
  step,
  suffix,
  disabled,
  onChange
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  disabled?: boolean;
  onChange: (next: number) => void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);

  const commit = () => {
    const parsed = parseFloat(text);
    if (Number.isNaN(parsed)) {
      setText(String(value));
      return;
    }
    const held = Math.min(max, Math.max(min, parsed));
    setText(String(held));
    onChange(held);
  };

  return (
    <div className={disabled ? 'opacity-40' : ''}>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-xs text-slate-300">{label}</label>
        <span className="flex items-center gap-1 font-mono text-xs text-white">
          <input
            id={id}
            type="number"
            inputMode="decimal"
            value={text}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
              }
            }}
            className="w-16 bg-[#0a0d14] border border-[#1e2433] rounded-lg px-2 py-1.5 text-right text-base md:text-xs focus:outline-none focus:border-blue-500"
          />
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={Math.min(max, min + (max - min) / 2)}
        step={step}
        value={Math.min(value, min + (max - min) / 2)}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        aria-label={`${label} slider`}
        className="finn-range mt-2"
      />
    </div>
  );
}

// How often a threshold would have fired recently, recounted as the value moves.
function Preview({
  counts,
  sessions,
  loading,
  error
}: {
  counts: Array<{ ticker: string; count: number; latest: boolean }>;
  sessions: number;
  loading: boolean;
  error: string | null;
}) {
  if (error) return <p className="text-[11px] font-mono text-amber-400">Preview unavailable: {error}</p>;
  if (loading) return <div className="h-9 rounded-lg bg-[#0a0d14] animate-pulse" aria-label="Loading preview" />;
  const total = counts.reduce((sum, c) => sum + c.count, 0);
  const firing = counts.filter((c) => c.count > 0).sort((a, b) => b.count - a.count);
  const latest = counts.filter((c) => c.latest);
  return (
    <div className="p-3 rounded-lg bg-[#0a0d14] border border-[#1e2433] space-y-1.5 text-[11px] font-mono" aria-live="polite">
      <p className="text-slate-200">
        <span className="font-bold text-white">{total}</span> alert{total === 1 ? '' : 's'} in the last {sessions} sessions on your portfolio
        {counts.length > 0 ? `, about ${(total / sessions).toFixed(1)} a day` : ''}
      </p>
      {latest.length > 0 && <p className="text-amber-300">Latest session: {latest.map((c) => c.ticker).join(', ')}</p>}
      {firing.length > 0 && (
        <p className="text-slate-500 truncate">Most often: {firing.slice(0, 5).map((c) => `${c.ticker} ${c.count}`).join(' · ')}</p>
      )}
    </div>
  );
}

function CategoryChips({
  categories,
  selected,
  onToggle,
  label
}: {
  categories: string[];
  selected: string[];
  onToggle: (category: string) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {categories.map((category) => {
        const isOn = selected.includes(category);
        return (
          <button
            key={category}
            type="button"
            onClick={() => onToggle(category)}
            aria-pressed={isOn}
            className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-mono transition-colors ${
              isOn ? 'bg-blue-600/20 text-blue-300 border-blue-500/40' : 'bg-[#0a0d14] text-slate-400 border-[#1e2433] hover:text-slate-200'
            }`}
          >
            {categoryLabel(category)}
          </button>
        );
      })}
    </div>
  );
}

function TelegramSettings() {
  const toast = useToast();
  const [status, setStatus] = useState<NotificationStatus | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [busy, setBusy] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    api.getNotifications().then(setStatus).catch((err) => setBlocked(err.message));
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setTestResult(null);
    try {
      setStatus(await api.saveNotifications({ bot_token: token.trim() || undefined, chat_id: chatId.trim() || undefined }));
      setToken('');
      setChatId('');
      toast({ message: 'Telegram saved' });
    } catch (err: any) {
      toast({ message: err.message || 'Could not save', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    setTestResult(null);
    try {
      setTestResult(await api.testNotifications());
    } catch (err: any) {
      setTestResult({ ok: false, message: err.message || 'The test could not run' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setTestResult(null);
    try {
      setStatus(await api.clearNotifications());
      toast({ message: 'Telegram removed' });
    } catch (err: any) {
      toast({ message: err.message || 'Could not remove', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  if (blocked) return <p className="text-[11px] font-mono text-slate-400 leading-relaxed">Telegram can only be set up on the computer running FINN.</p>;

  return (
    <form onSubmit={save} className="space-y-2.5 text-xs">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium text-slate-200">Telegram</span>
        <span className={`text-[10px] font-mono ${status?.configured ? 'text-emerald-400' : 'text-slate-500'}`}>
          {status?.configured ? `Connected ${status.token_hint}, chat ${status.chat_id}` : 'Not connected'}
        </span>
      </div>
      <p className="text-[11px] text-slate-400 leading-relaxed">
        Sends each check&apos;s new alerts to your phone, even when FINN isn&apos;t open. Create a bot with{' '}
        <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">BotFather</a>,
        send it a message, then get your chat id from{' '}
        <a href="https://t.me/userinfobot" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">userinfobot</a>.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label htmlFor="telegram-token" className="block text-[11px] text-slate-400 mb-1">Bot token</label>
          <input
            id="telegram-token"
            type="password"
            autoComplete="new-password"
            spellCheck={false}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={status?.token_hint ? 'Leave blank to keep' : '123456:ABC...'}
            className="w-full bg-[#0a0d14] border border-[#1e2433] rounded-lg px-3 py-2 text-base md:text-xs text-slate-200 font-mono placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label htmlFor="telegram-chat" className="block text-[11px] text-slate-400 mb-1">Chat id</label>
          <input
            id="telegram-chat"
            type="text"
            spellCheck={false}
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            placeholder={status?.chat_id || '123456789'}
            className="w-full bg-[#0a0d14] border border-[#1e2433] rounded-lg px-3 py-2 text-base md:text-xs text-slate-200 font-mono placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button type="submit" disabled={busy || (!token.trim() && !chatId.trim())} className="px-3 py-2 rounded-lg border border-[#2a3449] text-slate-200 hover:text-white disabled:opacity-40 font-mono">
          Save
        </button>
        <button type="button" onClick={test} disabled={busy || !status?.configured} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#2a3449] text-slate-200 hover:text-white disabled:opacity-40 font-mono">
          <Send className="w-3.5 h-3.5" />
          Send a test
        </button>
        {status?.configured && (
          <button type="button" onClick={remove} disabled={busy} className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-slate-400 hover:text-rose-400 disabled:opacity-40 font-mono">
            <Trash2 className="w-3.5 h-3.5" />
            Remove
          </button>
        )}
      </div>
      {testResult && (
        <p role="status" className={`flex items-start gap-1.5 text-[11px] font-mono ${testResult.ok ? 'text-emerald-400' : 'text-rose-300'}`}>
          {testResult.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-px" /> : <XCircle className="w-3.5 h-3.5 shrink-0 mt-px" />}
          {testResult.message}
        </p>
      )}
    </form>
  );
}

function BrowserAlerts() {
  const [enabled, setEnabled] = useState(false);
  const [permission, setPermission] = useState<string>('default');
  const supported = typeof window !== 'undefined' && 'Notification' in window;

  useEffect(() => {
    if (!supported) return;
    setPermission(Notification.permission);
    setEnabled(readStored(BROWSER_ALERTS_KEY, false) && Notification.permission === 'granted');
  }, [supported]);

  const toggle = async (next: boolean) => {
    if (next && Notification.permission !== 'granted') {
      const answer = await Notification.requestPermission();
      setPermission(answer);
      if (answer !== 'granted') return;
    }
    setEnabled(next);
    writeStored(BROWSER_ALERTS_KEY, next);
  };

  return (
    <div className="flex items-start justify-between gap-3 text-xs">
      <div>
        <span className="font-medium text-slate-200 flex items-center gap-1.5">
          {enabled ? <Bell className="w-3.5 h-3.5 text-blue-400" /> : <BellOff className="w-3.5 h-3.5 text-slate-500" />}
          Browser notifications
        </span>
        <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
          {!supported
            ? "This browser doesn't support them."
            : permission === 'denied'
              ? 'Blocked in this browser. Allow notifications for this site in its settings first.'
              : 'Only while FINN is open in a tab on this device.'}
        </p>
      </div>
      <Toggle checked={enabled} onChange={toggle} label="Browser notifications" />
    </div>
  );
}

export default function AlertSettingsPage() {
  const toast = useToast();
  const [saved, setSaved] = useState<AlertPreferences | null>(null);
  const [draft, setDraft] = useState<AlertPreferences | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<AlertPreviewCompany[] | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [newOverride, setNewOverride] = useState('');

  const load = useCallback(async () => {
    try {
      const prefs = await api.getAlertPreferences();
      setSaved(prefs);
      setDraft(prefs);
      setLoadError(null);
    } catch (err: any) {
      setLoadError(err.message || 'Could not load your settings');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const lookback = draft?.volume_lookback;
  useEffect(() => {
    if (!lookback) return;
    let cancelled = false;
    setPreviewError(null);
    const timer = setTimeout(() => {
      api.getAlertPreview(lookback)
        .then((res) => {
          if (!cancelled) setPreview(res.companies);
        })
        .catch((err) => {
          if (!cancelled) setPreviewError(err.message || 'Prices could not be reached');
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [lookback]);

  const update = (patch: Partial<AlertPreferences>) => setDraft((current) => (current ? { ...current, ...patch } : current));

  const sessions = preview?.reduce((longest, c) => Math.max(longest, c.changes.length), 0) || 30;
  const overrideFor = useCallback(
    (ticker: string) => draft?.overrides.find((o) => o.ticker === ticker),
    [draft]
  );

  const priceCounts = useMemo(() => {
    if (!preview || !draft) return [];
    const hits = (move: number, limit: number) => {
      if (draft.price_direction === 'above') return move >= limit;
      if (draft.price_direction === 'below') return move <= -limit;
      return Math.abs(move) >= limit;
    };
    return preview.map((company) => {
      const limit = overrideFor(company.ticker)?.price_threshold ?? draft.price_threshold;
      return {
        ticker: company.ticker,
        count: draft.price_enabled ? company.changes.filter((move) => hits(move, limit)).length : 0,
        latest: draft.price_enabled && company.changes.length > 0 && hits(company.changes[company.changes.length - 1], limit),
      };
    });
  }, [preview, draft, overrideFor]);

  const volumeCounts = useMemo(() => {
    if (!preview || !draft) return [];
    return preview.map((company) => {
      const limit = overrideFor(company.ticker)?.volume_multiple ?? draft.volume_multiple;
      const values = company.volume_multiples;
      return {
        ticker: company.ticker,
        count: draft.volume_enabled ? values.filter((v) => v >= limit).length : 0,
        latest: draft.volume_enabled && values.length > 0 && values[values.length - 1] >= limit,
      };
    });
  }, [preview, draft, overrideFor]);

  const isDirty = useMemo(() => {
    if (!draft || !saved) return false;
    const editable = ({ can_edit_notifications, ai_enabled, limits, all_categories, digest_windows, other_rules, ...rest }: AlertPreferences) => rest;
    return JSON.stringify(editable({ ...draft, categories: [...draft.categories].sort() })) !== JSON.stringify(editable({ ...saved, categories: [...saved.categories].sort() }));
  }, [draft, saved]);

  useEffect(() => {
    if (!isDirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isDirty]);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const { new_alerts: newAlerts } = await api.saveAlertPreferences(draft);
      // The server's defaults now apply, in place of anything picked earlier on the briefing page.
      removeStored(DIGEST_WINDOW_KEY);
      removeStored(DIGEST_FOCUS_KEY);
      await load();
      window.dispatchEvent(new Event(ALERTS_CHANGED_EVENT));
      toast({ message: newAlerts > 0 ? `Saved. ${newAlerts} new alert${newAlerts === 1 ? '' : 's'} at these thresholds` : 'Saved. No new alerts at these thresholds' });
    } catch (err: any) {
      toast({ message: err.message || 'Could not save', tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (loadError) {
    return (
      <div className="flex-1 flex flex-col bg-[#0a0d14]">
        <Header />
        <main className="p-4 md:p-6 max-w-3xl mx-auto w-full">
          <p className="p-4 rounded-xl bg-[#111520] border border-rose-500/30 text-xs font-mono text-rose-300">{loadError}</p>
        </main>
      </div>
    );
  }
  if (!draft) {
    return (
      <div className="flex-1 flex flex-col bg-[#0a0d14]">
        <Header />
        <main className="p-4 md:p-6 max-w-3xl mx-auto w-full space-y-3" aria-label="Loading alert settings">
          <div className="h-24 rounded-xl bg-[#111520] border border-[#1e2433] animate-pulse" />
          <div className="h-64 rounded-xl bg-[#111520] border border-[#1e2433] animate-pulse" />
        </main>
      </div>
    );
  }

  const activePreset = PRESETS.find(
    (p) => draft.price_threshold === p.price && draft.volume_multiple === p.volume && sameSet(draft.categories, p.categories)
  )?.id;
  const limits = draft.limits;
  const toggleIn = (list: string[], value: string) => (list.includes(value) ? list.filter((c) => c !== value) : [...list, value]);
  const overrideChoices = (preview || []).filter((company) => !overrideFor(company.ticker));

  const changeOverride = (ticker: string, patch: Partial<StockOverride>) => {
    update({ overrides: draft.overrides.map((o) => (o.ticker === ticker ? { ...o, ...patch } : o)) });
  };

  const addOverride = () => {
    const company = preview?.find((c) => c.ticker === newOverride);
    if (!company) return;
    update({
      overrides: [...draft.overrides, { ticker: company.ticker, name: company.name, price_threshold: draft.price_threshold, volume_multiple: draft.volume_multiple }],
    });
    setNewOverride('');
  };

  return (
    <div className="flex-1 flex flex-col bg-[#0a0d14]">
      <Header />

      <main className="p-4 md:p-6 space-y-4 max-w-3xl mx-auto w-full pb-32 md:pb-24">
        <div>
          <Link href="/alerts" className="inline-flex items-center gap-1.5 text-[11px] font-mono text-slate-400 hover:text-slate-200 py-1">
            <ArrowLeft className="w-3.5 h-3.5" />
            Alerts
          </Link>
          <h1 className="text-xl font-bold text-white tracking-tight">Alert Settings</h1>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">Decide what counts as unusual for you. Try a value and see how often it would have fired before you save it.</p>
        </div>

        <div role="group" aria-label="Presets" className="grid grid-cols-3 gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => update({ price_threshold: preset.price, volume_multiple: preset.volume, categories: preset.categories, price_enabled: true, volume_enabled: true })}
              aria-pressed={activePreset === preset.id}
              className={`p-3 rounded-xl border text-left transition-colors ${
                activePreset === preset.id ? 'bg-blue-600/15 border-blue-500/50' : 'bg-[#111520] border-[#1e2433] hover:border-slate-600'
              }`}
            >
              <span className={`block text-xs font-semibold ${activePreset === preset.id ? 'text-blue-300' : 'text-slate-100'}`}>{preset.label}</span>
              <span className="block text-[10px] text-slate-400 mt-0.5 leading-snug">{preset.note}</span>
              <span className="block text-[10px] font-mono text-slate-500 mt-1">±{preset.price}% · {preset.volume}x</span>
            </button>
          ))}
        </div>

        {draft.other_rules.length > 0 && (
          <p className="p-3 rounded-lg bg-[#0a0d14] border border-amber-500/30 text-[11px] text-amber-300 leading-relaxed">
            Other rules are also running: {draft.other_rules.join(', ')}. They fire by their own limits.{' '}
            <Link href="/alerts" className="underline">Manage them in Alerts</Link>.
          </p>
        )}

        <section aria-labelledby="price-heading" className={CARD}>
          <div className="flex items-center justify-between gap-3">
            <h2 id="price-heading" className={HEADING}>Price moves</h2>
            <Toggle checked={draft.price_enabled} onChange={(next) => update({ price_enabled: next })} label="Price move alerts" />
          </div>
          <ThresholdInput
            id="price-threshold"
            label="Alert when a stock moves by"
            value={draft.price_threshold}
            min={limits.price_threshold[0]}
            max={limits.price_threshold[1]}
            step={0.5}
            suffix="%"
            disabled={!draft.price_enabled}
            onChange={(next) => update({ price_threshold: next })}
          />
          <div role="group" aria-label="Price direction" className={`flex items-center gap-1 bg-[#0a0d14] border border-[#1e2433] rounded-lg p-1 text-xs font-mono w-fit ${draft.price_enabled ? '' : 'opacity-40'}`}>
            {[['both', 'Up or down'], ['above', 'Up only'], ['below', 'Down only']].map(([value, label]) => (
              <button
                key={value}
                type="button"
                disabled={!draft.price_enabled}
                onClick={() => update({ price_direction: value as AlertPreferences['price_direction'] })}
                aria-pressed={draft.price_direction === value}
                className={`px-2.5 py-1.5 rounded transition-colors ${draft.price_direction === value ? 'bg-blue-600 text-white font-medium' : 'text-slate-400 hover:text-slate-200'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <Preview counts={priceCounts} sessions={sessions} loading={!preview && !previewError} error={previewError} />
        </section>

        <section aria-labelledby="volume-heading" className={CARD}>
          <div className="flex items-center justify-between gap-3">
            <h2 id="volume-heading" className={HEADING}>Unusual volume</h2>
            <Toggle checked={draft.volume_enabled} onChange={(next) => update({ volume_enabled: next })} label="Volume alerts" />
          </div>
          <ThresholdInput
            id="volume-multiple"
            label="Alert when volume reaches"
            value={draft.volume_multiple}
            min={limits.volume_multiple[0]}
            max={limits.volume_multiple[1]}
            step={0.1}
            suffix="× average"
            disabled={!draft.volume_enabled}
            onChange={(next) => update({ volume_multiple: next })}
          />
          <div className={`flex items-center justify-between gap-3 text-xs ${draft.volume_enabled ? '' : 'opacity-40'}`}>
            <label htmlFor="volume-lookback" className="text-slate-300">Average over the last</label>
            <select
              id="volume-lookback"
              disabled={!draft.volume_enabled}
              value={draft.volume_lookback}
              onChange={(e) => update({ volume_lookback: Number(e.target.value) })}
              className={SELECT}
            >
              {withCurrent([10, 20, 30, 60, 90], draft.volume_lookback).map((days) => (
                <option key={days} value={days}>{days} sessions</option>
              ))}
            </select>
          </div>
          <Preview counts={volumeCounts} sessions={sessions} loading={!preview && !previewError} error={previewError} />
        </section>

        <section aria-labelledby="override-heading" className={CARD}>
          <div>
            <h2 id="override-heading" className={HEADING}>Per-stock limits</h2>
            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">A volatile stock can have its own limit. Leave a box empty to keep the limit above for that measure.</p>
          </div>
          {draft.overrides.length > 0 && (
            <ul className="space-y-2">
              {draft.overrides.map((override) => (
                <li key={override.ticker} className="p-3 rounded-lg bg-[#0a0d14] border border-[#1e2433] flex items-center gap-2 flex-wrap text-xs">
                  <span className="font-mono font-bold text-white flex-1 min-w-[80px]" title={override.name}>{override.ticker}</span>
                  <label className="flex items-center gap-1 font-mono text-slate-400">
                    <span className="sr-only">{override.ticker} price limit</span>
                    ±
                    <input
                      type="number"
                      inputMode="decimal"
                      aria-label={`${override.ticker} price limit`}
                      value={override.price_threshold ?? ''}
                      min={limits.price_threshold[0]}
                      max={limits.price_threshold[1]}
                      step={0.5}
                      onChange={(e) => changeOverride(override.ticker, { price_threshold: e.target.value === '' ? null : parseFloat(e.target.value) })}
                      className="w-16 bg-[#111520] border border-[#1e2433] rounded-lg px-2 py-1.5 text-right text-base md:text-xs text-white focus:outline-none focus:border-blue-500"
                    />
                    %
                  </label>
                  <label className="flex items-center gap-1 font-mono text-slate-400">
                    <input
                      type="number"
                      inputMode="decimal"
                      aria-label={`${override.ticker} volume limit`}
                      value={override.volume_multiple ?? ''}
                      min={limits.volume_multiple[0]}
                      max={limits.volume_multiple[1]}
                      step={0.1}
                      onChange={(e) => changeOverride(override.ticker, { volume_multiple: e.target.value === '' ? null : parseFloat(e.target.value) })}
                      className="w-16 bg-[#111520] border border-[#1e2433] rounded-lg px-2 py-1.5 text-right text-base md:text-xs text-white focus:outline-none focus:border-blue-500"
                    />
                    ×
                  </label>
                  <button
                    type="button"
                    onClick={() => update({ overrides: draft.overrides.filter((o) => o.ticker !== override.ticker) })}
                    aria-label={`Remove ${override.ticker} limit`}
                    className="p-1.5 text-slate-400 hover:text-rose-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center gap-2">
            <select
              aria-label="Stock to give its own limit"
              value={newOverride}
              onChange={(e) => setNewOverride(e.target.value)}
              className={`${SELECT} flex-1 min-w-0`}
            >
              <option value="">Choose a stock</option>
              {overrideChoices.map((company) => (
                <option key={company.ticker} value={company.ticker}>{company.ticker}, {company.name}</option>
              ))}
            </select>
            <button type="button" onClick={addOverride} disabled={!newOverride} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#2a3449] text-xs font-mono text-slate-200 hover:text-white disabled:opacity-40">
              <Plus className="w-3.5 h-3.5" />
              Add
            </button>
          </div>
        </section>

        <section aria-labelledby="filings-heading" className={CARD}>
          <div>
            <h2 id="filings-heading" className={HEADING}>Filings that alert you</h2>
            <p className="text-[11px] text-slate-400 mt-1">{draft.categories.length} of {draft.all_categories.length} filing types.</p>
          </div>
          <CategoryChips
            label="Filing types that raise an alert"
            categories={draft.all_categories}
            selected={draft.categories}
            onToggle={(category) => update({ categories: toggleIn(draft.categories, category) })}
          />
          <div className="flex items-center justify-between gap-3 text-xs">
            <label htmlFor="alert-lookback" className="text-slate-300">Alert on filings from the last</label>
            <select id="alert-lookback" value={draft.alert_lookback_days} onChange={(e) => update({ alert_lookback_days: Number(e.target.value) })} className={SELECT}>
              {withCurrent(LOOKBACK_OPTIONS, draft.alert_lookback_days).map((days) => (
                <option key={days} value={days}>{days === 1 ? '1 day' : `${days} days`}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between gap-3 text-xs">
            <label htmlFor="sync-minutes" className="text-slate-300">Check for new data every</label>
            <select id="sync-minutes" value={draft.sync_minutes} onChange={(e) => update({ sync_minutes: Number(e.target.value) })} className={SELECT}>
              {withCurrent(SYNC_OPTIONS, draft.sync_minutes).map((minutes) => (
                <option key={minutes} value={minutes}>{minutes >= 60 ? `${minutes / 60} hour${minutes > 60 ? 's' : ''}` : `${minutes} minutes`}</option>
              ))}
            </select>
          </div>
        </section>

        <section aria-labelledby="digest-heading" className={CARD}>
          <h2 id="digest-heading" className={HEADING}>Daily digest</h2>
          <div className="flex items-center justify-between gap-3 text-xs">
            <label htmlFor="digest-window" className="text-slate-300">Open the briefing on the last</label>
            <select id="digest-window" value={draft.digest_default_hours} onChange={(e) => update({ digest_default_hours: Number(e.target.value) })} className={SELECT}>
              {draft.digest_windows.map((hours) => (
                <option key={hours} value={hours}>{WINDOW_LABELS[hours] || `${hours} hours`}</option>
              ))}
            </select>
          </div>
          <ThresholdInput
            id="move-watch"
            label="List stocks that moved by"
            value={draft.move_watch_percent}
            min={limits.move_watch_percent[0]}
            max={limits.move_watch_percent[1]}
            step={0.25}
            suffix="%"
            onChange={(next) => update({ move_watch_percent: next })}
          />
          <div className="space-y-1.5">
            <p className="text-xs text-slate-300">Show these at the top. The rest stay collapsed as routine.</p>
            <CategoryChips
              label="Filing types that lead the digest"
              categories={draft.all_categories}
              selected={draft.digest_focus_categories}
              onToggle={(category) => update({ digest_focus_categories: toggleIn(draft.digest_focus_categories, category) })}
            />
          </div>
        </section>

        <section aria-labelledby="notify-heading" className={CARD}>
          <h2 id="notify-heading" className={HEADING}>Notifications</h2>
          <BrowserAlerts />
          <div className="border-t border-[#1e2433] pt-3">
            <TelegramSettings />
          </div>
        </section>
      </main>

      {/* Sits above the phone navigation bar */}
      {isDirty && (
        <div className="fixed left-0 right-0 md:left-64 bottom-14 md:bottom-0 z-40 px-4 py-3 bg-[#0d111a]/95 backdrop-blur-md border-t border-[#1e2433] animate-fade-in">
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
            <span className="text-[11px] font-mono text-slate-300">Unsaved changes</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setDraft(saved)} disabled={saving} className="px-3 py-2 rounded-lg text-xs font-mono text-slate-400 hover:text-slate-200 disabled:opacity-50">
                Discard
              </button>
              <button type="button" onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium disabled:opacity-50">
                {saving ? 'Saving and checking...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
