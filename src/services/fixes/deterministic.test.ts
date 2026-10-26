import { describe, it, expect } from 'vitest';
import { Finding } from '@/types/domain';
import { deterministicFix } from './deterministic';
import { applyFixToContent } from './fixEngine';

const f = (line: number): Finding => ({
  id: 'x', category: 'quality', rule: 'LOOSE_EQUALITY', title: '', severity: 'low', confidence: 0.8, status: 'likely',
  file: 'a.ts', start_line: line, end_line: line, evidence: '', explanation: '', recommended_fix: '',
  verification: { checks_performed: [], counter_evidence_considered: [], tools: [] },
});

const fixed = (content: string, line: number) => {
  const fix = deterministicFix(f(line), content);
  if (!fix) return null;
  const r = applyFixToContent('a.ts', content, fix);
  return r.ok ? r.content : null;
};

describe('deterministicFix LOOSE_EQUALITY', () => {
  it('upgrades == and !=', () => {
    expect(fixed('if (a == b) {}\n', 1)).toBe('if (a === b) {}\n');
    expect(fixed('if (a != b) {}\n', 1)).toBe('if (a !== b) {}\n');
  });
  it('disambiguates identical lines using neighbours', () => {
    const src = 'if (a == b) {\n  one();\n}\nif (a == b) {\n  two();\n}\n';
    expect(fixed(src, 4)).toBe('if (a == b) {\n  one();\n}\nif (a === b) {\n  two();\n}\n');
  });
  it('leaves the == null idiom, strings and multi-operator lines alone', () => {
    expect(fixed('if (a == null) {}\n', 1)).toBeNull();
    expect(fixed('const s = "a == b";\n', 1)).toBeNull();
    expect(fixed('if (a == b || c == d) {}\n', 1)).toBeNull();
  });
});
