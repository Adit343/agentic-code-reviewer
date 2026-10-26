import fs from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const SCRIPT_FILE = /\.(tsx?|jsx?|mjs|cjs)$/i;

let tsModule: Promise<typeof import('typescript') | null> | null = null;
function loadTypescript() {
  tsModule ??= import('typescript').then((m) => ((m as any).default ?? m) as typeof import('typescript')).catch(() => null);
  return tsModule;
}

/** True when `after` has more syntax errors than `before` (a fix must never make a file unparseable). */
export async function introducesSyntaxErrors(file: string, before: string, after: string): Promise<boolean> {
  if (!SCRIPT_FILE.test(file)) return false;
  const ts = await loadTypescript();
  if (!ts) return false;
  const count = (text: string) =>
    ts.transpileModule(text, {
      fileName: file,
      reportDiagnostics: true,
      compilerOptions: { jsx: ts.JsxEmit.Preserve, allowJs: true },
    }).diagnostics?.length ?? 0;
  return count(after) > count(before);
}

export interface TscDiagnostic {
  file: string;
  key: string;
  text: string;
}

export interface TypeChecker {
  run(): Promise<TscDiagnostic[] | null>;
}

const TSC_LINE = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/;

/**
 * Type-checks the target repo with its own TypeScript install. Returns null when the repo has no
 * tsconfig/tsc, or the check can't finish, so callers can say "not type-checked" instead of guessing.
 */
export async function createTypeChecker(root: string, timeoutMs = 120_000): Promise<TypeChecker | null> {
  const tsc = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
  const tsconfig = path.join(root, 'tsconfig.json');
  const exists = (p: string) => fs.access(p).then(() => true, () => false);
  if (!(await exists(tsc)) || !(await exists(tsconfig))) return null;

  return {
    async run() {
      let out = '';
      try {
        const res = await execFileAsync(process.execPath, [tsc, '--noEmit', '--pretty', 'false', '-p', 'tsconfig.json'], {
          cwd: root,
          timeout: timeoutMs,
          maxBuffer: 64 * 1024 * 1024,
        });
        out = res.stdout;
      } catch (err: any) {
        // tsc exits non-zero whenever there are type errors — that is still a usable result.
        if (err.killed || typeof err.stdout !== 'string') return null;
        out = err.stdout;
      }
      const diagnostics: TscDiagnostic[] = [];
      for (const line of out.split('\n')) {
        const m = TSC_LINE.exec(line.trim());
        if (!m) continue;
        const file = m[1].replace(/\\/g, '/');
        // Line numbers shift when code is edited, so identify an error by file + code + message.
        diagnostics.push({ file, key: `${file}|${m[4]}|${m[5]}`, text: `${file}:${m[2]} ${m[4]}: ${m[5]}` });
      }
      return diagnostics;
    },
  };
}

/** Errors present in `after` beyond what `baseline` already had (multiset difference). */
export function newDiagnostics(after: TscDiagnostic[], baseline: TscDiagnostic[]): TscDiagnostic[] {
  const budget = new Map<string, number>();
  for (const d of baseline) budget.set(d.key, (budget.get(d.key) || 0) + 1);
  const fresh: TscDiagnostic[] = [];
  for (const d of after) {
    const left = budget.get(d.key) || 0;
    if (left > 0) budget.set(d.key, left - 1);
    else fresh.push(d);
  }
  return fresh;
}
