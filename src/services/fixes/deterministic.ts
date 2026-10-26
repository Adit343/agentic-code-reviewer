import { Finding, FindingFix } from '@/types/domain';

const MAX_CONTEXT_LINES = 4;

/** Smallest run of whole lines around `lineIdx` that occurs exactly once in `lines`, so the edit is unambiguous. */
function uniqueSnippet(lines: string[], lineIdx: number, replacement: string): FindingFix | null {
  const text = lines.join('\n');
  for (let k = 0; k <= MAX_CONTEXT_LINES; k++) {
    const from = Math.max(0, lineIdx - k);
    const to = Math.min(lines.length - 1, lineIdx + k);
    const old = lines.slice(from, to + 1).join('\n');
    const next = [...lines.slice(from, lineIdx), replacement, ...lines.slice(lineIdx + 1, to + 1)].join('\n');
    if (text.indexOf(old) !== -1 && text.indexOf(old) === text.lastIndexOf(old)) {
      return { old_text: old, new_text: next };
    }
  }
  return null;
}

/** `==` → `===` and `!=` → `!==`, only when there is exactly one operator and it is not the `== null` idiom. */
function fixLooseEquality(lines: string[], idx: number): FindingFix | null {
  const line = lines[idx];
  if (line === undefined) return null;
  const ops = [...line.matchAll(/(?<![=!<>])(==|!=)(?!=)/g)];
  if (ops.length !== 1) return null;

  const op = ops[0];
  const at = op.index!;
  const quotesBefore = (line.slice(0, at).match(/['"`]/g) || []).length;
  if (quotesBefore % 2 === 1) return null; // operator sits inside a string
  if (line.slice(0, at).includes('//')) return null; // inside a trailing comment
  // `x == null` deliberately matches undefined too; changing it alters behaviour.
  if (/(==|!=)\s*(null|undefined)\b/.test(line) || /\b(null|undefined)\s*(==|!=)/.test(line)) return null;

  const fixed = line.slice(0, at) + op[1] + '=' + line.slice(at + op[1].length);
  const fix = uniqueSnippet(lines, idx, fixed);
  return fix ? { ...fix, note: `Use strict ${op[1]}= comparison.` } : null;
}

/** Fixes that need no model: mechanical, local and safe. Returns null when a rule isn't covered. */
export function deterministicFix(finding: Finding, content: string): FindingFix | null {
  const lines = content.split(/\r?\n/);
  if (finding.rule === 'LOOSE_EQUALITY') return fixLooseEquality(lines, finding.start_line - 1);
  return null;
}
