'use client';

import Link from 'next/link';
import { ShieldCheck, Terminal, Sparkles, Activity } from 'lucide-react';
import { useState, useEffect } from 'react';
import { ApiSpecsModal } from './ApiSpecsModal';

export function Navbar() {
  const [health, setHealth] = useState<{ status: string; engineMode: string } | null>(null);
  const [isSpecsOpen, setIsSpecsOpen] = useState(false);

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => setHealth(data))
      .catch(() => setHealth(null));
  }, []);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[90rem] items-center justify-between px-8 py-4">
          <Link href="/" className="group flex items-center gap-3.5 transition-transform hover:scale-[1.01]">
            <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/20 via-purple-500/20 to-pink-500/20 text-indigo-400 border border-indigo-500/30 shadow-lg shadow-indigo-500/10 group-hover:border-indigo-400/50">
              <ShieldCheck className="h-6 w-6 text-indigo-400 transition-transform group-hover:scale-110" />
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-extrabold tracking-tight text-white flex items-center gap-2">
                  Agentic Reviewer
                </h1>
                <span className="rounded-full bg-gradient-to-r from-indigo-500/20 to-purple-500/20 px-2.5 py-0.5 text-[10px] font-bold text-indigo-300 border border-indigo-500/30">
                  REAL SAST + AGENTS
                </span>
              </div>
              <p className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5 mt-0.5">
                <Sparkles className="h-3 w-3 text-indigo-400" />
                Deterministic SAST Engine & LangGraph AI
              </p>
            </div>
          </Link>

          {/* Right Action Menu */}
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2.5 rounded-full border border-slate-800/80 bg-slate-900/60 px-4 py-1.5 text-xs">
              <span className="flex h-2 w-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />
              <span className="text-slate-300 font-medium">SAST Security Engine:</span>
              <span className="text-emerald-400 font-bold uppercase tracking-wider text-[10px]">
                {health?.status === 'ok' ? 'ACTIVE & AUDITING' : 'READY'}
              </span>
            </div>

            <nav className="flex items-center gap-2">
              <Link
                href="/"
                className="flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-900/80 transition-all border border-transparent hover:border-slate-800"
              >
                <Terminal className="h-4 w-4 text-indigo-400" />
                Dashboard
              </Link>

              <button
                type="button"
                onClick={() => setIsSpecsOpen(true)}
                className="flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-900/80 transition-all border border-transparent hover:border-slate-800 cursor-pointer"
              >
                <Activity className="h-4 w-4 text-purple-400" />
                API Specs
              </button>
            </nav>
          </div>
        </div>
      </header>

      <ApiSpecsModal isOpen={isSpecsOpen} onClose={() => setIsSpecsOpen(false)} />
    </>
  );
}
