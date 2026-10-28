'use client';

import React from 'react';
import { X, BookOpen, ExternalLink, ShieldCheck } from 'lucide-react';
import { ResearchCitation } from '@/types';

export function CitationDrawer({
  citation,
  onClose
}: {
  citation: ResearchCitation | null;
  onClose: () => void;
}) {
  if (!citation) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-96 bg-[#111520] border-l border-[#1e2433] shadow-2xl p-6 overflow-y-auto animate-slide-left">
      <div className="flex items-center justify-between pb-4 border-b border-[#1e2433]">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-semibold text-white">Primary Source Citation</h3>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-[#1a2030]">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="mt-4 space-y-4 text-xs">
        <div>
          <span className="text-slate-400 block text-[11px]">Document Title:</span>
          <p className="text-slate-200 font-medium mt-0.5">{citation.source}</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="p-2.5 rounded-lg bg-[#0a0d14] border border-[#1e2433]">
            <span className="text-[10px] text-slate-400 font-mono">Document Type</span>
            <p className="text-slate-200 capitalize font-medium mt-0.5">{citation.type.replace('_', ' ')}</p>
          </div>
          <div className="p-2.5 rounded-lg bg-[#0a0d14] border border-[#1e2433]">
            <span className="text-[10px] text-slate-400 font-mono">Period</span>
            <p className="text-slate-200 font-medium mt-0.5">{citation.period || 'Annual / Full Year'}</p>
          </div>
        </div>

        <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-emerald-400 flex items-start gap-2 text-[11px]">
          <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Verified primary source. Pull-mode investment analysis excludes secondary broker opinions and third-party news snippets.
          </span>
        </div>

        {citation.url && (
          <div className="pt-2">
            <a
              href={citation.url}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-500/30 font-medium transition-colors"
            >
              Open Original Filing
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
