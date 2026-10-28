'use client';

import React from 'react';
import { X, UserCheck, ExternalLink, ShieldCheck, AlertTriangle, Briefcase, GraduationCap } from 'lucide-react';
import { ManagementChangeEnrichment } from '@/types';

export function ExecutiveEnrichmentModal({
  data,
  onClose
}: {
  data: ManagementChangeEnrichment | null;
  onClose: () => void;
}) {
  if (!data) return null;
  const p = data.profile;
  const isVerified = p.verification_status === 'verified';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#111520] border border-[#1e2433] rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl p-6">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-[#1e2433]">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                {data.company_ticker}
              </span>
              <span className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded border flex items-center gap-1 ${
                isVerified
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
              }`}>
                {isVerified ? (
                  <>
                    <ShieldCheck className="w-3 h-3" />
                    Verified Background
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-3 h-3" />
                    Unverified / Inferred
                  </>
                )}
              </span>
            </div>
            <h3 className="text-base font-semibold text-white mt-1.5">{p.person_name}</h3>
            <p className="text-xs text-blue-400 font-medium">{p.role}</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-[#1a2030] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Overview details */}
        <div className="my-4 space-y-3 text-xs">
          <div className="p-3 rounded-lg bg-[#0a0d14] border border-[#1e2433] space-y-2">
            <div>
              <span className="text-slate-400 block text-[11px]">Effective Date:</span>
              <span className="text-slate-200 font-medium">{p.effective_date}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Prior Role / Responsibility:</span>
              <span className="text-slate-200 font-medium">{p.previous_role}</span>
            </div>
          </div>

          {/* Career History */}
          {p.career_history && p.career_history.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 mb-2">
                <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                <span>Verified Career Trajectory</span>
              </div>
              <div className="space-y-1.5">
                {p.career_history.map((item, idx) => (
                  <div key={idx} className="p-2.5 rounded-md bg-[#0a0d14] border border-[#1e2433] flex justify-between items-center text-[11px]">
                    <div>
                      <div className="text-slate-200 font-medium">{item.role}</div>
                      <div className="text-slate-400">{item.organization}</div>
                    </div>
                    <span className="text-slate-400 font-mono text-[10px]">{item.period}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Education */}
          {p.education && (
            <div className="p-3 rounded-lg bg-[#0a0d14] border border-[#1e2433]">
              <div className="flex items-center gap-1.5 text-slate-400 text-[11px] mb-1">
                <GraduationCap className="w-3.5 h-3.5" />
                <span>Education & Credentials</span>
              </div>
              <div className="text-slate-200 font-medium text-[11px]">{p.education}</div>
            </div>
          )}

          {/* Notes */}
          {p.notes && (
            <div className="text-[11px] text-slate-400 italic bg-blue-950/20 p-2.5 rounded-lg border border-blue-900/30">
              "{p.notes}"
            </div>
          )}
        </div>

        {/* Source link footer */}
        <div className="pt-3 border-t border-[#1e2433] flex items-center justify-between text-[11px]">
          <span className="text-slate-400">
            Source: <span className="text-slate-300 font-medium">{p.source_type}</span>
          </span>
          {p.source_url && (
            <a
              href={p.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium transition-colors"
            >
              Inspect Source
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
