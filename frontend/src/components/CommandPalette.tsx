'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BellRing,
  Briefcase,
  CornerDownLeft,
  FileText,
  Inbox,
  Layers,
  Search,
  Sliders,
  SlidersHorizontal
} from 'lucide-react';
import { api } from '@/lib/api';
import { OPEN_PALETTE_EVENT, readStored, writeStored } from '@/lib/ui';
import { Sheet } from '@/components/Sheet';

const RECENTS_KEY = 'finn.recentTickers';

const PAGES = [
  { name: 'Daily Briefing', href: '/', icon: Briefcase },
  { name: 'Portfolio', href: '/portfolio', icon: Layers },
  { name: 'Filings Inbox', href: '/inbox', icon: Inbox },
  { name: 'Alerts Centre', href: '/alerts', icon: BellRing },
  { name: 'Research Desk', href: '/research', icon: Search },
  { name: 'Sources & Docs', href: '/sources', icon: FileText },
  { name: 'Alert Settings', href: '/settings/alerts', icon: SlidersHorizontal },
  { name: 'Settings', href: '/settings', icon: Sliders },
];

interface PaletteRow {
  key: string;
  title: string;
  subtitle?: string;
  icon: React.ElementType;
  run: () => void;
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [companies, setCompanies] = useState<Array<{ ticker: string; name: string; sector: string | null; exchange: string; in_portfolio: boolean }>>([]);
  const [universeDown, setUniverseDown] = useState(false);
  const [searching, setSearching] = useState(false);
  const [recents, setRecents] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setCompanies([]);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    const onOpenRequest = () => setOpen(true);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpenRequest);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpenRequest);
    };
  }, []);

  useEffect(() => {
    if (open) setRecents(readStored<string[]>(RECENTS_KEY, []));
  }, [open]);

  // Debounced so typing a ticker doesn't send a request per keystroke.
  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setCompanies([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      api.searchCompanies(term)
        .then((res) => {
          if (cancelled) return;
          setCompanies(res.results);
          setUniverseDown(!res.universe_available);
        })
        .catch(() => {
          if (!cancelled) setCompanies([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const goToResearch = useCallback((ticker: string) => {
    writeStored(RECENTS_KEY, [ticker, ...readStored<string[]>(RECENTS_KEY, []).filter((t) => t !== ticker)].slice(0, 5));
    router.push(`/research?ticker=${encodeURIComponent(ticker)}`);
    close();
  }, [router, close]);

  const rows = useMemo<PaletteRow[]>(() => {
    const term = query.trim().toLowerCase();
    const companyRows: PaletteRow[] = term
      ? companies.map((c) => ({
          key: `company-${c.ticker}`,
          title: c.ticker,
          subtitle: [c.name, c.sector, c.exchange, c.in_portfolio ? 'In mock portfolio' : null].filter(Boolean).join(' · '),
          icon: Search,
          run: () => goToResearch(c.ticker)
        }))
      : recents.map((ticker) => ({
          key: `recent-${ticker}`,
          title: ticker,
          subtitle: 'Recently researched',
          icon: Search,
          run: () => goToResearch(ticker)
        }));
    const pageRows: PaletteRow[] = PAGES
      .filter((p) => !term || p.name.toLowerCase().includes(term))
      .map((p) => ({
        key: `page-${p.href}`,
        title: p.name,
        subtitle: 'Go to page',
        icon: p.icon,
        run: () => {
          router.push(p.href);
          close();
        }
      }));
    return [...companyRows, ...pageRows];
  }, [query, companies, recents, goToResearch, router, close]);

  useEffect(() => {
    setActiveIndex(0);
  }, [rows.length, query]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(rows.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      rows[activeIndex]?.run();
    }
  };

  const noCompanyMatch = query.trim().length > 0 && !searching && companies.length === 0;

  return (
    <Sheet open={open} onClose={close} label="Search companies and pages" placement="top" maxWidth="md:max-w-xl">
      <div className="flex items-center gap-2.5 px-4 border-b border-[#1e2433]">
        <Search className="w-4 h-4 text-slate-400 shrink-0" />
        <input
          autoFocus
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search a company or jump to a page..."
          aria-label="Search companies and pages"
          className="w-full bg-transparent py-3.5 text-base md:text-sm text-white placeholder-slate-400 focus:outline-none"
        />
        <button onClick={close} className="text-[10px] font-mono text-slate-400 border border-[#2a3449] rounded px-1.5 py-1 shrink-0">
          ESC
        </button>
      </div>

      <div ref={listRef} className="p-2 max-h-[60vh] overflow-y-auto">
        {noCompanyMatch && (
          <p className="px-3 py-2 text-[11px] font-mono text-amber-400">
            No NSE or BSE company matches &ldquo;{query.trim()}&rdquo;.
          </p>
        )}
        {universeDown && query.trim() && (
          <p className="px-3 py-2 text-[11px] font-mono text-amber-400">
            The NSE and BSE company lists are unavailable right now, so only companies already in FINN are shown.
          </p>
        )}
        {rows.map((row, i) => {
          const Icon = row.icon;
          return (
            <button
              key={row.key}
              data-active={i === activeIndex}
              onClick={row.run}
              onMouseMove={() => setActiveIndex(i)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left ${
                i === activeIndex ? 'bg-blue-600/15' : ''
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${i === activeIndex ? 'text-blue-400' : 'text-slate-500'}`} />
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-slate-100 font-mono">{row.title}</span>
                {row.subtitle && <span className="block text-[11px] text-slate-400 truncate">{row.subtitle}</span>}
              </span>
              {i === activeIndex && <CornerDownLeft className="hidden md:block w-3.5 h-3.5 text-slate-500 shrink-0" />}
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}
