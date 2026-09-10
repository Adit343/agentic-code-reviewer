'use client';

import { useState, useRef, useEffect } from 'react';
import { Download, FileSpreadsheet, FileText, FileCode, Printer, ChevronDown } from 'lucide-react';
import { Finding } from '@/types/domain';
import { exportToCSV, exportToPDF, exportToDOCX, exportToJSON } from '@/utils/exportFindings';
import { toast } from 'react-toastify';

export function ExportDropdown({
  findings,
  repoName,
  commitSha,
  className = '',
}: {
  findings: Finding[];
  repoName: string;
  commitSha: string;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleExport = (format: 'csv' | 'pdf' | 'docx' | 'json') => {
    if (findings.length === 0) {
      toast.warning('No findings available to export.');
      setIsOpen(false);
      return;
    }

    try {
      if (format === 'csv') {
        exportToCSV(findings, repoName, commitSha);
        toast.success(`Exported ${findings.length} findings to CSV`);
      } else if (format === 'pdf') {
        exportToPDF(findings, repoName, commitSha);
        toast.success(`Exported ${findings.length} findings to PDF`);
      } else if (format === 'docx') {
        exportToDOCX(findings, repoName, commitSha);
        toast.success(`Exported ${findings.length} findings to Word (.docx)`);
      } else if (format === 'json') {
        exportToJSON(findings, repoName, commitSha);
        toast.success(`Exported ${findings.length} findings to JSON`);
      }
    } catch (err) {
      console.error('Failed to export findings:', err);
      toast.error('Failed to generate export file.');
    } finally {
      setIsOpen(false);
    }
  };

  return (
    <div ref={dropdownRef} className={`relative inline-block text-left z-30 ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={findings.length === 0}
        className="flex items-center gap-2 rounded-2xl border border-emerald-500/40 bg-emerald-600/20 px-4 py-2.5 text-xs font-bold text-emerald-300 hover:bg-emerald-600 hover:text-white transition-all shadow-md cursor-pointer disabled:opacity-50"
      >
        <Download className="h-4 w-4" />
        <span>Export Findings ({findings.length})</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 rounded-2xl border border-slate-700/80 bg-slate-900/95 p-2 shadow-2xl backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-150 z-50">
          <div className="px-3 py-2 border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Download Format Options
          </div>
          <div className="pt-1.5 space-y-1">
            <button
              onClick={() => handleExport('csv')}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-200 hover:bg-emerald-500/20 hover:text-emerald-300 transition-colors cursor-pointer"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
              <div className="text-left">
                <div>Export as CSV (.csv)</div>
                <div className="text-[10px] text-slate-400 font-normal">Spreadsheet tabular format</div>
              </div>
            </button>

            <button
              onClick={() => handleExport('pdf')}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-200 hover:bg-rose-500/20 hover:text-rose-300 transition-colors cursor-pointer"
            >
              <FileText className="h-4 w-4 text-rose-400" />
              <div className="text-left">
                <div>Export as PDF (.pdf)</div>
                <div className="text-[10px] text-slate-400 font-normal">Download PDF audit document</div>
              </div>
            </button>

            <button
              onClick={() => handleExport('docx')}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-200 hover:bg-blue-500/20 hover:text-blue-300 transition-colors cursor-pointer"
            >
              <FileText className="h-4 w-4 text-blue-400" />
              <div className="text-left">
                <div>Export as Word (.docx)</div>
                <div className="text-[10px] text-slate-400 font-normal">Microsoft Word Document</div>
              </div>
            </button>

            <button
              onClick={() => handleExport('json')}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-200 hover:bg-indigo-500/20 hover:text-indigo-300 transition-colors cursor-pointer"
            >
              <FileCode className="h-4 w-4 text-indigo-400" />
              <div className="text-left">
                <div>Export as JSON (.json)</div>
                <div className="text-[10px] text-slate-400 font-normal">Raw structured audit data</div>
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
