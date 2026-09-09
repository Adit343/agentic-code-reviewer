'use client';

import { Finding } from '@/types/domain';
import { AlertTriangle, ShieldCheck, FileCode, Check, ShieldAlert, Sparkles, Terminal, Copy, X } from 'lucide-react';
import { useState, useEffect } from 'react';

export function FindingDetailModal({
  finding,
  reviewId,
  onClose,
  onStatusChange,
}: {
  finding: Finding | null;
  reviewId: string;
  onClose: () => void;
  onStatusChange: (findingId: string, newStatus: Finding['status']) => void;
}) {
  const [updating, setUpdating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (finding) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [finding]);

  if (!finding) return null;

  async function handleStatusUpdate(status: Finding['status']) {
    if (!finding) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/reviews/${reviewId}/findings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ findingId: finding.id, status }),
      });
      if (res.ok) {
        onStatusChange(finding.id, status);
      }
    } finally {
      setUpdating(false);
    }
  }

  const copyEvidence = () => {
    if (!finding?.evidence) return;
    navigator.clipboard.writeText(finding.evidence);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getSeverityBadge = (severity: Finding['severity']) => {
    switch (severity) {
      case 'critical':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/40 shadow-rose-500/10';
      case 'high':
        return 'bg-orange-500/20 text-orange-300 border-orange-500/40 shadow-orange-500/10';
      case 'medium':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-amber-500/10';
      case 'low':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/40 shadow-blue-500/10';
      default:
        return 'bg-slate-500/20 text-slate-300 border-slate-500/40';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-3xl border border-slate-700/60 bg-slate-900/90 p-7 shadow-2xl backdrop-blur-2xl space-y-6">
        {/* Glow backdrop */}
        <div className="absolute top-0 right-0 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="relative flex items-start justify-between border-b border-slate-800/80 pb-5">
          <div className="space-y-3 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className={`px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider border shadow-md ${getSeverityBadge(finding.severity)}`}>
                {finding.severity}
              </span>
              <span className="px-3 py-1 rounded-full text-[11px] font-extrabold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 uppercase tracking-wider">
                {finding.category}
              </span>
              <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-slate-950 text-slate-300 border border-slate-800 font-mono">
                CONFIDENCE: {(finding.confidence * 100).toFixed(0)}%
              </span>
              {finding.introduced_by_commit && (
                <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30">
                  ⚡ Commit Diff Regression
                </span>
              )}
            </div>
            <h2 className="text-2xl font-extrabold text-white tracking-tight">{finding.title}</h2>
            <div className="flex items-center gap-2 text-xs font-mono text-slate-400 bg-slate-950/60 px-3 py-1.5 rounded-xl border border-slate-800 w-fit">
              <FileCode className="h-4 w-4 text-indigo-400" />
              <span>
                {finding.file}:{finding.start_line}-{finding.end_line}
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-800/80 text-slate-400 hover:bg-slate-700 hover:text-white transition-all shadow-md cursor-pointer"
            title="Close Inspector"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Code Snippet Box */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Terminal className="h-4 w-4 text-indigo-400" />
              Source Evidence Snippet
            </h4>
            <button
              onClick={copyEvidence}
              className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy Evidence'}
            </button>
          </div>
          <div className="relative rounded-2xl border border-slate-800 bg-slate-950 p-4 font-mono text-xs text-rose-300 overflow-x-auto shadow-inner">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-800/80 text-[10px] text-slate-500">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
              <span className="ml-2 font-mono">{finding.file}</span>
            </div>
            <pre>
              <code>{finding.evidence || 'No evidence snippet captured.'}</code>
            </pre>
          </div>
        </div>

        {/* Explanation & Impact Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              Vulnerability Mechanism
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed">{finding.explanation}</p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-rose-400" />
              Impact & Threat Vector
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed">
              {finding.attack_scenario || finding.impact || 'Detailed attack vector not specified.'}
            </p>
          </div>
        </div>

        {/* Verification Agent Reasoning */}
        <div className="rounded-2xl border border-indigo-500/30 bg-gradient-to-r from-indigo-500/10 via-purple-500/5 to-slate-900 p-5 space-y-3 shadow-inner">
          <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-300 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-indigo-400" />
            Verification Agent Counter-Evidence Audit Trail
          </h4>
          <div className="space-y-1.5 text-xs text-slate-300 font-mono">
            <div>
              <span className="text-slate-400">Checks Performed: </span>
              <span className="text-indigo-300 font-semibold">{finding.verification.checks_performed.join(', ') || 'Static & AI verification'}</span>
            </div>
            <div>
              <span className="text-slate-400">Counter-Evidence Considered: </span>
              <span className="text-slate-300">
                {finding.verification.counter_evidence_considered.length > 0
                  ? finding.verification.counter_evidence_considered.join('; ')
                  : 'No sanitization routines found in surrounding scope.'}
              </span>
            </div>
          </div>
        </div>

        {/* Recommended Fix */}
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-400" />
            Remediation Guidance
          </h4>
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 font-mono text-xs text-emerald-300 shadow-inner">
            {finding.recommended_fix}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-800/80 pt-5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400">Mark Status:</span>
            {(['confirmed', 'accepted', 'false_positive', 'fixed'] as Finding['status'][]).map((st) => (
              <button
                key={st}
                disabled={updating}
                onClick={() => handleStatusUpdate(st)}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-bold capitalize border transition-all cursor-pointer ${
                  finding.status === st
                    ? 'border-indigo-500 bg-indigo-500/20 text-indigo-300 shadow-md shadow-indigo-500/10'
                    : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700 hover:text-white'
                }`}
              >
                {st.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
