'use client';

import React, { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { THEME_CHANGED_EVENT, Theme, currentTheme, setTheme } from '@/lib/theme';

function useTheme(): Theme {
  const [theme, setLocal] = useState<Theme>('dark');
  useEffect(() => {
    const sync = () => setLocal(currentTheme());
    sync();
    window.addEventListener(THEME_CHANGED_EVENT, sync);
    return () => window.removeEventListener(THEME_CHANGED_EVENT, sync);
  }, []);
  return theme;
}

// A small icon button: shows the theme you'd switch to.
export function ThemeButton() {
  const theme = useTheme();
  const next: Theme = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className="p-1.5 rounded-lg border border-[#1e2433] text-slate-400 hover:text-slate-200 hover:bg-[#161c28] transition-all"
    >
      {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
    </button>
  );
}

// Labelled Dark / Light choice, for the menu and Settings.
export function ThemeSwitch() {
  const theme = useTheme();
  return (
    <div role="radiogroup" aria-label="Theme" className="flex items-center gap-1 bg-[#111520] border border-[#1e2433] rounded-lg p-1 text-xs font-mono">
      {([['dark', 'Dark', Moon], ['light', 'Light', Sun]] as const).map(([value, label, Icon]) => (
        <button
          key={value}
          role="radio"
          aria-checked={theme === value}
          onClick={() => setTheme(value)}
          className={`flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded transition-colors ${theme === value ? 'bg-blue-600 text-white font-medium' : 'text-slate-400 hover:text-slate-200'}`}
        >
          <Icon className="w-3.5 h-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}
