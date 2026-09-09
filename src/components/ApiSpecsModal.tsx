'use client';

import { useState, useEffect } from 'react';
import { Terminal, Copy, Check, Code, ShieldCheck, Cpu } from 'lucide-react';

export function ApiSpecsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const ENDPOINTS = [
    {
      method: 'POST',
      path: '/api/reviews',
      desc: 'Triggers a full repository code review job with SAST, AST indexing, and multi-agent reasoning.',
      payload: `{\n  "repositorySource": "/path/to/repo or owner/repo",\n  "provider": "local | github | gitlab | url",\n  "commitSha": "HEAD (optional)"\n}`,
      curl: `curl -X POST http://localhost:3000/api/reviews \\\n  -H "Content-Type: application/json" \\\n  -d '{"repositorySource": "/home/adit/Desktop/Learning/agentic-code-reviewer", "provider": "local"}'`,
    },
    {
      method: 'GET',
      path: '/api/reviews',
      desc: 'Retrieves all historical repository review jobs and status summaries.',
      curl: `curl -s http://localhost:3000/api/reviews`,
    },
    {
      method: 'GET',
      path: '/api/reviews/:id',
      desc: 'Fetches detailed status, phase progress, and risk breakdown summary for a review job.',
      curl: `curl -s http://localhost:3000/api/reviews/rev-c6f85148`,
    },
    {
      method: 'GET',
      path: '/api/reviews/:id/findings',
      desc: 'Retrieves verified evidence findings with severity, line ranges, and counter-evidence reasoning.',
      curl: `curl -s http://localhost:3000/api/reviews/rev-c6f85148/findings?severity=critical`,
    },
    {
      method: 'PATCH',
      path: '/api/reviews/:id/findings',
      desc: 'Updates human decision on a finding (confirmed, accepted, false_positive, fixed).',
      payload: `{\n  "findingId": "finding-123",\n  "status": "false_positive | confirmed | accepted | fixed"\n}`,
      curl: `curl -X PATCH http://localhost:3000/api/reviews/rev-c6f85148/findings \\\n  -H "Content-Type: application/json" \\\n  -d '{"findingId": "finding-fc66105d", "status": "false_positive"}'`,
    },
    {
      method: 'GET',
      path: '/api/health',
      desc: 'Returns system operational status, active SAST analyzers, and AI provider configurations.',
      curl: `curl -s http://localhost:3000/api/health`,
    },
  ];

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl border border-slate-700/60 bg-slate-900/95 p-7 shadow-2xl backdrop-blur-2xl space-y-6">
        {/* Glow ambient background accent */}
        <div className="absolute top-0 right-0 h-48 w-48 rounded-full bg-purple-500/10 blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-purple-500/15 text-purple-400 border border-purple-500/30">
              <Code className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-white tracking-tight">REST API Specifications</h2>
              <p className="text-xs text-slate-400">Complete API reference for orchestration, review jobs, & findings</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            &times;
          </button>
        </div>

        {/* Endpoint List */}
        <div className="space-y-4">
          {ENDPOINTS.map((ep, idx) => (
            <div key={idx} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 font-mono text-xs font-bold">
                  <span
                    className={`px-2.5 py-1 rounded-lg uppercase ${
                      ep.method === 'POST'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : ep.method === 'PATCH'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                    }`}
                  >
                    {ep.method}
                  </span>
                  <span className="text-white text-sm">{ep.path}</span>
                </div>

                <button
                  onClick={() => handleCopy(ep.curl, idx)}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white hover:border-slate-700 transition-colors"
                >
                  {copiedIndex === idx ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                      Copied Curl
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5 text-indigo-400" />
                      Copy cURL
                    </>
                  )}
                </button>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">{ep.desc}</p>

              {ep.payload && (
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 font-mono text-[11px] text-purple-300">
                  <span className="text-slate-500 block mb-1 font-sans font-bold text-[10px] uppercase">
                    Request Payload Schema:
                  </span>
                  <pre>{ep.payload}</pre>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-4 border-t border-slate-800">
          <button
            onClick={onClose}
            className="rounded-2xl border border-slate-800 bg-slate-800 px-5 py-2.5 text-xs font-bold text-white hover:bg-slate-700"
          >
            Close Reference
          </button>
        </div>
      </div>
    </div>
  );
}
