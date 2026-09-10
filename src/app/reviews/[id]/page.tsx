'use client';

import { useState, useEffect, use, useRef } from 'react';
import { Navbar } from '@/components/Navbar';
import { ReviewProgress } from '@/components/ReviewProgress';
import { FindingDetailModal } from '@/components/FindingDetailModal';
import ChatPanel from '@/components/ChatPanel';
import { CustomDropdown, DropdownOption } from '@/components/CustomDropdown';
import { Review, Finding } from '@/types/domain';
import { toast } from 'react-toastify';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  FileCode,
  RefreshCw,
  ArrowLeft,
  Search,
  Sparkles,
  Zap,
  Terminal,
  ChevronLeft,
  ChevronRight,
  Layers,
  Loader2,
  Cpu,
  RotateCcw,
} from 'lucide-react';
import Link from 'next/link';

import { ExportDropdown } from '@/components/ExportDropdown';

export default function ReviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: reviewId } = use(params);

  const [review, setReview] = useState<Review | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filters
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchFilter, setSearchFilter] = useState<string>('');

  // Pagination & Items Per Page
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(10);

  // References for deep equality state protection
  const reviewRef = useRef<Review | null>(null);
  const findingsRef = useRef<Finding[]>([]);

  reviewRef.current = review;
  findingsRef.current = findings;

  async function fetchReviewData(showToast: boolean = false) {
    if (showToast) setIsRefreshing(true);
    try {
      const res = await fetch(`/api/reviews/${reviewId}`);
      if (res.ok) {
        const data = await res.json();
        const newReview: Review = data.review;
        if (JSON.stringify(reviewRef.current) !== JSON.stringify(newReview)) {
          setReview(newReview);
        }
      }

      const fRes = await fetch(`/api/reviews/${reviewId}/findings`);
      if (fRes.ok) {
        const fData = await fRes.json();
        const newFindings: Finding[] = fData.findings || [];
        if (JSON.stringify(findingsRef.current) !== JSON.stringify(newFindings)) {
          setFindings(newFindings);
        }
      }

      if (showToast) {
        toast.success('Audit report successfully refreshed!');
      }
    } catch (err) {
      console.error('Failed to load review data:', err);
      if (showToast) toast.error('Failed to refresh audit report');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    fetchReviewData();

    const interval = setInterval(() => {
      const currentStatus = reviewRef.current?.status;
      if (currentStatus && currentStatus !== 'completed' && currentStatus !== 'failed') {
        fetchReviewData();
      }
    }, 600);

    return () => clearInterval(interval);
  }, [reviewId]);

  // Reset page when filters or items per page change
  useEffect(() => {
    setCurrentPage(1);
  }, [severityFilter, categoryFilter, searchFilter, itemsPerPage]);

  const isPipelineActive = loading || !review || (review.status !== 'completed' && review.status !== 'failed');

  const filteredFindings = findings.filter((f) => {
    if (severityFilter !== 'all' && f.severity !== severityFilter) return false;
    if (categoryFilter !== 'all' && f.category !== categoryFilter) return false;
    if (
      searchFilter &&
      !f.title.toLowerCase().includes(searchFilter.toLowerCase()) &&
      !f.file.toLowerCase().includes(searchFilter.toLowerCase()) &&
      !f.rule.toLowerCase().includes(searchFilter.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  // Pagination calculations
  const totalPages = Math.max(1, Math.ceil(filteredFindings.length / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedFindings = filteredFindings.slice(startIndex, startIndex + itemsPerPage);

  const handleStatusChange = (findingId: string, newStatus: Finding['status']) => {
    setFindings((prev) =>
      prev.map((f) => (f.id === findingId ? { ...f, status: newStatus } : f))
    );
    if (selectedFinding && selectedFinding.id === findingId) {
      setSelectedFinding({ ...selectedFinding, status: newStatus });
    }
    toast.info(`Finding status updated to "${newStatus.replace('_', ' ')}"`);
  };

  const severityOptions: DropdownOption[] = [
    { value: 'all', label: 'All Severities' },
    { value: 'critical', label: 'Critical Severity', badgeColor: 'text-rose-400' },
    { value: 'high', label: 'High Severity', badgeColor: 'text-orange-400' },
    { value: 'medium', label: 'Medium Severity', badgeColor: 'text-amber-400' },
    { value: 'low', label: 'Low / Info Severity', badgeColor: 'text-blue-400' },
  ];

  const categoryOptions: DropdownOption[] = [
    { value: 'all', label: 'All Categories' },
    { value: 'security', label: 'Security Vulnerabilities', badgeColor: 'text-rose-400' },
    { value: 'bug', label: 'Logic & Bug Defects', badgeColor: 'text-amber-400' },
    { value: 'quality', label: 'Code Quality & Smells', badgeColor: 'text-indigo-400' },
    { value: 'dependency', label: 'Dependency Advisories', badgeColor: 'text-purple-400' },
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

      <main className="flex-1 max-w-[90rem] w-full mx-auto px-8 py-8 space-y-8 transform-gpu">
        {/* Back Link & Title Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900 text-slate-400 hover:text-white hover:border-slate-700 transition-colors shadow-md hover:scale-105"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-extrabold text-white tracking-tight">{review?.repositorySource || 'Loading Repository...'}</h2>
                {review && (
                  <span className="text-xs font-mono px-3 py-1 rounded-full bg-slate-900 text-indigo-300 border border-indigo-500/30 shadow-inner">
                    {review.commitSha.slice(0, 8)}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 font-mono mt-1">Review Job Ref: {reviewId}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {review && (
              <ExportDropdown
                findings={filteredFindings}
                repoName={review.repositorySource}
                commitSha={review.commitSha}
              />
            )}

            {review && (
              <Link
                href={`/optimize?reviewId=${reviewId}&repo=${encodeURIComponent(review.repositorySource)}&provider=${review.provider}`}
                className="flex items-center justify-center gap-2 rounded-2xl border border-indigo-500/40 bg-indigo-600/20 px-5 py-2.5 text-xs font-bold text-indigo-300 hover:bg-indigo-600 hover:text-white transition-all shadow-md cursor-pointer"
              >
                <Zap className="h-4 w-4" />
                Open in Optimizer &rarr;
              </Link>
            )}

            <button
              onClick={() => fetchReviewData(true)}
              disabled={isRefreshing}
              className="flex items-center justify-center gap-2 rounded-2xl border border-slate-800 bg-slate-900 px-5 py-2.5 text-xs font-bold text-slate-300 hover:bg-slate-800 hover:text-white transition-colors shadow-md disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin text-indigo-400' : ''}`} />
              {isRefreshing ? 'Refreshing...' : 'Refresh Report'}
            </button>
          </div>
        </div>

        {/* Progress Timeline */}
        {review ? (
          <ReviewProgress
            status={review.status}
            progressPercent={review.progressPercent}
            currentPhase={review.currentPhase}
            error={review.error}
          />
        ) : (
          <div className="rounded-3xl border border-slate-800/80 bg-slate-900/40 p-6 h-32 animate-pulse" />
        )}

        {/* Failed Review Friendly Alert Card */}
        {review?.status === 'failed' && (
          <div className="relative overflow-hidden rounded-3xl border border-rose-500/40 bg-gradient-to-br from-rose-950/60 via-slate-900/90 to-rose-950/30 p-6 md:p-8 backdrop-blur-2xl shadow-2xl animate-in fade-in">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/40 shadow-inner">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-lg font-extrabold text-white flex items-center gap-2">
                    Review Pipeline Failed
                  </h3>
                  <p className="text-sm text-rose-200 font-medium leading-relaxed">
                    {review.error || 'The review could not complete because the repository could not be acquired or accessed.'}
                  </p>
                  <div className="mt-3 rounded-xl bg-slate-950/60 border border-slate-800/80 p-3.5 text-xs text-slate-300 font-sans space-y-1.5">
                    <span className="font-bold text-slate-200 block">How to resolve this:</span>
                    <ul className="list-disc list-inside space-y-1 text-slate-400">
                      <li>For <strong className="text-slate-300">Local Repositories</strong>: Ensure the directory exists on disk, is a directory, and has read permissions. Use <code className="text-indigo-300 font-mono">.</code> for the current project.</li>
                      <li>For <strong className="text-slate-300">GitHub / GitLab</strong>: Verify <code className="text-indigo-300 font-mono">owner/repo</code>, check for typos, and confirm the repository is public.</li>
                      <li>For <strong className="text-slate-300">Git URLs</strong>: Verify the HTTPS clone URL and check that the server is reachable.</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <Link
                  href="/"
                  className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-3 text-xs font-bold text-white shadow-xl shadow-indigo-600/30 hover:from-indigo-500 hover:to-purple-500 transition-all cursor-pointer"
                >
                  <RotateCcw className="h-4 w-4" />
                  Try Another Repository
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Summary Cards Grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="flex flex-col items-center justify-center text-center rounded-3xl border border-rose-500/30 bg-rose-500/10 p-5 shadow-lg backdrop-blur-xl transform-gpu">
            <span className="text-xs font-extrabold uppercase tracking-wider text-rose-400">Critical Risk</span>
            <p className="text-3xl font-extrabold text-white mt-2 font-mono">{review?.summary?.severityCounts.critical ?? 0}</p>
          </div>

          <div className="flex flex-col items-center justify-center text-center rounded-3xl border border-orange-500/30 bg-orange-500/10 p-5 shadow-lg backdrop-blur-xl transform-gpu">
            <span className="text-xs font-extrabold uppercase tracking-wider text-orange-400">High Risk</span>
            <p className="text-3xl font-extrabold text-white mt-2 font-mono">{review?.summary?.severityCounts.high ?? 0}</p>
          </div>

          <div className="flex flex-col items-center justify-center text-center rounded-3xl border border-amber-500/30 bg-amber-500/10 p-5 shadow-lg backdrop-blur-xl transform-gpu">
            <span className="text-xs font-extrabold uppercase tracking-wider text-amber-400">Medium Risk</span>
            <p className="text-3xl font-extrabold text-white mt-2 font-mono">{review?.summary?.severityCounts.medium ?? 0}</p>
          </div>

          <div className="flex flex-col items-center justify-center text-center rounded-3xl border border-blue-500/30 bg-blue-500/10 p-5 shadow-lg backdrop-blur-xl transform-gpu">
            <span className="text-xs font-extrabold uppercase tracking-wider text-blue-400">Low / Quality</span>
            <p className="text-3xl font-extrabold text-white mt-2 font-mono">
              {(review?.summary?.severityCounts.low ?? 0) + (review?.summary?.severityCounts.info ?? 0)}
            </p>
          </div>

          <div className="flex flex-col items-center justify-center text-center rounded-3xl border border-indigo-500/30 bg-indigo-500/10 p-5 shadow-lg backdrop-blur-xl transform-gpu">
            <span className="text-xs font-extrabold uppercase tracking-wider text-indigo-400">Files Affected</span>
            <p className="text-3xl font-extrabold text-white mt-2 font-mono">{review?.summary?.filesAffected ?? 0}</p>
          </div>
        </div>

        {/* Findings Dashboard Section */}
        <div className="rounded-3xl border border-slate-800/80 bg-slate-900/50 p-7 backdrop-blur-xl shadow-2xl space-y-6 transform-gpu">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-extrabold text-white flex items-center gap-2.5">
                <ShieldAlert className="h-5 w-5 text-indigo-400" />
                Verified & Candidate Findings ({filteredFindings.length})
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Evidence-backed code issues verified by multi-agent counter-evidence checking.
              </p>
            </div>

            {/* Filter controls */}
            <div className="flex flex-wrap items-center gap-3">
              {review && (
                <ExportDropdown
                  findings={filteredFindings}
                  repoName={review.repositorySource}
                  commitSha={review.commitSha}
                />
              )}

              {/* Search Bar */}
              <div className="relative min-w-[240px]">
                <Search className="h-4 w-4 absolute left-3.5 top-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search finding, rule, file..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="w-full rounded-2xl border border-slate-800 bg-slate-950/80 pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors font-mono shadow-inner"
                />
              </div>

              {/* Severity Dropdown */}
              <CustomDropdown
                options={severityOptions}
                value={severityFilter}
                onChange={setSeverityFilter}
                className="min-w-[170px]"
              />

              {/* Category Dropdown */}
              <CustomDropdown
                options={categoryOptions}
                value={categoryFilter}
                onChange={setCategoryFilter}
                className="min-w-[180px]"
              />
            </div>
          </div>

          {/* Active Pipeline Loading State vs Completed Findings Table */}
          {isPipelineActive && filteredFindings.length === 0 ? (
            <div className="rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-indigo-950/40 via-slate-950 to-purple-950/40 p-10 text-center space-y-6 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
              <div className="absolute bottom-0 left-0 -ml-16 -mb-16 h-64 w-64 rounded-full bg-purple-500/10 blur-3xl pointer-events-none" />

              <div className="relative z-10 flex flex-col items-center justify-center space-y-4">
                <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/40 shadow-xl shadow-indigo-500/20">
                  <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
                  <div className="absolute inset-0 rounded-2xl border border-indigo-400/40 animate-ping opacity-25" />
                </div>

                <div className="space-y-1.5 max-w-md mx-auto">
                  <h4 className="text-base font-extrabold text-white flex items-center justify-center gap-2">
                    <Sparkles className="h-4 w-4 text-indigo-400" />
                    Review Pipeline Actively Analyzing Repository
                  </h4>
                  <p className="text-xs font-mono text-indigo-300 bg-indigo-950/80 px-3.5 py-1 rounded-full border border-indigo-500/30 inline-block shadow-inner">
                    Current Stage: {review?.currentPhase || 'Initializing scanners & parsing AST...'}
                  </p>
                  <p className="text-[12px] text-slate-400 pt-1 leading-relaxed">
                    Deterministic SAST static checks & multi-agent AI verification are analyzing repository files. Verified findings will appear here automatically upon stage completion.
                  </p>
                </div>
              </div>

              {/* Shimmer skeleton lines representing scanning progress */}
              <div className="relative z-10 max-w-3xl mx-auto space-y-3 pt-2">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-4 rounded-2xl border border-slate-800/80 bg-slate-950/50 animate-pulse"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-5 w-16 rounded-full bg-slate-800" />
                      <div className="h-4 w-48 rounded bg-slate-800" />
                    </div>
                    <div className="h-4 w-32 rounded bg-slate-800" />
                    <div className="h-7 w-24 rounded-xl bg-slate-800" />
                  </div>
                ))}
              </div>
            </div>
          ) : filteredFindings.length === 0 ? (
            searchFilter || severityFilter !== 'all' || categoryFilter !== 'all' ? (
              <div className="p-12 text-center space-y-4 border border-dashed border-slate-800 rounded-2xl bg-slate-950/40">
                <p className="text-sm font-semibold text-slate-400">No findings match selected search query or filters.</p>
                <button
                  onClick={() => {
                    setSearchFilter('');
                    setSeverityFilter('all');
                    setCategoryFilter('all');
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-indigo-300 bg-indigo-600/20 rounded-2xl border border-indigo-500/30 hover:bg-indigo-600/30 transition-all shadow-md cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset Active Filters
                </button>
              </div>
            ) : (
              <div className="p-12 text-center space-y-3 border border-emerald-500/30 bg-gradient-to-b from-emerald-500/10 to-slate-950/60 rounded-2xl shadow-xl">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 mx-auto shadow-lg shadow-emerald-500/20">
                  <ShieldCheck className="h-8 w-8" />
                </div>
                <h4 className="text-base font-extrabold text-white">0 Security Vulnerabilities or Defects Found</h4>
                <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                  Deterministic SAST checks and counter-evidence agent verification completed cleanly with zero evidence-backed security or quality defects.
                </p>
              </div>
            )
          ) : (
            <div className="space-y-4">
              <div className="overflow-x-auto rounded-2xl border border-slate-800/80">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-800 bg-slate-950/80 text-slate-400 font-extrabold uppercase tracking-wider">
                    <tr>
                      <th className="py-4 px-4">Severity</th>
                      <th className="py-4 px-4">Category</th>
                      <th className="py-4 px-4">Finding Title & Rule</th>
                      <th className="py-4 px-4">File Location</th>
                      <th className="py-4 px-4">Confidence</th>
                      <th className="py-4 px-4">Status</th>
                      <th className="py-4 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-950/30">
                    {paginatedFindings.map((f) => (
                      <tr
                        key={f.id}
                        onClick={() => setSelectedFinding(f)}
                        className="hover:bg-slate-800/50 cursor-pointer transition-colors"
                      >
                        <td className="py-4 px-4 font-extrabold uppercase">
                          <span
                            className={`px-3 py-1 rounded-full text-[10px] tracking-wider border shadow-sm ${
                              f.severity === 'critical'
                                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                                : f.severity === 'high'
                                ? 'bg-orange-500/20 text-orange-300 border-orange-500/40'
                                : f.severity === 'medium'
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                : 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                            }`}
                          >
                            {f.severity}
                          </span>
                        </td>
                        <td className="py-4 px-4 font-bold text-slate-300 capitalize">{f.category}</td>
                        <td className="py-4 px-4 space-y-1">
                          <p className="font-bold text-white leading-tight">{f.title}</p>
                          <p className="text-[10px] font-mono text-slate-500">{f.rule}</p>
                        </td>
                        <td className="py-4 px-4 font-mono text-slate-300">
                          {f.file}:{f.start_line}
                        </td>
                        <td className="py-4 px-4 font-mono font-bold text-indigo-400">{(f.confidence * 100).toFixed(0)}%</td>
                        <td className="py-4 px-4">
                          <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 uppercase border border-slate-700">
                            {f.status}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedFinding(f);
                            }}
                            className="rounded-xl bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 px-3.5 py-1.5 text-xs font-bold hover:bg-indigo-600 hover:text-white transition-colors shadow-md"
                          >
                            Inspect Evidence
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Items Per Page Selector & Direct Page Number Pagination */}
              <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-3 border-t border-slate-800/80 px-2">
                {/* Items Per Page Control */}
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-indigo-400" />
                    Items per page:
                  </span>
                  <CustomDropdown
                    options={perPageOptions}
                    value={itemsPerPage}
                    onChange={(val) => setItemsPerPage(Number(val))}
                    direction="up"
                    className="w-28"
                  />

                  <span className="text-xs text-slate-400 font-mono">
                    Showing {startIndex + 1}-{Math.min(startIndex + itemsPerPage, filteredFindings.length)} of {filteredFindings.length}
                  </span>
                </div>

                {/* Page Number Buttons & Prev/Next Controls */}
                <div className="flex items-center gap-1.5">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-slate-800 disabled:opacity-40 transition-colors"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Prev
                  </button>

                  {/* Page Numbers */}
                  {getPageNumbers().map((pg, idx) => (
                    <button
                      key={idx}
                      disabled={pg === '...'}
                      onClick={() => typeof pg === 'number' && setCurrentPage(pg)}
                      className={`h-7 w-7 rounded-xl text-xs font-bold transition-colors flex items-center justify-center ${
                        currentPage === pg
                          ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20 border border-indigo-400/30'
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

      <FindingDetailModal
        finding={selectedFinding}
        reviewId={reviewId}
        onClose={() => setSelectedFinding(null)}
        onStatusChange={handleStatusChange}
      />

      <ChatPanel reviewId={reviewId} />
    </div>
  );
}
