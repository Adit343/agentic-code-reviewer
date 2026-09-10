'use client';

import Link from 'next/link';
import { ShieldCheck, Terminal, Sparkles } from 'lucide-react';
import { useState, useEffect } from 'react';

export function Navbar() {
  const [health, setHealth] = useState<{ status: string; engineMode: string } | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => setHealth(data))
      .catch(() => setHealth(null));
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[90rem] items-center justify-between px-8 py-5.5">
        <Link href="/" className="group flex items-center gap-4 transition-transform hover:scale-[1.01]">
          <div className="relative flex h-13 w-13 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/20 via-purple-500/20 to-pink-500/20 text-indigo-400 border border-indigo-500/30 shadow-lg shadow-indigo-500/10 group-hover:border-indigo-400/50">
            <ShieldCheck className="h-7 w-7 text-indigo-400 transition-transform group-hover:scale-110" />
            <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-slate-950"></span>
            </span>
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg font-extrabold tracking-tight text-white flex items-center gap-2">
                Agentic Reviewer
              </h1>
              <span className="rounded-full bg-gradient-to-r from-indigo-500/20 to-purple-500/20 px-3 py-0.5 text-xs font-bold text-indigo-300 border border-indigo-500/30">
                REAL SAST + AGENTS
              </span>
            </div>
            <p className="text-xs font-medium text-slate-400 flex items-center gap-1.5 mt-0.5">
              <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
              Deterministic SAST Engine & LangGraph AI
            </p>
          </div>
        </Link>

        {/* Right Action Menu */}
        <div className="flex items-center gap-5">
          <div className="hidden sm:flex items-center gap-2.5 rounded-full border border-slate-800/80 bg-slate-900/80 px-4.5 py-2 text-xs font-medium">
            <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50 animate-pulse" />
            <span className="text-slate-300">SAST Security Engine:</span>
            <span className="text-emerald-400 font-bold uppercase tracking-wider text-xs">
              {health?.status === 'ok' ? 'ACTIVE & AUDITING' : 'READY'}
            </span>
          </div>

          <nav className="flex items-center gap-2.5">
            <Link
              href="/"
              className="flex items-center gap-2.5 rounded-2xl px-5 py-2.5 text-sm font-bold text-slate-300 hover:text-white hover:bg-slate-900 transition-all border border-transparent hover:border-slate-800"
            >
              <Terminal className="h-4.5 w-4.5 text-indigo-400" />
              Dashboard
            </Link>

            <Link
              href="/optimize"
              className="flex items-center gap-2.5 rounded-2xl px-5 py-2.5 text-sm font-bold text-indigo-300 hover:text-white hover:bg-indigo-950/60 transition-all border border-indigo-500/30 hover:border-indigo-500/50 shadow-md shadow-indigo-600/10"
            >
              <Sparkles className="h-4.5 w-4.5 text-indigo-400" />
              ⚡ Optimizer
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
}
