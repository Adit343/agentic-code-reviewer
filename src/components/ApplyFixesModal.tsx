'use client';

import { useEffect, useState } from 'react';
import { Finding } from '@/types/domain';
import { Wrench, X, Loader2, Download, CheckCircle2, AlertTriangle, FolderGit2 } from 'lucide-react';

export interface FixOutcome {
  findingId: string;
  file: string;
  status: 'applied' | 'skipped';
  line?: number;
  reason?: string;
}

const TARGET_PATH_KEY = 'acr:fix-target-path';

export function ApplyFixesModal({
  reviewId,
  provider,
  repositorySource,
  findings,
  onClose,
  onApplied,
}: {
  reviewId: string;
  provider: 'github' | 'gitlab' | 'url' | 'local';
  repositorySource: string;
  findings: Finding[];
  onClose: () => void;
  onApplied: (appliedIds: string[]) => void;
}) {
  const isLocal = provider === 'local';
  const [targetPath, setTargetPath] = useState(() => {
    try {
      return localStorage.getItem(`${TARGET_PATH_KEY}:${repositorySource}`) || '';
    } catch {
      return '';
    }
  });
  const [busy, setBusy] = useState<'apply' | 'patch' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<FixOutcome[] | null>(null);
  const [dirtyFiles, setDirtyFiles] = useState<string[]>([]);
  const [appliedRoot, setAppliedRoot] = useState('');
  const [typeCheck, setTypeCheck] = useState<'passed' | 'unavailable' | null>(null);
  const [mismatch, setMismatch] = useState<{ error: string } | null>(null);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  async function submit(mode: 'apply' | 'patch', allowBranchMismatch = false) {
    setBusy(mode);
    setError(null);
    setMismatch(null);
    try {
      const res = await fetch(`/api/reviews/${reviewId}/apply-fixes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          findingIds: findings.map((f) => f.id),
          mode,
          targetPath: isLocal ? undefined : targetPath,
          allowBranchMismatch,
        }),
      });
      const data = await res.json();
      if (res.status === 409 && data.code === 'BRANCH_MISMATCH') {
        setMismatch({ error: data.error });
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Request failed');

      if (mode === 'patch') {
        if (!data.patch) throw new Error('No fix could be turned into a patch.');
        const url = URL.createObjectURL(new Blob([data.patch], { type: 'text/plain' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `review-${reviewId}.patch`;
        a.click();
        URL.revokeObjectURL(url);
        setOutcomes(data.outcomes);
        return;
      }

      if (!isLocal) {
        try {
          localStorage.setItem(`${TARGET_PATH_KEY}:${repositorySource}`, targetPath);
        } catch {
          // ignore
        }
      }
      setOutcomes(data.outcomes);
      setDirtyFiles(data.dirtyFiles || []);
      setAppliedRoot(data.root || '');
      setTypeCheck(data.typeCheck || null);
      const applied = (data.outcomes as FixOutcome[]).filter((o) => o.status === 'applied').map((o) => o.findingId);
      if (applied.length > 0) onApplied(applied);
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setBusy(null);
    }
  }

  const appliedCount = outcomes?.filter((o) => o.status === 'applied').length ?? 0;
  const titleOf = (id: string) => findings.find((f) => f.id === id)?.title || id;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 sm:p-6">
      <div className="relative w-full max-w-3xl max-h-[88vh] flex flex-col rounded-3xl border border-slate-700/60 bg-slate-900/95 shadow-2xl overflow-hidden">
        <div className="flex items-start justify-between border-b border-slate-800/80 p-6 shrink-0">
          <div className="space-y-1">
            <h2 className="text-xl font-extrabold text-white flex items-center gap-2.5">
              <Wrench className="h-5 w-5 text-emerald-400" />
              {outcomes ? 'Fix Results' : `Review ${findings.length} proposed fix${findings.length === 1 ? '' : 'es'}`}
            </h2>
            <p className="text-xs text-slate-400">
              Files are edited in your working tree only. Nothing is committed or pushed.
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-800/80 text-slate-400 hover:bg-slate-700 hover:text-white transition-all cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {!outcomes && (
            <>
              <div className="space-y-2">
                {findings.map((f) => (
                  <details key={f.id} className="rounded-2xl border border-slate-800 bg-slate-950/60 group" open={findings.length === 1}>
                    <summary className="cursor-pointer list-none p-3.5 flex items-center justify-between gap-3">
                      <span className="text-xs font-bold text-white">{f.title}</span>
                      <span className="text-[10px] font-mono text-slate-500 shrink-0">
                        {f.file}:{f.start_line}
                      </span>
                    </summary>
                    <div className="px-3.5 pb-3.5 space-y-2">
                      {f.fix?.note && <p className="text-xs text-slate-400">{f.fix.note}</p>}
                      <pre className="rounded-xl bg-slate-950 border border-slate-800 p-3 text-[11px] leading-relaxed overflow-x-auto">
                        {f.fix?.old_text
                          .split('\n')
                          .map((l, i) => (
                            <div key={`o${i}`} className="text-rose-300 bg-rose-500/10">{`- ${l}`}</div>
                          ))}
                        {f.fix?.new_text !== '' &&
                          f.fix?.new_text.split('\n').map((l, i) => (
                            <div key={`n${i}`} className="text-emerald-300 bg-emerald-500/10">{`+ ${l}`}</div>
                          ))}
                      </pre>
                    </div>
                  </details>
                ))}
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
                  <FolderGit2 className="h-4 w-4 text-indigo-400" />
                  {isLocal ? 'Target repository' : 'Path of your local checkout'}
                </div>
                {isLocal ? (
                  <p className="text-xs font-mono text-indigo-300 break-all">{repositorySource}</p>
                ) : (
                  <>
                    <input
                      value={targetPath}
                      onChange={(e) => setTargetPath(e.target.value)}
                      placeholder="/home/you/projects/my-repo"
                      className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-xs font-mono text-white placeholder-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      This review was run on a remote clone, so enter where the repo lives on this machine. A fix is skipped
                      if its code isn&apos;t found there exactly. Or download a <code>.patch</code> and run{' '}
                      <code>git apply</code> yourself.
                    </p>
                  </>
                )}
              </div>
            </>
          )}

          {mismatch && (
            <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-100 space-y-3">
              <div className="flex gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{mismatch.error}</span>
              </div>
              <button
                onClick={() => submit('apply', true)}
                className="rounded-xl border border-amber-500/50 bg-amber-500/20 px-3.5 py-1.5 font-bold text-amber-100 hover:bg-amber-500/30 cursor-pointer"
              >
                Apply to the current branch anyway
              </button>
            </div>
          )}

          {error && (
            <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-3.5 text-xs text-rose-200 flex gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {outcomes && (
            <div className="space-y-3">
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-200 flex gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  {appliedCount} of {outcomes.length} fix{outcomes.length === 1 ? '' : 'es'} {appliedRoot ? `written to ${appliedRoot}` : 'processed'}.
                  {appliedRoot && ' Review the changes with `git diff` and undo with `git checkout .` if needed.'}
                </span>
              </div>
              {typeCheck && (
                <div className={`rounded-2xl border p-3.5 text-xs ${typeCheck === 'passed' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-amber-500/40 bg-amber-500/10 text-amber-200'}`}>
                  {typeCheck === 'passed'
                    ? 'Type-checked with the repo\'s TypeScript: no new errors. Any fix that would have added one was rolled back.'
                    : 'Not type-checked: TypeScript (node_modules + tsconfig.json) was not found in the target repo. Run your build/tsc to confirm.'}
                </div>
              )}
              {dirtyFiles.length > 0 && (
                <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs text-amber-200">
                  These files already had uncommitted changes, so `git diff` will mix them with the fixes: {dirtyFiles.join(', ')}
                </div>
              )}
              <ul className="space-y-1.5">
                {outcomes.map((o) => (
                  <li key={o.findingId} className="rounded-xl border border-slate-800 bg-slate-950/60 px-3.5 py-2.5 text-xs flex items-start justify-between gap-3">
                    <span className="text-slate-200">
                      <span className="font-bold">{titleOf(o.findingId)}</span>
                      <span className="block font-mono text-[10px] text-slate-500">{o.file}</span>
                    </span>
                    {o.status === 'applied' ? (
                      <span className="text-emerald-400 font-bold shrink-0">Applied</span>
                    ) : (
                      <span className="text-amber-400 shrink-0 max-w-[55%] text-right">Skipped — {o.reason}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-800/80 p-5 shrink-0">
          {outcomes ? (
            <button onClick={onClose} className="rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-indigo-500 cursor-pointer">
              Done
            </button>
          ) : (
            <>
              <button onClick={onClose} className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-xs font-bold text-slate-300 hover:text-white cursor-pointer">
                Cancel
              </button>
              <button
                disabled={busy !== null}
                onClick={() => submit('patch')}
                className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-xs font-bold text-slate-200 hover:bg-slate-700 disabled:opacity-50 cursor-pointer"
              >
                {busy === 'patch' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Download .patch
              </button>
              <button
                disabled={busy !== null || (!isLocal && !targetPath.trim())}
                onClick={() => submit('apply')}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-emerald-600/20 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 cursor-pointer"
              >
                {busy === 'apply' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
                {busy === 'apply' ? 'Applying & type-checking…' : 'Apply to repo'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
