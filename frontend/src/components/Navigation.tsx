'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Briefcase,
  Layers,
  BellRing,
  Inbox,
  Search,
  FileText,
  Sliders,
  SlidersHorizontal,
  Menu,
  X
} from 'lucide-react';
import { ThemeSwitch } from '@/components/ThemeToggle';
import { api } from '@/lib/api';
import { ALERTS_CHANGED_EVENT, BROWSER_ALERTS_KEY, OPEN_MENU_EVENT, readStored } from '@/lib/ui';

import type { AlertEvent } from '@/types';

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  badge?: number | string;
}

const NAV_ITEMS: NavItem[] = [
  { name: 'Daily Briefing', href: '/', icon: Briefcase },
  { name: 'Portfolio', href: '/portfolio', icon: Layers },
  { name: 'Filings Inbox', href: '/inbox', icon: Inbox },
  { name: 'Alerts Centre', href: '/alerts', icon: BellRing },
  { name: 'Research Desk', href: '/research', icon: Search },
  { name: 'Sources & Docs', href: '/sources', icon: FileText },
  { name: 'Alert Settings', href: '/settings/alerts', icon: SlidersHorizontal },
  { name: 'Settings', href: '/settings', icon: Sliders },
];

export function Navigation() {
  const pathname = usePathname();
  const [alertCount, setAlertCount] = useState(0);
  const newestSeen = useRef<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the menu on navigation, and open it from the header's menu button.
  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    const open = () => setMenuOpen(true);
    window.addEventListener(OPEN_MENU_EVENT, open);
    return () => window.removeEventListener(OPEN_MENU_EVENT, open);
  }, []);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  useEffect(() => {
    const refreshCount = () => {
      api.getAlertEvents({ acknowledged: false, limit: 200 })
        .then((res) => {
          setAlertCount(res.events.length);
          notifyNewAlerts(res.events);
        })
        .catch(() => {});
    };
    // The first load only sets the starting point, so opening the app doesn't replay old alerts.
    const notifyNewAlerts = (events: AlertEvent[]) => {
      const newest = events.reduce((highest, e) => Math.max(highest, e.id), 0);
      const previous = newestSeen.current;
      newestSeen.current = Math.max(previous ?? 0, newest);
      if (previous === null || !readStored(BROWSER_ALERTS_KEY, false)) return;
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      const fresh = events.filter((e) => e.id > previous);
      if (fresh.length === 0) return;
      const first = fresh[0];
      new Notification(fresh.length === 1 ? `FINN: ${first.company_ticker}` : `FINN: ${fresh.length} new alerts`, {
        body: first.filing_title || first.observed_value,
        tag: `finn-${newest}`,
      });
    };
    refreshCount();
    const interval = setInterval(refreshCount, 30000);
    window.addEventListener(ALERTS_CHANGED_EVENT, refreshCount);
    return () => {
      clearInterval(interval);
      window.removeEventListener(ALERTS_CHANGED_EVENT, refreshCount);
    };
  }, []);

  return (
    <>
      {/* Desktop Sidebar (Left) */}
      <aside className="hidden md:flex flex-col w-64 border-r border-[#1e2433] bg-[#0a0d14] p-4 select-none shrink-0">
        <div className="flex items-center gap-3 px-3 py-3 mb-6">
          <div className="h-9 w-9 rounded-lg bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400 font-bold tracking-wider">
            F
          </div>
          <div>
            <div className="font-semibold text-white tracking-wide flex items-center gap-2">
              FINN
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                v1.0
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Institutional Intelligence</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={`flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-blue-600/15 text-blue-400 border border-blue-500/30 font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-[#111520]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-blue-400' : 'text-slate-500'}`} />
                  <span>{item.name}</span>
                </div>
                {item.href === '/alerts' && alertCount > 0 && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 font-mono">
                    {alertCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="pt-4 px-1">
          <ThemeSwitch />
        </div>

        {/* Bottom System Status */}
        <div className="mt-4 pt-4 border-t border-[#1e2433] px-2 text-[11px] text-slate-500 flex flex-col gap-1.5 font-mono">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              End-of-day prices
            </span>
            <span className="text-slate-400">NSE + BSE</span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-500">
            <span>Search: Ctrl K</span>
          </div>
        </div>
      </aside>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0a0d14]/95 backdrop-blur-md border-t border-[#1e2433] px-1 py-1 flex items-center justify-around">
        {NAV_ITEMS.slice(0, 4).map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-md text-[10px] transition-all relative ${
                isActive ? 'text-blue-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="w-5 h-5 mb-0.5" />
              <span className="truncate max-w-[60px]">{item.name.split(' ')[0]}</span>
              {item.href === '/alerts' && alertCount > 0 && (
                <span className="absolute top-0.5 right-2 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-[#0a0d14]" />
              )}
            </Link>
          );
        })}
        <button
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu with every page"
          aria-expanded={menuOpen}
          className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-md text-[10px] transition-all ${
            NAV_ITEMS.slice(4).some((item) => item.href === pathname) ? 'text-blue-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Menu className="w-5 h-5 mb-0.5" />
          <span>Menu</span>
        </button>
      </nav>

      {/* Mobile menu: every page, plus the theme */}
      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Menu">
          <button className="absolute inset-0 bg-black/70 animate-fade-in" aria-label="Close menu" onClick={() => setMenuOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-[82%] max-w-xs bg-[#0a0d14] border-r border-[#1e2433] p-4 flex flex-col animate-slide-left overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400 font-bold tracking-wider">F</div>
                <div>
                  <div className="font-semibold text-white tracking-wide">FINN</div>
                  <p className="text-[11px] text-slate-400">Institutional Intelligence</p>
                </div>
              </div>
              <button onClick={() => setMenuOpen(false)} aria-label="Close menu" className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-[#111520]">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="space-y-1" aria-label="All pages">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex items-center justify-between px-3.5 py-3 rounded-lg text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-blue-600/15 text-blue-400 border border-blue-500/30 font-semibold'
                        : 'text-slate-300 hover:text-slate-200 hover:bg-[#111520]'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <Icon className={`w-4 h-4 ${isActive ? 'text-blue-400' : 'text-slate-500'}`} />
                      {item.name}
                    </span>
                    {item.href === '/alerts' && alertCount > 0 && (
                      <span className="text-[10px] px-1.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 font-mono">{alertCount}</span>
                    )}
                  </Link>
                );
              })}
            </nav>
            <div className="mt-6">
              <p className="text-[10px] uppercase tracking-wider font-mono text-slate-500 mb-2 px-1">Theme</p>
              <ThemeSwitch />
            </div>
            <p className="mt-auto pt-6 text-[10px] font-mono text-slate-500 px-1">End-of-day prices · NSE + BSE</p>
          </aside>
        </div>
      )}
    </>
  );
}

