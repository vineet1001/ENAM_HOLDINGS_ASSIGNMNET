'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, Eye, EyeOff, KeyRound, Trash2, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { AiProviderSetting, AiSettings } from '@/types';
import { useToast } from '@/components/Toast';

function ProviderCard({
  provider,
  canEdit,
  adminToken,
  onChanged
}: {
  provider: AiProviderSetting;
  canEdit: boolean;
  adminToken: string;
  onChanged: () => Promise<void>;
}) {
  const toast = useToast();
  const [keyInput, setKeyInput] = useState('');
  const [modelInput, setModelInput] = useState(provider.model);
  const [strongInput, setStrongInput] = useState(provider.strong_model);
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState<'save' | 'test' | 'use' | 'remove' | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    setModelInput(provider.model);
  }, [provider.model]);

  useEffect(() => {
    setStrongInput(provider.strong_model);
  }, [provider.strong_model]);

  const modelChanged = modelInput.trim() !== provider.model;
  const strongChanged = strongInput.trim() !== provider.strong_model;
  const canSave = !!keyInput.trim() || (modelChanged && !!modelInput.trim()) || (strongChanged && !!strongInput.trim());

  const save = async (activate: boolean) => {
    setBusy(activate ? 'use' : 'save');
    setTestResult(null);
    try {
      await api.saveAiSettings(
        provider.id,
        {
          api_key: keyInput.trim() || undefined,
          model: modelChanged ? modelInput.trim() : undefined,
          strong_model: strongChanged ? strongInput.trim() : undefined,
          activate
        },
        adminToken
      );
      // The typed key leaves the page as soon as it's saved.
      setKeyInput('');
      setShowKey(false);
      await onChanged();
      toast({ message: activate ? `FINN now uses ${provider.name}` : `${provider.name} saved` });
    } catch (err: any) {
      toast({ message: err.message || 'Could not save', tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    setBusy('test');
    setTestResult(null);
    try {
      setTestResult(
        await api.testAiSettings(provider.id, { api_key: keyInput.trim() || undefined, model: modelInput.trim() || undefined }, adminToken)
      );
    } catch (err: any) {
      setTestResult({ ok: false, message: err.message || 'The test could not run' });
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!confirmRemove) {
      setConfirmRemove(true);
      return;
    }
    setConfirmRemove(false);
    setBusy('remove');
    setTestResult(null);
    try {
      await api.removeAiKey(provider.id, adminToken);
      await onChanged();
      toast({ message: `${provider.name} key removed` });
    } catch (err: any) {
      toast({ message: err.message || 'Could not remove the key', tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  // A platform with no key isn't really in use, even if it's the one selected.
  const inUse = provider.is_active && provider.has_key;
  const keyFieldId = `ai-key-${provider.id}`;
  const modelFieldId = `ai-model-${provider.id}`;
  const strongFieldId = `ai-strong-model-${provider.id}`;

  return (
    <article className={`p-4 rounded-xl bg-[#0a0d14] border space-y-3 ${inUse ? 'border-blue-500/50' : 'border-[#1e2433]'}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-sm font-semibold text-white">{provider.name}</h4>
            {inUse && (
              <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/40">IN USE</span>
            )}
            <span className={`text-[10px] font-mono ${provider.has_key ? 'text-emerald-400' : 'text-slate-500'}`}>
              {provider.has_key ? `Key saved${provider.key_hint ? ` ${provider.key_hint}` : ''}` : 'No key'}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">{provider.note}</p>
        </div>
        <a
          href={provider.key_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] font-mono text-blue-400 hover:text-blue-300 py-1 shrink-0"
        >
          Get a key <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {canEdit && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label htmlFor={keyFieldId} className="block text-slate-300 font-medium mb-1">
                {provider.has_key ? 'Replace API key' : 'API key'}
              </label>
              <div className="relative">
                <input
                  id={keyFieldId}
                  type={showKey ? 'text' : 'password'}
                  autoComplete="new-password"
                  spellCheck={false}
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder={provider.has_key ? 'Leave blank to keep the saved key' : 'Paste your key'}
                  className="w-full bg-[#111520] border border-[#1e2433] rounded-lg pl-3 pr-9 py-2 text-base md:text-xs text-slate-200 font-mono placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  aria-label={showKey ? `Hide ${provider.name} key` : `Show ${provider.name} key`}
                  className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-white"
                >
                  {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
            <div>
              <label htmlFor={modelFieldId} className="block text-slate-300 font-medium mb-1">Light model, for reading filings</label>
              <input
                id={modelFieldId}
                type="text"
                spellCheck={false}
                value={modelInput}
                onChange={(e) => setModelInput(e.target.value)}
                placeholder={provider.default_model}
                className="w-full bg-[#111520] border border-[#1e2433] rounded-lg px-3 py-2 text-base md:text-xs text-slate-200 font-mono placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="sm:col-start-2">
              <label htmlFor={strongFieldId} className="block text-slate-300 font-medium mb-1">Stronger model, for research analysis</label>
              <input
                id={strongFieldId}
                type="text"
                spellCheck={false}
                value={strongInput}
                onChange={(e) => setStrongInput(e.target.value)}
                placeholder={provider.default_strong_model}
                className="w-full bg-[#111520] border border-[#1e2433] rounded-lg px-3 py-2 text-base md:text-xs text-slate-200 font-mono placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap text-xs">
            <button
              type="button"
              onClick={test}
              disabled={busy !== null || (!keyInput.trim() && !provider.has_key)}
              className="px-3 py-2 rounded-lg border border-[#2a3449] text-slate-200 hover:text-white disabled:opacity-40 font-mono"
            >
              {busy === 'test' ? 'Testing...' : 'Test'}
            </button>
            <button
              type="button"
              onClick={() => save(false)}
              disabled={busy !== null || !canSave}
              className="px-3 py-2 rounded-lg border border-[#2a3449] text-slate-200 hover:text-white disabled:opacity-40 font-mono"
            >
              {busy === 'save' ? 'Saving...' : 'Save'}
            </button>
            {!inUse && (
              <button
                type="button"
                onClick={() => save(true)}
                disabled={busy !== null || (!keyInput.trim() && !provider.has_key)}
                className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium disabled:opacity-40"
              >
                {busy === 'use' ? 'Switching...' : 'Save and use'}
              </button>
            )}
            {provider.has_key && (
              <button
                type="button"
                onClick={remove}
                onBlur={() => setConfirmRemove(false)}
                disabled={busy !== null}
                aria-label={confirmRemove ? `Confirm remove ${provider.name} key` : `Remove ${provider.name} key`}
                className={`ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-lg font-mono transition-colors disabled:opacity-40 ${
                  confirmRemove ? 'bg-rose-500/15 text-rose-300 border border-rose-500/40 font-semibold' : 'text-slate-400 hover:text-rose-400'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                {confirmRemove ? 'Confirm remove' : 'Remove key'}
              </button>
            )}
          </div>

          {testResult && (
            <p
              role="status"
              className={`flex items-start gap-1.5 text-[11px] font-mono leading-relaxed ${testResult.ok ? 'text-emerald-400' : 'text-rose-300'}`}
            >
              {testResult.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-px" /> : <XCircle className="w-3.5 h-3.5 shrink-0 mt-px" />}
              {testResult.message}
            </p>
          )}
        </>
      )}
    </article>
  );
}

export function AiKeysSettings({ onChanged }: { onChanged?: () => void }) {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [adminToken, setAdminToken] = useState('');

  const load = useCallback(async (token: string) => {
    try {
      setSettings(await api.getAiSettings(token));
      setLoadError(null);
    } catch (err: any) {
      setLoadError(err.message || 'Could not load AI settings');
    }
  }, []);

  useEffect(() => {
    load('');
  }, [load]);

  const refresh = async () => {
    await load(adminToken);
    onChanged?.();
  };

  return (
    <section aria-labelledby="ai-keys-heading" className="p-5 rounded-xl bg-[#111520] border border-[#1e2433] space-y-4">
      <div>
        <h3 id="ai-keys-heading" className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-blue-400" />
          AI Platforms &amp; API Keys
        </h3>
        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
          Add a key for any platform, then choose which one reads filings and documents.
          A light model handles routine reading, and a stronger one handles promised-versus-delivered and bull-versus-bear.
          Changes apply straight away, with no restart.
        </p>
      </div>

      {loadError && <p className="text-[11px] font-mono text-rose-300">{loadError}</p>}

      {settings?.needs_token && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            load(adminToken);
          }}
          className="p-3 rounded-lg bg-[#0a0d14] border border-amber-500/30 space-y-2 text-xs"
        >
          <label htmlFor="admin-token" className="block text-slate-300 font-medium">Admin token required to change keys</label>
          <div className="flex gap-2">
            <input
              id="admin-token"
              type="password"
              autoComplete="off"
              value={adminToken}
              onChange={(e) => setAdminToken(e.target.value)}
              className="flex-1 min-w-0 bg-[#111520] border border-[#1e2433] rounded-lg px-3 py-2 text-base md:text-xs text-slate-200 font-mono focus:outline-none focus:border-blue-500"
            />
            <button type="submit" className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium">Unlock</button>
          </div>
        </form>
      )}
      {settings && !settings.can_edit && !settings.needs_token && (
        <p className="p-3 rounded-lg bg-[#0a0d14] border border-amber-500/30 text-[11px] font-mono text-amber-300 leading-relaxed">
          Keys can only be changed on the computer running FINN. To allow it from elsewhere, set FINN_ADMIN_TOKEN on the server.
        </p>
      )}

      {!settings && !loadError ? (
        <div className="h-40 rounded-lg bg-[#0a0d14] border border-[#1e2433] animate-pulse" aria-label="Loading AI settings" />
      ) : (
        <div className="space-y-3">
          {settings?.providers.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              canEdit={settings.can_edit}
              adminToken={adminToken}
              onChanged={refresh}
            />
          ))}
        </div>
      )}

      <p className="text-[10px] font-mono text-slate-500 leading-relaxed">
        Keys are saved in the server&apos;s backend/.env file, which git ignores, and are never sent back to this page after saving.
        Filing text is sent to the platform in use; check its data policy, as free tiers may use data to improve their products.
      </p>
    </section>
  );
}
