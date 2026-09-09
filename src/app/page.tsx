'use client';

import { useState, useEffect, useRef } from 'react';
import { Navbar } from '@/components/Navbar';
import { NewReviewModal } from '@/components/NewReviewModal';
import { CustomDropdown, DropdownOption } from '@/components/CustomDropdown';
import { Review } from '@/types/domain';
import {
  ShieldCheck,
  Play,
  Terminal,
  GitBranch,
  ArrowRight,
  ShieldAlert,
  Cpu,
  CheckCircle2,
  Sparkles,
  Search,
  ChevronLeft,
  ChevronRight,
  Layers,
} from 'lucide-react';
import Link from 'next/link';

export default function DashboardPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Pagination for Jobs & Items Per Page
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [jobsPerPage, setJobsPerPage] = useState<number>(10);

  const reviewsRef = useRef<Review[]>([]);
  reviewsRef.current = reviews;

  async function fetchReviews() {
    try {
      const res = await fetch('/api/reviews');
      const data = await res.json();
      if (Array.isArray(data)) {
        if (JSON.stringify(reviewsRef.current) !== JSON.stringify(data)) {
          setReviews(data);
        }
      }
    } catch (err) {
      console.error('Failed to fetch reviews:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchReviews();
    const interval = setInterval(fetchReviews, 4000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, jobsPerPage]);

  const totalReviews = reviews.length;
  const completedReviews = reviews.filter((r) => r.status === 'completed').length;
  const totalFindingsCount = reviews.reduce((acc, r) => acc + (r.summary?.totalFindings || 0), 0);

  const filteredReviews = reviews.filter((r) => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (search && !r.repositorySource.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredReviews.length / jobsPerPage));
  const startIndex = (currentPage - 1) * jobsPerPage;
  const paginatedReviews = filteredReviews.slice(startIndex, startIndex + jobsPerPage);

  const statusOptions: DropdownOption[] = [
    { value: 'all', label: 'All Statuses' },
    { value: 'completed', label: 'Completed', badgeColor: 'text-emerald-400' },
    { value: 'agent_review', label: 'In Agent Review', badgeColor: 'text-indigo-400' },
    { value: 'queued', label: 'Queued', badgeColor: 'text-amber-400' },
    { value: 'failed', label: 'Failed', badgeColor: 'text-rose-400' },
  ];

  const perPageOptions: DropdownOption[] = [
    { value: 5, label: '5 items' },
    { value: 10, label: '10 items' },
    { value: 20, label: '20 items' },
    { value: 50, label: '50 items' },
  ];

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (currentPage <= 4) {
        pages.push(1, 2, 3, 4, 5, '...', totalPages);
      } else if (currentPage >= totalPages - 3) {
        pages.push(1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
      } else {
        pages.push(1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages);
      }
    }
    return pages;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      <Navbar />

      <main className="flex-1 max-w-[90rem] w-full mx-auto px-8 py-10 space-y-10">
        {/* Glassmorphic Hero Banner */}
        <div className="relative overflow-hidden rounded-3xl border border-slate-700/60 bg-gradient-to-br from-slate-900/90 via-slate-900/60 to-indigo-950/30 p-8 md:p-10 shadow-2xl backdrop-blur-2xl">
          {/* Ambient Glows */}
          <div className="absolute top-0 right-0 -mr-16 -mt-16 h-72 w-72 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 -ml-16 -mb-16 h-72 w-72 rounded-full bg-purple-500/10 blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
            <div className="space-y-4 max-w-2xl">
              <span className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-500/15 to-purple-500/15 px-4 py-1.5 text-xs font-bold text-indigo-300 border border-indigo-500/30 shadow-inner">
                <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                SECURITY-FOCUSED AGENTIC PLATFORM
              </span>
              <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-5xl leading-tight">
                Full-Codebase & Commit-Aware Code Review
              </h2>
              <p className="text-sm text-slate-300 leading-relaxed font-normal">
                Submit local repositories, GitHub, GitLab, or commit SHAs for deterministic SAST scanning, AST code intelligence, multi-agent reasoning, and false-positive verification.
              </p>
            </div>

            <button
              onClick={() => setIsModalOpen(true)}
              className="group relative flex items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 px-7 py-4 text-sm font-bold text-white shadow-2xl shadow-indigo-600/30 hover:from-indigo-500 hover:to-purple-500 transition-all hover:scale-[1.03] active:scale-95 cursor-pointer"
            >
              <Play className="h-4 w-4 fill-current transition-transform group-hover:scale-110" />
              Start New Review
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="relative overflow-hidden rounded-3xl border border-slate-800/80 bg-slate-900/50 p-6 backdrop-blur-xl transition-all hover:border-slate-700">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Reviews Run</span>
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                <Terminal className="h-5 w-5" />
              </div>
            </div>
            <p className="text-4xl font-extrabold text-white mt-4 font-mono">{totalReviews}</p>
          </div>

          <div className="relative overflow-hidden rounded-3xl border border-slate-800/80 bg-slate-900/50 p-6 backdrop-blur-xl transition-all hover:border-slate-700">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Completed Reports</span>
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 className="h-5 w-5" />
              </div>
            </div>
            <p className="text-4xl font-extrabold text-emerald-400 mt-4 font-mono">{completedReviews}</p>
          </div>

          <div className="relative overflow-hidden rounded-3xl border border-slate-800/80 bg-slate-900/50 p-6 backdrop-blur-xl transition-all hover:border-slate-700">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Verified Findings</span>
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <ShieldAlert className="h-5 w-5" />
              </div>
            </div>
            <p className="text-4xl font-extrabold text-rose-400 mt-4 font-mono">{totalFindingsCount}</p>
          </div>
        </div>

        {/* Reviews Dashboard List */}
        <div className="rounded-3xl border border-slate-800/80 bg-slate-900/50 p-7 backdrop-blur-xl shadow-2xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-extrabold text-white flex items-center gap-2.5">
                <GitBranch className="h-5 w-5 text-indigo-400" />
                Repository Audit Jobs ({filteredReviews.length})
              </h3>
              <p className="text-xs text-slate-400 mt-1">Live status updates & findings reports</p>
            </div>

            {/* Controls */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-[240px]">
                <Search className="h-4 w-4 absolute left-3.5 top-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter by repository..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-2xl border border-slate-800 bg-slate-950/80 pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-mono shadow-inner"
                />
              </div>

              {/* Custom Status Dropdown */}
              <CustomDropdown
                options={statusOptions}
                value={statusFilter}
                onChange={setStatusFilter}
                className="min-w-[160px]"
              />
            </div>
          </div>

          {loading ? (
            <div className="p-12 text-center text-sm font-semibold text-slate-500">Loading audit history...</div>
          ) : filteredReviews.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-800 p-12 text-center space-y-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-800/60 text-slate-500 mx-auto">
                <Cpu className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-300">No review jobs match criteria.</p>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                  Click "Start New Review" to submit a repository path, URL, or commit SHA for analysis.
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 px-5 py-2.5 text-xs font-bold hover:bg-indigo-600/30 transition-all shadow-lg"
              >
                Run First Audit
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-3">
                {paginatedReviews.map((rev) => (
                  <div
                    key={rev.id}
                    className="group flex flex-col sm:flex-row sm:items-center justify-between p-5 rounded-2xl border border-slate-800/80 bg-slate-950/40 hover:bg-slate-800/40 hover:border-indigo-500/30 transition-all duration-200 gap-4"
                  >
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="font-mono text-sm font-extrabold text-white group-hover:text-indigo-300 transition-colors">
                          {rev.repositorySource}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 uppercase">
                          {rev.provider}
                        </span>
                        <span className="text-xs font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded-md border border-slate-800">
                          SHA: {rev.commitSha.slice(0, 7)}
                        </span>
                      </div>
                      {rev.status === 'failed' && rev.error ? (
                        <p className="text-xs text-rose-300 font-medium flex items-center gap-1.5 line-clamp-1">
                          <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-rose-400" />
                          <span>{rev.error}</span>
                        </p>
                      ) : (
                        <p className="text-xs text-slate-400 font-mono">{rev.currentPhase}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-4">
                      <span
                        className={`px-3.5 py-1.5 rounded-full text-xs font-extrabold shadow-sm ${
                          rev.status === 'completed'
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : rev.status === 'failed'
                            ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                            : 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 animate-pulse'
                        }`}
                      >
                        {rev.status.toUpperCase()} ({rev.progressPercent}%)
                      </span>

                      <Link
                        href={`/reviews/${rev.id}`}
                        className="flex items-center gap-2 rounded-2xl border border-slate-700/80 bg-slate-800/80 px-4 py-2 text-xs font-bold text-slate-200 hover:bg-indigo-600 hover:border-indigo-500 hover:text-white transition-all shadow-md group-hover:scale-[1.02]"
                      >
                        View Report
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>

              {/* Jobs Pagination & Custom Items Per Page Dropdown */}
              <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-3 border-t border-slate-800/80 px-2">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-indigo-400" />
                    Items per page:
                  </span>
                  <CustomDropdown
                    options={perPageOptions}
                    value={jobsPerPage}
                    onChange={(val) => setJobsPerPage(Number(val))}
                    direction="up"
                    className="w-28"
                  />
                  <span className="text-xs text-slate-400 font-mono">
                    Showing {startIndex + 1}-{Math.min(startIndex + jobsPerPage, filteredReviews.length)} of {filteredReviews.length}
                  </span>
                </div>

                {/* Page Number Buttons */}
                <div className="flex items-center gap-1.5">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-slate-800 disabled:opacity-40 transition-colors"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Prev
                  </button>

                  {getPageNumbers().map((pg, idx) => (
                    <button
                      key={idx}
                      disabled={pg === '...'}
                      onClick={() => typeof pg === 'number' && setCurrentPage(pg)}
                      className={`h-7 w-7 rounded-xl text-xs font-bold transition-all flex items-center justify-center ${
                        currentPage === pg
                          ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20 scale-105 border border-indigo-400/30'
                          : pg === '...'
                          ? 'text-slate-600 cursor-default'
                          : 'border border-slate-800 bg-slate-950 text-slate-300 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      {pg}
                    </button>
                  ))}

                  <button
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-slate-800 disabled:opacity-40 transition-colors"
                  >
                    Next
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      <NewReviewModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  );
}
