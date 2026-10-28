'use client';

import React, { useState, useEffect } from 'react';
import { Header } from '@/components/Header';
import { api } from '@/lib/api';
import { SourceDocument } from '@/types';
import {
  FileText,
  Search,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  ChevronRight,
  Layers,
  Database
} from 'lucide-react';

export default function SourcesExplorerPage() {
  const [documents, setDocuments] = useState<SourceDocument[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<number | null>(null);
  const [docDetails, setDocDetails] = useState<{ document: any; chunks: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [chunksLoading, setChunksLoading] = useState(false);
  const [docTypeFilter, setDocTypeFilter] = useState('All');

  const loadDocuments = async () => {
    try {
      setLoading(true);
      // Fetch documents for sample major companies
      const [rilDocs, infyDocs, hdfcDocs] = await Promise.all([
        api.getCompanyDocuments('RELIANCE'),
        api.getCompanyDocuments('INFY'),
        api.getCompanyDocuments('HDFCBANK'),
      ]);
      const combined = [
        ...(rilDocs.documents || []),
        ...(infyDocs.documents || []),
        ...(hdfcDocs.documents || []),
      ];
      setDocuments(combined);
      if (combined.length > 0) {
        handleSelectDoc(combined[0].id);
      }
    } catch (err) {
      console.error('Failed to load documents:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectDoc = async (id: number) => {
    try {
      setSelectedDocId(id);
      setChunksLoading(true);
      const res = await api.getSourceDocument(id);
      setDocDetails(res);
    } catch (err) {
      console.error('Failed to load document details:', err);
    } finally {
      setChunksLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, []);

  const filteredDocs = documents.filter((d) => {
    if (docTypeFilter === 'All') return true;
    return d.document_type === docTypeFilter;
  });

  return (
    <div className="flex-1 flex flex-col bg-[#0a0d14]">
      <Header onRefresh={loadDocuments} isRefreshing={loading} />

      <main className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto w-full">
        {/* Title */}
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white tracking-tight">Primary Source Document Explorer</h1>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/30">
              {documents.length} DOCUMENTS INDEXED
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Browse ingested annual reports, concall transcripts, and presentations with chunk-level text extraction and section metadata.
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 text-xs font-mono">
          {['All', 'annual_report', 'concall_transcript'].map((t) => (
            <button
              key={t}
              onClick={() => setDocTypeFilter(t)}
              className={`px-3 py-1 rounded-lg border transition-colors capitalize ${
                docTypeFilter === t
                  ? 'bg-blue-600/20 text-blue-400 border-blue-500/40 font-semibold'
                  : 'bg-[#111520] text-slate-400 border-[#1e2433] hover:text-slate-200'
              }`}
            >
              {t.replace('_', ' ')}
            </button>
          ))}
        </div>

        {/* 2-Column Document Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Document List (Left 1 Col) */}
          <div className="lg:col-span-1 space-y-2.5">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
              Source Catalog
            </h3>
            {filteredDocs.map((doc) => {
              const isSelected = selectedDocId === doc.id;
              return (
                <button
                  key={doc.id}
                  onClick={() => handleSelectDoc(doc.id)}
                  className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                    isSelected
                      ? 'bg-[#161c28] border-blue-500/50 shadow-md'
                      : 'bg-[#111520] border-[#1e2433] hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold font-mono text-white">
                      {doc.company_ticker}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#0a0d14] text-slate-400 uppercase">
                      {doc.document_type.replace('_', ' ')}
                    </span>
                  </div>
                  <h4 className="text-xs font-medium text-slate-200 mt-1.5 line-clamp-2">
                    {doc.title}
                  </h4>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#1e2433]/60 text-[10px] font-mono text-slate-400">
                    <span>{doc.financial_period || 'Full Year'}</span>
                    <span>{doc.chunk_count} Chunks</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Document Chunks Inspector (Right 2 Cols) */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                Extracted Evidence Chunks ({docDetails?.chunks.length || 0})
              </h3>
              {docDetails?.document?.source_url && (
                <a
                  href={docDetails.document.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-mono"
                >
                  Source PDF <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>

            {chunksLoading ? (
              <div className="p-8 rounded-xl bg-[#111520] border border-[#1e2433] text-center text-xs text-slate-400 font-mono animate-pulse">
                Loading chunks...
              </div>
            ) : !docDetails || docDetails.chunks.length === 0 ? (
              <div className="p-8 rounded-xl bg-[#111520] border border-[#1e2433] text-center text-xs text-slate-400 font-mono">
                Select a document to inspect text excerpts.
              </div>
            ) : (
              <div className="space-y-3">
                {docDetails.chunks.map((chunk) => (
                  <div
                    key={chunk.id}
                    className="p-4 rounded-xl bg-[#111520] border border-[#1e2433] space-y-2"
                  >
                    <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                      <span className="text-blue-400 font-bold">
                        Chunk #{chunk.chunk_index + 1}
                      </span>
                      {chunk.page_number && (
                        <span>Page {chunk.page_number}</span>
                      )}
                      {chunk.section_heading && (
                        <span className="text-slate-300 font-medium">
                          {chunk.section_heading}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-200 leading-relaxed bg-[#0a0d14] p-3 rounded-lg border border-[#1e2433] font-sans">
                      {chunk.content}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
