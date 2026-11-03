'use client';

import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';

interface ToastOptions {
  message: string;
  tone?: 'info' | 'error';
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastItem extends ToastOptions {
  id: number;
}

const ToastContext = createContext<(options: ToastOptions) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((options: ToastOptions) => {
    const id = nextId.current++;
    // Keep the stack short so a burst of triage actions stays readable.
    setToasts((prev) => [...prev.slice(-2), { ...options, id }]);
    setTimeout(() => dismiss(id), options.actionLabel ? 6000 : 4000);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        className="fixed z-[70] bottom-20 md:bottom-6 left-4 right-4 md:left-auto md:right-6 md:w-96 flex flex-col gap-2 pointer-events-none"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-2.5 px-3 py-2 rounded-lg bg-[#161c28] border shadow-2xl text-xs text-slate-100 animate-slide-up ${
              t.tone === 'error' ? 'border-rose-500/50' : 'border-[#2a3449]'
            }`}
          >
            {t.tone === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            <span className="flex-1 min-w-0 leading-relaxed">{t.message}</span>
            {t.actionLabel && t.onAction && (
              <button
                onClick={() => {
                  t.onAction?.();
                  dismiss(t.id);
                }}
                className="px-2.5 py-1.5 rounded font-mono font-semibold text-blue-400 hover:bg-blue-500/10 shrink-0"
              >
                {t.actionLabel}
              </button>
            )}
            <button
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              className="p-1.5 rounded text-slate-400 hover:text-white shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
