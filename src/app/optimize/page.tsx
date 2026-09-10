'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Navbar } from '@/components/Navbar';
import FileTree from '@/components/FileTree';
import { OptimizationReport, OptimizationSuggestion, FileTreeNode } from '@/types/domain';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import {
  Zap,
  FolderGit2,
  GitBranch,
  Globe,
  HardDrive,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  RotateCcw,
  Sparkles,
  Copy,
  Check,
  Code2,
  TrendingUp,
  ShieldAlert,
  Layers,
} from 'lucide-react';
import { toast } from 'react-toastify';
import Link from 'next/link';

type WizardStep = 'input' | 'loading' | 'select-files' | 'analyzing' | 'report';
type Provider = 'github' | 'gitlab' | 'url' | 'local';

function OptimizerContent() {
  const searchParams = useSearchParams();

  const urlReviewId = searchParams.get('reviewId');
  const urlRepo = searchParams.get('repo');
  const urlProvider = (searchParams.get('provider') as Provider) || 'github';

  const [step, setStep] = useState<WizardStep>('input');
  const [provider, setProvider] = useState<Provider>(urlProvider);
  const [repoSource, setRepoSource] = useState<string>(urlRepo || '');
  const [optimizationId, setOptimizationId] = useState<string | null>(null);

  const [treeNodes, setTreeNodes] = useState<FileTreeNode[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

  const [report, setReport] = useState<OptimizationReport | null>(null);
  const [loadingStatus, setLoadingStatus] = useState<string>('Initializing repo scanner...');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (urlRepo) setRepoSource(urlRepo);
    if (urlProvider) setProvider(urlProvider);
  }, [urlRepo, urlProvider]);

  // Submit initial repo optimization job
  const handleStartOptimization = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoSource.trim()) {
      toast.error('Please enter a repository source');
      return;
    }

    setStep('loading');
    setLoadingStatus('Cloning repository and building snapshot...');

    try {
      const url = urlReviewId
        ? `/api/optimize?reviewId=${urlReviewId}`
        : '/api/optimize';

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repositorySource: repoSource, provider }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start optimization');

      setOptimizationId(data.optimizationId);
    } catch (err: any) {
      toast.error(err.message || 'Failed to start optimization');
      setStep('input');
    }
  };

  // Poll for job status during 'loading' step
  useEffect(() => {
    if (step !== 'loading' || !optimizationId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/optimize/${optimizationId}`);
        if (res.ok) {
          const rep: OptimizationReport = await res.json();
          if (rep.status === 'analyzing' || rep.status === 'completed') {
            clearInterval(interval);
            // Fetch file tree
            const filesRes = await fetch(`/api/optimize/${optimizationId}/files`);
            if (filesRes.ok) {
              const { tree } = await filesRes.json();
              setTreeNodes(tree);
              setStep('select-files');
            }
          } else if (rep.status === 'failed') {
            clearInterval(interval);
            toast.error(`Repository acquisition failed: ${rep.error}`);
            setStep('input');
          } else if (rep.status === 'acquiring') {
            setLoadingStatus('Acquiring repository files into workspace...');
          }
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [step, optimizationId]);

  // Handle file selection submit -> analyze
  const handleAnalyzeSelected = async () => {
    if (selectedPaths.size === 0) {
      toast.error('Please select at least 1 file to analyze');
      return;
    }

    setStep('analyzing');

    try {
      const res = await fetch(`/api/optimize/${optimizationId}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedPaths: Array.from(selectedPaths) }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to trigger analysis');
      }
    } catch (err: any) {
      toast.error(err.message || 'Analysis trigger failed');
      setStep('select-files');
    }
  };

  // Poll for report completion during 'analyzing' step
  useEffect(() => {
    if (step !== 'analyzing' || !optimizationId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/optimize/${optimizationId}`);
        if (res.ok) {
          const rep: OptimizationReport = await res.json();
          if (rep.status === 'completed') {
            clearInterval(interval);
            setReport(rep);
            setStep('report');
            toast.success('AI Optimization Report Ready!');
          } else if (rep.status === 'failed') {
            clearInterval(interval);
            toast.error(`Analysis failed: ${rep.error}`);
            setStep('select-files');
          }
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [step, optimizationId]);

  const handleCopyCode = (id: string, code?: string) => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    toast.info('Fix code copied to clipboard!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const sortedSuggestions = useMemo(() => {
    if (!report?.suggestions) return [];
    const priorityOrder: Record<string, number> = { 'quick-win': 1, 'medium-effort': 2, 'refactor': 3 };
    return [...report.suggestions].sort(
      (a, b) => (priorityOrder[a.priority] || 9) - (priorityOrder[b.priority] || 9)
    );
  }, [report]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Navbar />

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-10 space-y-8">
        {/* Page Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-lg shadow-indigo-500/10">
              <Zap className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
                AI Code Optimizer & Refactoring Suite
              </h1>
              <p className="text-xs text-slate-400">
                Targeted AI refactoring for performance, type-safety, readability, and design patterns.
              </p>
            </div>
          </div>

          {step !== 'input' && (
            <button
              onClick={() => {
                setStep('input');
                setOptimizationId(null);
                setReport(null);
              }}
              className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-slate-300 bg-slate-900 border border-slate-800 rounded-xl hover:bg-slate-800 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              New Optimization
            </button>
          )}
        </div>

        {/* STEP 1: INPUT FORM */}
        {step === 'input' && (
          <div className="max-w-2xl mx-auto bg-slate-900/60 border border-slate-800 rounded-3xl p-8 shadow-2xl backdrop-blur-xl space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-lg font-bold text-white">Select Repository Source</h2>
              <p className="text-xs text-slate-400">
                Provide a repository to scan for target optimization passes.
              </p>
            </div>

            {/* Provider Tabs */}
            <div className="grid grid-cols-4 gap-2 bg-slate-950 p-1.5 rounded-2xl border border-slate-800">
              {[
                { id: 'github', label: 'GitHub', icon: FolderGit2 },
                { id: 'gitlab', label: 'GitLab', icon: GitBranch },
                { id: 'url', label: 'Git URL', icon: Globe },
                { id: 'local', label: 'Local', icon: HardDrive },
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setProvider(tab.id as Provider)}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    provider === tab.id
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white hover:bg-slate-900'
                  }`}
                >
                  <tab.icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Form */}
            <form onSubmit={handleStartOptimization} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-300">
                  {provider === 'github' && 'GitHub Repository (owner/repo)'}
                  {provider === 'gitlab' && 'GitLab Repository (owner/repo)'}
                  {provider === 'url' && 'Public Git Repository HTTPS URL'}
                  {provider === 'local' && 'Absolute Local Directory Path'}
                </label>
                <input
                  type="text"
                  value={repoSource}
                  onChange={e => setRepoSource(e.target.value)}
                  placeholder={
                    provider === 'github' ? 'facebook/react' :
                    provider === 'gitlab' ? 'gitlab-org/gitlab' :
                    provider === 'url' ? 'https://github.com/expressjs/express.git' :
                    'c:\\Users\\project'
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-mono shadow-inner"
                  required
                />
              </div>

              {urlReviewId && (
                <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 shrink-0 text-indigo-400" />
                  <span>Reusing pre-captured snapshot from Review <strong>{urlReviewId.slice(0, 8)}</strong></span>
                </div>
              )}

              <button
                type="submit"
                className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-xl shadow-indigo-600/30 transition-all flex items-center justify-center gap-2"
              >
                <span>Start Optimization Pass</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </div>
        )}

        {/* STEP 2: LOADING */}
        {step === 'loading' && (
          <div className="max-w-xl mx-auto py-16 text-center space-y-6 bg-slate-900/40 border border-slate-800 rounded-3xl p-8 backdrop-blur-xl">
            <div className="relative flex justify-center">
              <div className="w-16 h-16 rounded-2xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-white">Acquiring Repository</h3>
              <p className="text-xs text-slate-400 font-mono">{loadingStatus}</p>
            </div>
          </div>
        )}

        {/* STEP 3: FILE SELECTION */}
        {step === 'select-files' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 border border-slate-800 p-6 rounded-3xl backdrop-blur-xl">
              <div>
                <h3 className="text-lg font-extrabold text-white flex items-center gap-2">
                  <Code2 className="w-5 h-5 text-indigo-400" />
                  Select Target Files for AI Pass
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Choose up to 20 files for deep multi-agent optimization analysis.
                </p>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <span className="text-xs font-mono text-slate-400 block">Est. Execution Time</span>
                  <span className="text-xs font-bold text-indigo-300 font-mono">
                    ~{Math.max(15, Math.ceil(selectedPaths.size / 5) * 15)} seconds
                  </span>
                </div>

                <button
                  onClick={handleAnalyzeSelected}
                  disabled={selectedPaths.size === 0}
                  className="px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold text-xs shadow-xl shadow-indigo-600/30 transition-all flex items-center gap-2"
                >
                  <span>Analyze {selectedPaths.size} Files</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <FileTree
              nodes={treeNodes}
              selectedPaths={selectedPaths}
              onSelectionChange={setSelectedPaths}
            />
          </div>
        )}

        {/* STEP 4: ANALYZING */}
        {step === 'analyzing' && (
          <div className="max-w-xl mx-auto py-16 text-center space-y-6 bg-slate-900/40 border border-slate-800 rounded-3xl p-8 backdrop-blur-xl">
            <div className="relative flex justify-center">
              <div className="w-16 h-16 rounded-2xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                <Sparkles className="w-8 h-8 animate-pulse text-indigo-400" />
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-white">Running 4-Pass AI Optimization</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Analyzing Style, Performance, Architecture, and Type-Safety across selected source files...
              </p>
            </div>
          </div>
        )}

        {/* STEP 5: REPORT */}
        {step === 'report' && report && (
          <div className="space-y-8 animate-in fade-in">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Overall Score */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 flex items-center gap-4 backdrop-blur-xl">
                <div className="relative w-16 h-16 flex items-center justify-center shrink-0">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                    <path
                      className="text-slate-800"
                      strokeWidth="3.5"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <path
                      className={report.summary.overallScore >= 80 ? 'text-emerald-400' : report.summary.overallScore >= 60 ? 'text-amber-400' : 'text-rose-400'}
                      strokeDasharray={`${report.summary.overallScore}, 100`}
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                  </svg>
                  <span className="absolute text-sm font-extrabold font-mono text-white">
                    {report.summary.overallScore}
                  </span>
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Maintainability</span>
                  <h4 className="text-base font-extrabold text-white">Cleanliness Score</h4>
                </div>
              </div>

              {/* Quick Wins */}
              <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-3xl p-6 flex items-center justify-between backdrop-blur-xl">
                <div>
                  <span className="text-xs font-extrabold text-emerald-400 uppercase tracking-wider">Quick Wins</span>
                  <p className="text-3xl font-extrabold text-white font-mono mt-1">{report.summary.quickWins}</p>
                </div>
                <div className="p-3 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
              </div>

              {/* Medium Effort */}
              <div className="bg-amber-950/20 border border-amber-500/30 rounded-3xl p-6 flex items-center justify-between backdrop-blur-xl">
                <div>
                  <span className="text-xs font-extrabold text-amber-400 uppercase tracking-wider">Medium Effort</span>
                  <p className="text-3xl font-extrabold text-white font-mono mt-1">{report.summary.mediumEffort}</p>
                </div>
                <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  <TrendingUp className="w-6 h-6" />
                </div>
              </div>

              {/* Refactors */}
              <div className="bg-rose-950/20 border border-rose-500/30 rounded-3xl p-6 flex items-center justify-between backdrop-blur-xl">
                <div>
                  <span className="text-xs font-extrabold text-rose-400 uppercase tracking-wider">Refactors</span>
                  <p className="text-3xl font-extrabold text-white font-mono mt-1">{report.summary.refactors}</p>
                </div>
                <div className="p-3 rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  <AlertTriangle className="w-6 h-6" />
                </div>
              </div>
            </div>

            {/* Suggestion Cards */}
            <div className="space-y-6">
              <h3 className="text-xl font-extrabold text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-400" />
                Optimization Suggestions ({sortedSuggestions.length})
              </h3>

              {sortedSuggestions.length === 0 ? (
                <div className="p-12 text-center border border-slate-800 rounded-3xl bg-slate-900/40 text-slate-400">
                  No optimization suggestions for the selected files. Code looks clean!
                </div>
              ) : (
                sortedSuggestions.map((sug) => (
                  <div
                    key={sug.id}
                    className="bg-slate-900/60 border border-slate-800/80 rounded-3xl p-6 backdrop-blur-xl space-y-5"
                  >
                    {/* Header line */}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${
                            sug.priority === 'quick-win'
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              : sug.priority === 'medium-effort'
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                              : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                          }`}
                        >
                          {sug.priority.replace('-', ' ')}
                        </span>
                        <span className="px-3 py-1 rounded-full text-[10px] font-mono bg-slate-800 text-indigo-300 border border-slate-700">
                          {sug.category}
                        </span>
                      </div>

                      <span className="text-xs font-mono text-slate-400">
                        {sug.file} (Lines {sug.start_line}–{sug.end_line})
                      </span>
                    </div>

                    {/* Title & Explanation */}
                    <div className="space-y-1.5">
                      <h4 className="text-base font-bold text-white">{sug.title}</h4>
                      <p className="text-xs text-slate-300 leading-relaxed">{sug.explanation}</p>
                    </div>

                    {/* Before / After side by side */}
                    {(sug.before_code || sug.after_code) && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                        {/* BEFORE */}
                        <div className="space-y-2">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-rose-400 block">
                            BEFORE
                          </span>
                          <div className="rounded-2xl overflow-hidden border border-slate-800 text-xs">
                            <SyntaxHighlighter
                              language="typescript"
                              style={vscDarkPlus}
                              customStyle={{ margin: 0, padding: '1rem', background: '#090d16' }}
                            >
                              {sug.before_code || '// No code snippet'}
                            </SyntaxHighlighter>
                          </div>
                        </div>

                        {/* AFTER */}
                        <div className="space-y-2">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 block">
                            AFTER
                          </span>
                          <div className="rounded-2xl overflow-hidden border border-slate-800 text-xs">
                            <SyntaxHighlighter
                              language="typescript"
                              style={vscDarkPlus}
                              customStyle={{ margin: 0, padding: '1rem', background: '#090d16' }}
                            >
                              {sug.after_code || '// No code snippet'}
                            </SyntaxHighlighter>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Footer / Impact & Copy Button */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-800/60">
                      <div className="text-xs text-slate-400">
                        <strong className="text-slate-300">Estimated Impact:</strong> {sug.estimated_impact}
                      </div>

                      {sug.after_code && (
                        <button
                          onClick={() => handleCopyCode(sug.id, sug.after_code)}
                          className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-600 hover:text-white transition-all text-xs font-bold shrink-0"
                        >
                          {copiedId === sug.id ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy Fix Code</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function OptimizerPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
      </div>
    }>
      <OptimizerContent />
    </Suspense>
  );
}
