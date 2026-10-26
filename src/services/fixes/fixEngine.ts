import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { Finding, FindingFix } from '@/types/domain';
import { createTypeChecker, introducesSyntaxErrors, newDiagnostics } from './verify';

const execFileAsync = promisify(execFile);

export type LocateResult =
  | { ok: true; index: number; line: number; oldText: string; newText: string }
  | { ok: false; reason: string };

function toEol(text: string, eol: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\n/g, eol);
}

/** Find the single place in `content` that the fix targets. Line numbers are never trusted. */
export function locateFix(content: string, fix: FindingFix): LocateResult {
  if (!fix.old_text) return { ok: false, reason: 'Fix has no text to replace.' };
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const oldText = toEol(fix.old_text, eol);
  const newText = toEol(fix.new_text, eol);

  const index = content.indexOf(oldText);
  if (index === -1) {
    return { ok: false, reason: 'Code to replace was not found — the file has changed since the review.' };
  }
  if (content.indexOf(oldText, index + 1) !== -1) {
    return { ok: false, reason: 'Code to replace matches more than one place in the file.' };
  }
  const line = content.slice(0, index).split('\n').length;
  return { ok: true, index, line, oldText, newText };
}

/** Returns an error message if the edited content is obviously broken, otherwise null. */
export function validateEditedContent(file: string, content: string): string | null {
  if (file.toLowerCase().endsWith('.json')) {
    try {
      JSON.parse(content);
    } catch {
      return 'Applying this fix would make the JSON file invalid.';
    }
  }
  return null;
}

export function applyFixToContent(
  file: string,
  content: string,
  fix: FindingFix
): { ok: true; content: string; line: number } | { ok: false; reason: string } {
  const loc = locateFix(content, fix);
  if (!loc.ok) return loc;
  const next = content.slice(0, loc.index) + loc.newText + content.slice(loc.index + loc.oldText.length);
  const invalid = validateEditedContent(file, next);
  if (invalid) return { ok: false, reason: invalid };
  return { ok: true, content: next, line: loc.line };
}

/** Human-readable -/+ rendering of a fix, used for previews and the legacy suggested_patch field. */
export function renderFixDiff(file: string, line: number | undefined, fix: FindingFix): string {
  const minus = fix.old_text.replace(/\r\n/g, '\n').split('\n').map((l) => `- ${l}`);
  const plus = fix.new_text === '' ? [] : fix.new_text.replace(/\r\n/g, '\n').split('\n').map((l) => `+ ${l}`);
  const header = `${file}${line ? `:${line}` : ''}`;
  return [header, ...minus, ...plus].join('\n');
}

export type FixOutcome =
  | { findingId: string; file: string; status: 'applied'; line: number }
  | { findingId: string; file: string; status: 'skipped'; reason: string };

/** Resolve `file` under `root`, refusing anything that escapes it (traversal or symlink). */
async function resolveInsideRoot(root: string, file: string): Promise<string> {
  const realRoot = await fs.realpath(root);
  const target = path.resolve(realRoot, file);
  if (target !== realRoot && !target.startsWith(realRoot + path.sep)) {
    throw new Error('Path escapes the repository root.');
  }
  const realTarget = await fs.realpath(target);
  if (!realTarget.startsWith(realRoot + path.sep)) {
    throw new Error('Path escapes the repository root.');
  }
  return realTarget;
}

export type TypeCheckStatus = 'passed' | 'unavailable';

export interface ApplyReport {
  outcomes: FixOutcome[];
  typeCheck: TypeCheckStatus;
}

interface FileState {
  file: string;
  abs: string;
  original: string;
  findings: Finding[];
}

type EditResult = { ok: true; line: number } | { ok: false; reason: string };

/** Applies fixes one after another to `content`, rejecting any that don't match or break syntax. */
async function applySequentially(
  file: string,
  original: string,
  findings: Finding[]
): Promise<{ content: string; results: Map<string, EditResult> }> {
  let content = original;
  const results = new Map<string, EditResult>();
  for (const f of findings) {
    const res = applyFixToContent(file, content, f.fix!);
    if (!res.ok) {
      results.set(f.id, res);
    } else if (await introducesSyntaxErrors(file, content, res.content)) {
      results.set(f.id, { ok: false, reason: 'Fix would introduce a syntax error.' });
    } else {
      content = res.content;
      results.set(f.id, { ok: true, line: res.line });
    }
  }
  return { content, results };
}

const VERIFY_BUDGET_MS = 300_000;

/**
 * Applies the fixes of `findings` to files under `root`, never touching git.
 * When the repo has TypeScript installed, the result is type-checked against the pre-fix baseline and
 * any fix that introduces new type errors is rolled back, so the repo never ends up worse than it started.
 */
export async function applyFixesToDisk(root: string, findings: Finding[]): Promise<ApplyReport> {
  const outcomes = new Map<string, FixOutcome>();
  const skip = (f: Finding, reason: string) => outcomes.set(f.id, { findingId: f.id, file: f.file, status: 'skipped', reason });

  const byFile = new Map<string, Finding[]>();
  for (const f of findings) {
    if (!f.fix) {
      skip(f, 'No automated fix available.');
      continue;
    }
    const list = byFile.get(f.file) || [];
    list.push(f);
    byFile.set(f.file, list);
  }

  const states: FileState[] = [];
  for (const [file, list] of byFile) {
    try {
      const abs = await resolveInsideRoot(root, file);
      states.push({ file, abs, original: await fs.readFile(abs, 'utf8'), findings: list });
    } catch (err: any) {
      const reason = err?.code === 'ENOENT' ? 'File does not exist in the target repository.' : err.message || 'Cannot read file.';
      for (const f of list) skip(f, reason);
    }
  }

  const checker = states.length > 0 ? await createTypeChecker(root) : null;
  const baseline = checker ? await checker.run() : null;
  const verified = !!(checker && baseline);
  const deadline = Date.now() + VERIFY_BUDGET_MS;

  const write = (s: FileState, content: string) => fs.writeFile(s.abs, content, 'utf8');
  const restore = (s: FileState) => write(s, s.original);
  const record = (s: FileState, results: Map<string, EditResult>) => {
    for (const f of s.findings) {
      const r = results.get(f.id);
      if (!r) continue;
      if (r.ok) outcomes.set(f.id, { findingId: f.id, file: s.file, status: 'applied', line: r.line });
      else skip(f, r.reason);
    }
  };
  const newErrors = async () => newDiagnostics((await checker!.run()) ?? [], baseline!);

  try {
    // Pass 1: apply everything, then type-check once (the common case is a clean result).
    const attempted: FileState[] = [];
    for (const s of states) {
      const { content, results } = await applySequentially(s.file, s.original, s.findings);
      record(s, results);
      if (content !== s.original) {
        await write(s, content);
        attempted.push(s);
      }
    }
    if (!verified || attempted.length === 0) {
      return { outcomes: Array.from(outcomes.values()), typeCheck: verified ? 'passed' : 'unavailable' };
    }

    let errors = await newErrors();
    if (errors.length === 0) return { outcomes: Array.from(outcomes.values()), typeCheck: 'passed' };

    // Pass 2: roll back the files that now have errors (all of them if the errors surface elsewhere).
    const touched = new Set(attempted.map((s) => s.file));
    const errorFiles = new Set(errors.map((e) => e.file));
    const outside = [...errorFiles].some((f) => !touched.has(f));
    let suspects = outside ? attempted : attempted.filter((s) => errorFiles.has(s.file));
    for (const s of suspects) await restore(s);
    if (suspects.length < attempted.length && (await newErrors()).length > 0) {
      for (const s of attempted) await restore(s);
      suspects = attempted;
    }

    // Pass 3: re-introduce each suspect file's fixes one at a time, keeping only the clean ones.
    for (const s of suspects) {
      let content = s.original;
      for (const f of s.findings) {
        const prev = outcomes.get(f.id);
        if (prev?.status !== 'applied') continue;
        if (Date.now() > deadline) {
          skip(f, 'Not verified within the time limit, so it was not applied.');
          continue;
        }
        const res = applyFixToContent(s.file, content, f.fix!);
        if (!res.ok) {
          skip(f, res.reason);
          continue;
        }
        await write(s, res.content);
        errors = await newErrors();
        if (errors.length === 0) {
          content = res.content;
        } else {
          await write(s, content);
          skip(f, `Would introduce a type error (${errors[0].text.slice(0, 140)}), so it was rolled back.`);
        }
      }
    }
    return { outcomes: Array.from(outcomes.values()), typeCheck: 'passed' };
  } catch (err) {
    for (const s of states) await restore(s).catch(() => undefined);
    throw err;
  }
}

/** Builds a `git apply`-able unified diff from original file contents, without touching any repo. */
export async function buildPatch(
  originals: Map<string, string>,
  findings: Finding[]
): Promise<{ patch: string; outcomes: FixOutcome[] }> {
  const outcomes: FixOutcome[] = [];
  const edited = new Map<string, string>();

  for (const f of findings) {
    const original = originals.get(f.file);
    if (!f.fix || original === undefined) {
      outcomes.push({ findingId: f.id, file: f.file, status: 'skipped', reason: f.fix ? 'Original file unavailable.' : 'No automated fix available.' });
      continue;
    }
    const current = edited.get(f.file) ?? original;
    const res = applyFixToContent(f.file, current, f.fix);
    if (res.ok && !(await introducesSyntaxErrors(f.file, current, res.content))) {
      edited.set(f.file, res.content);
      outcomes.push({ findingId: f.id, file: f.file, status: 'applied', line: res.line });
    } else {
      outcomes.push({ findingId: f.id, file: f.file, status: 'skipped', reason: res.ok ? 'Fix would introduce a syntax error.' : res.reason });
    }
  }

  if (edited.size === 0) return { patch: '', outcomes };

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'acr-patch-'));
  try {
    for (const [file, next] of edited) {
      for (const [side, text] of [['a', originals.get(file)!], ['b', next]] as const) {
        const dest = path.join(tmp, side, file);
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.writeFile(dest, text, 'utf8');
      }
    }
    let patch = '';
    try {
      await execFileAsync('git', ['diff', '--no-index', '--no-color', '--no-prefix', 'a', 'b'], { cwd: tmp, maxBuffer: 32 * 1024 * 1024 });
    } catch (err: any) {
      // `git diff --no-index` exits with 1 when the trees differ, which is the expected case.
      if (typeof err.stdout === 'string' && err.code === 1) patch = err.stdout;
      else throw err;
    }
    return { patch, outcomes };
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}
