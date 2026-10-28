'use client';

import React from 'react';
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
  TrendingUp,
  Cpu
} from 'lucide-react';

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
  { name: 'Settings', href: '/settings', icon: Sliders },
];

export function Navigation({ alertCount = 0 }: { alertCount?: number }) {
  const pathname = usePathname();

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

        {/* Bottom System Status */}
        <div className="mt-auto pt-4 border-t border-[#1e2433] px-2 text-[11px] text-slate-500 flex flex-col gap-1.5 font-mono">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Live Feed
            </span>
            <span className="text-slate-400">NSE / BSE</span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-500">
            <span>Primary Sources Grounded</span>
          </div>
        </div>
      </aside>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0a0d14]/95 backdrop-blur-md border-t border-[#1e2433] px-1 py-1 flex items-center justify-around">
        {NAV_ITEMS.slice(0, 5).map((item) => {
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
      </nav>
    </>
  );
}

