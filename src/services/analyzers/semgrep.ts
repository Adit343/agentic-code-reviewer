import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { Finding } from '@/types/domain';
import { v4 as uuidv4 } from 'uuid';

const execAsync = promisify(exec);

export async function runSemgrepAnalyzer(workspacePath: string): Promise<Finding[]> {
  try {
    // Attempt system semgrep execution if available
    const { stdout } = await execAsync(`semgrep --config=auto --json "${workspacePath}"`, {
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
    });
    const parsed = JSON.parse(stdout);
    if (parsed && Array.isArray(parsed.results)) {
      return parsed.results.map((res: any) => ({
        id: `finding-${uuidv4().slice(0, 8)}`,
        category: 'security',
        rule: res.check_id || 'SEMGREP_RULE',
        title: res.extra?.message || 'Semgrep Security Finding',
        severity: mapSemgrepSeverity(res.extra?.severity),
        confidence: 0.9,
        status: 'likely',
        file: path.relative(workspacePath, res.path),
        start_line: res.start?.line || 1,
        end_line: res.end?.line || 1,
        evidence: res.extra?.lines || '',
        explanation: res.extra?.message || 'Pattern detected by Semgrep SAST rule.',
        recommended_fix: res.extra?.fix || 'Review and sanitize input before processing.',
        verification: {
          checks_performed: ['semgrep_sast'],
          counter_evidence_considered: [],
          tools: ['semgrep'],
        },
      }));
    }
  } catch {
    // Semgrep binary not installed or failed - fallback to deterministic pattern scanner
  }

  return runDeterministicPatternScanner(workspacePath);
}

function mapSemgrepSeverity(sev?: string): Finding['severity'] {
  if (sev === 'ERROR') return 'high';
  if (sev === 'WARNING') return 'medium';
  if (sev === 'INFO') return 'low';
  return 'medium';
}

async function runDeterministicPatternScanner(workspacePath: string): Promise<Finding[]> {
  const findings: Finding[] = [];

  const PATTERNS: Array<{
    rule: string;
    category: Finding['category'];
    title: string;
    severity: Finding['severity'];
    regex: RegExp;
    explanation: string;
    recommended_fix: string;
  }> = [
    {
      rule: 'SQL_INJECTION',
      category: 'security',
      title: 'Potential SQL Injection via Raw Concatenation',
      severity: 'critical',
      regex: /(SELECT|INSERT|UPDATE|DELETE)\s+.*?\+\s*([A-Za-z0-9_$]+)/i,
      explanation: 'User input appears to be directly concatenated into SQL query string without parameterization.',
      recommended_fix: 'Use parameterized queries or ORM query builders (e.g., $1 parameter bindings).',
    },
    {
      rule: 'HARDCODED_SECRET',
      category: 'security',
      title: 'Potential Hardcoded Credential or API Key',
      severity: 'high',
      regex: /(api[_-]?key|secret|password|bearer|auth[_-]?token)\s*[:=]\s*['"][A-Za-z0-9_\-.~+/=]{16,}['"]/i,
      explanation: 'Secret or credential string constant found directly in source code.',
      recommended_fix: 'Move credentials to environment variables or secret store.',
    },
    {
      rule: 'UNSAFE_EVAL',
      category: 'security',
      title: 'Execution of Unsafe Code via eval() or Function()',
      severity: 'critical',
      regex: /\beval\s*\([^)]+\)/,
      explanation: 'Use of eval() executes arbitrary strings as code, posing arbitrary code execution risks.',
      recommended_fix: 'Refactor code to avoid dynamic code evaluation.',
    },
    {
      rule: 'UNSAFE_INNER_HTML',
      category: 'security',
      title: 'Potential Cross-Site Scripting (XSS) via dangerouslySetInnerHTML',
      severity: 'high',
      regex: /dangerouslySetInnerHTML\s*=\s*\{\s*\{\s*__html\s*:/,
      explanation: 'Unsanitized HTML rendered directly into DOM allows XSS injection attacks.',
      recommended_fix: 'Sanitize HTML input using DOMPurify or avoid raw HTML injection.',
    },
    {
      rule: 'PATH_TRAVERSAL',
      category: 'security',
      title: 'Potential Path Traversal in File Operations',
      severity: 'high',
      regex: /fs\.(readFile|writeFile|createReadStream)\s*\(\s*.*?\+\s*([A-Za-z0-9_$]+)/,
      explanation: 'File path constructed using unvalidated string concatenation allows reading arbitrary system files.',
      recommended_fix: 'Validate path using path.resolve() and verify root directory boundary.',
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
      } else if (entry.isFile() && /\.(js|jsx|ts|tsx|py|go|java)$/i.test(entry.name)) {
        try {
          const content = await fs.readFile(fullPath, 'utf-8');
          const lines = content.split('\n');

          lines.forEach((line, idx) => {
            for (const pat of PATTERNS) {
              if (pat.regex.test(line)) {
                findings.push({
                  id: `finding-${uuidv4().slice(0, 8)}`,
                  category: pat.category,
                  rule: pat.rule,
                  title: pat.title,
                  severity: pat.severity,
                  confidence: 0.85,
                  status: 'likely',
                  file: relPath,
                  start_line: idx + 1,
                  end_line: idx + 1,
                  evidence: line.trim(),
                  explanation: pat.explanation,
                  recommended_fix: pat.recommended_fix,
                  verification: {
                    checks_performed: ['deterministic_sast_pattern'],
                    counter_evidence_considered: [],
                    tools: ['pattern_scanner'],
                  },
                });
              }
            }
          });
        } catch {
          // ignore read error
        }
      }
    }
  }

  await scanDir(workspacePath);
  return findings;
}
