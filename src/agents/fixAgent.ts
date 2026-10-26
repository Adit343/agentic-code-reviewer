import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { config } from '@/lib/config';
import { Finding, FindingFix } from '@/types/domain';
import { SnapshotFile } from '@/services/repository/snapshot';
import { applyFixToContent, locateFix, renderFixDiff } from '@/services/fixes/fixEngine';
import { introducesSyntaxErrors } from '@/services/fixes/verify';
import { deterministicFix } from '@/services/fixes/deterministic';
import { storage } from '@/lib/storage';
import { parseLLMJsonArray } from './optimizationAgent';

const FINDINGS_PER_CALL = 10;
const CONCURRENCY = 8;
const MODEL_CALL_TIMEOUT_MS = 90_000;
// Runs in the background after the review completes, so this is a safety net rather than a user-facing wait.
const TOTAL_BUDGET_MS = 20 * 60_000;
const FULL_FILE_LINE_LIMIT = 600;
const WINDOW_LINES = 60;
const MAX_OLD_TEXT_CHARS = 4000;
// How far from the reported finding lines the replaced code may sit before we distrust it.
const LINE_TOLERANCE = 50;

function buildFileContext(file: SnapshotFile, findings: Finding[]): string {
  const lines = file.content.split('\n');
  if (lines.length <= FULL_FILE_LINE_LIMIT) return file.content;

  const ranges = findings
    .map((f) => [Math.max(1, f.start_line - WINDOW_LINES), Math.min(lines.length, f.end_line + WINDOW_LINES)] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1] + 1) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }
  return merged
    .map(([s, e]) => `/* ... lines ${s}-${e} of ${lines.length} ... */\n${lines.slice(s - 1, e).join('\n')}`)
    .join('\n');
}

function buildPrompt(file: SnapshotFile, findings: Finding[]): string {
  const issues = findings
    .map(
      (f) => `- id: ${f.id}
  rule: ${f.rule}
  title: ${f.title}
  reported lines: ${f.start_line}-${f.end_line}
  evidence: ${JSON.stringify(f.evidence)}
  explanation: ${f.explanation}
  recommended fix: ${f.recommended_fix}`
    )
    .join('\n');

  return `You are a senior engineer producing exact, minimal code fixes for review findings.

## FILE: ${file.relativePath}
\`\`\`${file.language || 'text'}
${buildFileContext(file, findings)}
\`\`\`

## FINDINGS TO FIX IN THIS FILE
${issues}

## RULES
1. For each finding, return ONE edit: "old_text" is code copied VERBATIM from the file above (exact characters, indentation and line breaks), and "new_text" is what replaces it.
2. "old_text" must appear EXACTLY ONCE in the file. Include just enough whole lines (usually 1-8) to make it unique. Never include line numbers or markdown fences.
3. Keep the fix minimal and in the file's existing style. Do not reformat or touch unrelated code.
4. Edits for different findings must not overlap.
5. Do not rely on new imports, new files, or changes elsewhere. If the fix needs those, or needs information you do not have (e.g. a safe dependency version), or is an architectural change, OMIT that finding. Omitting is better than guessing.
6. The result must remain syntactically valid AND must type-check in the surrounding project.
7. Only use identifiers, types and namespaces that are already imported or defined in the file shown (for example do not write \`React.ReactNode\` unless React is imported there). For \`any\`, use the real type when it is evident from the surrounding code (an existing interface, an obvious primitive, a type already imported); if it is not evident, use \`unknown\` only where the code still compiles after the change, otherwise OMIT the finding. Never invent a type that is not defined or imported in the file.
8. Do not change the shape of a function's parameters or return type in a way that could break its callers elsewhere in the project.

## OUTPUT
Return ONLY a raw JSON array (no prose, no code fences):
[{"id": "<finding id>", "old_text": "...", "new_text": "...", "note": "one short sentence on what changed"}]
Return [] if no finding can be fixed safely.`;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Model call timed out after ${ms / 1000}s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function askModel(prompt: string): Promise<string> {
  const candidateModels = Array.from(
    new Set([config.geminiModel, config.geminiChatModel, 'gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-flash-lite-latest'])
  ).filter(Boolean);

  let lastErr: any = null;
  for (const modelName of candidateModels) {
    try {
      const model = new ChatGoogleGenerativeAI({ apiKey: config.geminiApiKey, model: modelName, temperature: 0 });
      // The SDK does not reliably honour abort signals, so enforce the timeout ourselves.
      const response = await withTimeout(model.invoke(prompt), MODEL_CALL_TIMEOUT_MS);
      return typeof response.content === 'string'
        ? response.content
        : (response.content as any[]).map((c) => c.text || '').join('');
    } catch (err: any) {
      lastErr = err;
      const msg = String(err?.message || '');
      const retryable = /404|not found|ModelService|no longer available|429|Quota/i.test(msg);
      if (!retryable) throw err;
    }
  }
  throw lastErr || new Error('No Gemini model available for fix generation.');
}

/** Attaches `fix` to the finding only if it provably applies to the real file near the reported lines. */
async function acceptFix(finding: Finding, file: SnapshotFile, fix: FindingFix): Promise<boolean> {
  if (!fix.old_text.trim() || fix.old_text === fix.new_text || fix.old_text.length > MAX_OLD_TEXT_CHARS) return false;
  const loc = locateFix(file.content, fix);
  if (!loc.ok) return false;
  if (loc.line < finding.start_line - LINE_TOLERANCE || loc.line > finding.end_line + LINE_TOLERANCE) return false;
  const applied = applyFixToContent(file.relativePath, file.content, fix);
  if (!applied.ok || (await introducesSyntaxErrors(file.relativePath, file.content, applied.content))) return false;

  finding.fix = fix;
  finding.suggested_patch = renderFixDiff(file.relativePath, loc.line, fix);
  return true;
}

async function generateFixesForChunk(file: SnapshotFile, findings: Finding[]): Promise<void> {
  const raw = await askModel(buildPrompt(file, findings));
  const byId = new Map(findings.map((f) => [f.id, f]));

  for (const item of parseLLMJsonArray(raw)) {
    const finding = item && byId.get(String(item.id));
    if (!finding || finding.fix) continue;
    if (typeof item.old_text !== 'string' || typeof item.new_text !== 'string') continue;
    await acceptFix(finding, file, {
      old_text: item.old_text,
      new_text: item.new_text,
      note: typeof item.note === 'string' ? item.note : undefined,
    });
  }
}

export interface FixProgress {
  total: number;
  done: number;
  generated: number;
}

const SEVERITY_ORDER: Record<Finding['severity'], number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

/**
 * Attaches a validated, exact-text `fix` to as many findings as possible: mechanical rules first
 * (no model), then the model for the rest, most severe first. Never throws — a failure only means
 * those findings have no fix.
 */
export async function generateFixes(
  findings: Finding[],
  files: SnapshotFile[],
  onProgress?: (p: FixProgress) => void
): Promise<number> {
  const filesByPath = new Map(files.map((f) => [f.relativePath, f]));
  const pending = findings
    .filter((f) => !f.fix && f.status !== 'false_positive' && filesByPath.has(f.file))
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  const progress: FixProgress = { total: pending.length, done: 0, generated: findings.filter((f) => f.fix).length };
  const finish = (n: number) => {
    progress.done += n;
    progress.generated = findings.filter((f) => f.fix).length;
    onProgress?.({ ...progress });
  };
  onProgress?.({ ...progress });

  // 1. Mechanical fixes need no model and are always safe to attempt.
  const needModel: Finding[] = [];
  for (const f of pending) {
    const file = filesByPath.get(f.file)!;
    const fix = deterministicFix(f, file.content);
    if (fix && (await acceptFix(f, file, fix))) finish(1);
    else needModel.push(f);
  }

  // 2. The model handles the rest, in small per-file chunks so one slow answer can't stall everything.
  if (config.isMockLlm) {
    finish(needModel.length);
    return progress.generated;
  }

  const queue: { file: SnapshotFile; chunk: Finding[] }[] = [];
  const byFile = new Map<string, Finding[]>();
  for (const f of needModel) byFile.set(f.file, [...(byFile.get(f.file) || []), f]);
  for (const [filePath, list] of byFile) {
    for (let i = 0; i < list.length; i += FINDINGS_PER_CALL) {
      queue.push({ file: filesByPath.get(filePath)!, chunk: list.slice(i, i + FINDINGS_PER_CALL) });
    }
  }
  queue.sort((a, b) => SEVERITY_ORDER[a.chunk[0].severity] - SEVERITY_ORDER[b.chunk[0].severity]);

  let outOfTime = false;
  const worker = async () => {
    for (let next = queue.shift(); next && !outOfTime; next = queue.shift()) {
      try {
        await generateFixesForChunk(next.file, next.chunk);
      } catch (err: any) {
        console.warn(`[FixAgent] Could not generate fixes for ${next.file.relativePath}: ${String(err?.message || err).slice(0, 120)}`);
      }
      finish(next.chunk.length);
    }
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      outOfTime = true;
      console.warn('[FixAgent] Time budget exhausted — keeping the fixes generated so far.');
      resolve();
    }, TOTAL_BUDGET_MS);
  });
  await Promise.race([Promise.all(Array.from({ length: CONCURRENCY }, worker)), deadline]);
  clearTimeout(timer);

  return progress.generated;
}

/**
 * Runs fix generation for a completed review in the background, reporting progress on the review.
 * Safe to call again later to retry findings that still have no fix.
 */
export async function runFixGeneration(reviewId: string): Promise<void> {
  const review = await storage.getReview(reviewId);
  if (!review || review.fixGeneration?.status === 'running') return;
  const snapshot = storage.getRepoSnapshot(reviewId);
  if (!snapshot) return;
  const findings = await storage.getFindings(reviewId);

  await storage.updateReview(reviewId, { fixGeneration: { status: 'running', total: 0, done: 0, generated: 0 } });
  try {
    await generateFixes(findings, snapshot.files, (p) => {
      void storage.updateReview(reviewId, { fixGeneration: { status: 'running', ...p } });
    });
  } catch (err: any) {
    console.warn(`[FixAgent] Fix generation failed for ${reviewId}: ${err?.message || err}`);
  } finally {
    const generated = findings.filter((f) => f.fix).length;
    await storage.updateReview(reviewId, {
      fixGeneration: { status: 'done', total: findings.length, done: findings.length, generated },
    });
  }
}
