import fs from 'fs/promises';
import path from 'path';
import { Finding } from '@/types/domain';
import { v4 as uuidv4 } from 'uuid';

export async function runQualityAnalyzer(workspacePath: string): Promise<Finding[]> {
  const findings: Finding[] = [];

  const QUALITY_RULES = [
    {
      rule: 'LOOSE_EQUALITY',
      regex: /[^!=]==[^=]/,
      title: 'Loose Equality Operator (==) Used',
      severity: 'low' as Finding['severity'],
      explanation: 'Use of loose equality (==) can lead to unintended type coercion bugs.',
      fix: 'Use strict equality (===) instead.',
    },
    {
      rule: 'UNHANDLED_PROMISE',
      regex: /\bnew\s+Promise\s*\([^)]*\)(?!\s*\.(catch|then))/,
      title: 'Potential Unhandled Promise Rejection',
      severity: 'medium' as Finding['severity'],
      explanation: 'Created promise lacks error handling via .catch() or try/catch in async block.',
      fix: 'Attach a .catch() handler or await within a try/catch block.',
    },
    {
      rule: 'ANY_TYPE',
      regex: /:\s*any\b/,
      title: 'Usage of Explicit `any` Type in TypeScript',
      severity: 'info' as Finding['severity'],
      explanation: 'Using `any` disables TypeScript type safety benefits.',
      fix: 'Replace `any` with specific types or `unknown`.',
    },
    {
      rule: 'EMPTY_CATCH',
      regex: /catch\s*\([^)]*\)\s*\{\s*\}/,
      title: 'Empty Exception Catch Block',
      severity: 'medium' as Finding['severity'],
      explanation: 'Swallowing exceptions silently masks errors and makes debugging difficult.',
      fix: 'Log the error or handle it explicitly.',
    },
  ];

  async function scanDir(dir: string, relDir: string = '') {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (['node_modules', '.git', '.next', 'dist', 'build'].includes(entry.name)) continue;

      const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await scanDir(fullPath, relPath);
      } else if (entry.isFile() && /\.(js|jsx|ts|tsx)$/i.test(entry.name)) {
        try {
          const content = await fs.readFile(fullPath, 'utf-8');
          const lines = content.split('\n');

          lines.forEach((line, idx) => {
            for (const r of QUALITY_RULES) {
              if (r.regex.test(line)) {
                findings.push({
                  id: `finding-${uuidv4().slice(0, 8)}`,
                  category: 'quality',
                  rule: r.rule,
                  title: r.title,
                  severity: r.severity,
                  confidence: 0.8,
                  status: 'likely',
                  file: relPath,
                  start_line: idx + 1,
                  end_line: idx + 1,
                  evidence: line.trim(),
                  explanation: r.explanation,
                  recommended_fix: r.fix,
                  verification: {
                    checks_performed: ['quality_lint_rules'],
                    counter_evidence_considered: [],
                    tools: ['eslint_quality'],
                  },
                });
              }
            }
          });
        } catch {
          // ignore
        }
      }
    }
  }

  await scanDir(workspacePath);
  return findings;
}
