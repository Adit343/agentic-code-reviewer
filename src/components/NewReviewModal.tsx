'use client';

import { useState, useEffect } from 'react';
import { GitBranch, Code2, FolderGit2, Globe, Shield, Loader2, Play, Sparkles, FolderOpen } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-toastify';

export function NewReviewModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const router = useRouter();
  const [provider, setProvider] = useState<'github' | 'gitlab' | 'url' | 'local'>('local');
  const [source, setSource] = useState('/home/adit/Desktop/Learning/agentic-code-reviewer');
  const [commitSha, setCommitSha] = useState('');
  const [branch, setBranch] = useState('main');
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repositorySource: source,
          provider,
          commitSha: commitSha || undefined,
          branch: branch || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to trigger review job');
      }

      toast.success('Audit pipeline initiated successfully!');
      onClose();
      router.push(`/reviews/${data.id}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to initiate review');
    } finally {
      setIsSubmitting(false);
    }
  }

  const setPreset = (type: 'current' | 'express' | 'react') => {
    if (type === 'current') {
      setProvider('local');
      setSource('/home/adit/Desktop/Learning/agentic-code-reviewer');
    } else if (type === 'express') {
      setProvider('github');
      setSource('expressjs/express');
    } else if (type === 'react') {
      setProvider('github');
      setSource('facebook/react');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-slate-700/60 bg-slate-900/90 p-7 shadow-2xl shadow-indigo-950/40 backdrop-blur-2xl">
        {/* Glow ambient background accent */}
        <div className="absolute -top-24 -right-24 h-48 w-48 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 h-48 w-48 rounded-full bg-purple-500/10 blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="relative flex items-center justify-between border-b border-slate-800/80 pb-5 mb-6">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 text-indigo-400 border border-indigo-500/30 shadow-inner">
              <Shield className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
                Initiate Code Review
              </h2>
              <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                <Sparkles className="h-3 w-3 text-indigo-400" />
                Select repository source & commit revision
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="relative space-y-6">
          {/* Presets */}
          <div>
            <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
              Quick Preset Samples
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPreset('current')}
                className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-indigo-500/50 hover:text-white transition-colors cursor-pointer"
              >
                <FolderOpen className="h-3.5 w-3.5 text-indigo-400" />
                Current Project
              </button>
              <button
                type="button"
                onClick={() => setPreset('express')}
                className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-indigo-500/50 hover:text-white transition-colors cursor-pointer"
              >
                <Code2 className="h-3.5 w-3.5 text-purple-400" />
                expressjs/express
              </button>
              <button
                type="button"
                onClick={() => setPreset('react')}
                className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-indigo-500/50 hover:text-white transition-colors cursor-pointer"
              >
                <Code2 className="h-3.5 w-3.5 text-cyan-400" />
                facebook/react
              </button>
            </div>
          </div>

          {/* Provider Selector */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
              Repository Provider Source
            </label>
            <div className="grid grid-cols-4 gap-2.5">
              {[
                { id: 'local', label: 'Local Directory', icon: FolderGit2 },
                { id: 'github', label: 'GitHub', icon: Code2 },
                { id: 'gitlab', label: 'GitLab', icon: GitBranch },
                { id: 'url', label: 'Git URL', icon: Globe },
              ].map((item) => {
                const Icon = item.icon;
                const isSelected = provider === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setProvider(item.id as any)}
                    className={`flex flex-col items-center justify-center gap-2 rounded-2xl border p-3.5 text-xs font-bold transition-all cursor-pointer ${
                      isSelected
                        ? 'border-indigo-500 bg-gradient-to-b from-indigo-500/20 to-indigo-600/10 text-white shadow-lg shadow-indigo-500/20'
                        : 'border-slate-800 bg-slate-950/50 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    <Icon className={`h-5 w-5 ${isSelected ? 'text-indigo-400' : 'text-slate-500'}`} />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Input Source */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
              {provider === 'local' ? 'Absolute Local Repository Path' : 'Repository URL or Name (owner/repo)'}
            </label>
            <input
              type="text"
              required
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder={
                provider === 'local'
                  ? '/path/to/local/repository'
                  : provider === 'github'
                  ? 'org/repo or https://github.com/org/repo'
                  : 'https://gitlab.com/org/repo'
              }
              className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white placeholder-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-mono"
            />
          </div>

          {/* Revision controls */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                Commit SHA (Optional)
              </label>
              <input
                type="text"
                value={commitSha}
                onChange={(e) => setCommitSha(e.target.value)}
                placeholder="e.g. HEAD or 8f31a92"
                className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white placeholder-slate-600 focus:border-indigo-500 focus:outline-none font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                Branch Ref
              </label>
              <input
                type="text"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                placeholder="main"
                className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white placeholder-slate-600 focus:border-indigo-500 focus:outline-none font-mono"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-5 border-t border-slate-800/80">
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border border-slate-800 bg-slate-900 px-5 py-2.5 text-xs font-bold text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-2.5 text-xs font-bold text-white hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 transition-colors shadow-xl shadow-indigo-600/20 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Orchestrating...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 fill-current" />
                  Launch Review Pipeline
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
