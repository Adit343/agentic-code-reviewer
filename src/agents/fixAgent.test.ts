import { describe, it, expect, vi } from 'vitest';
import { Finding } from '@/types/domain';

let reply = '[]';
vi.mock('@langchain/google-genai', () => ({
  ChatGoogleGenerativeAI: class {
    async invoke() { return { content: reply }; }
  },
}));
vi.mock('@/lib/config', () => ({
  config: { isMockLlm: false, geminiApiKey: 'x'.repeat(20), geminiModel: 'm', geminiChatModel: 'm' },
}));

import { generateFixes } from './fixAgent';

const file = {
  relativePath: 'auth.js', language: 'javascript', sizeBytes: 1, lineCount: 4,
  content: 'function login(u) {\n  const q = "SELECT " + u;\n  return q;\n}\n',
};
const finding = (id: string, line: number): Finding => ({
  id, category: 'security', rule: 'SQL', title: id, severity: 'high', confidence: 1, status: 'confirmed',
  file: 'auth.js', start_line: line, end_line: line, evidence: '', explanation: '', recommended_fix: '',
  verification: { checks_performed: [], counter_evidence_considered: [], tools: [] },
});

describe('generateFixes', () => {
  it('keeps only fixes that provably apply to the real file', async () => {
    const f1 = finding('good', 2), f2 = finding('hallucinated', 2), f3 = finding('noop', 2);
    reply = '```json\n' + JSON.stringify([
      { id: 'good', old_text: 'const q = "SELECT " + u;', new_text: 'const q = ["SELECT ", u].join("");', note: 'n' },
      { id: 'hallucinated', old_text: 'does not exist', new_text: 'x' },
      { id: 'noop', old_text: 'return q;', new_text: 'return q;' },
    ]) + '\n```';
    const n = await generateFixes([f1, f2, f3], [file]);
    expect(n).toBe(1);
    expect(f1.fix?.new_text).toContain('join');
    expect(f1.suggested_patch).toContain('- ');
    expect(f2.fix).toBeUndefined();
    expect(f3.fix).toBeUndefined();
  });
  it('rejects a fix far from the reported lines', async () => {
    const far = { ...file, content: 'target\n' + 'x\n'.repeat(200) };
    const f = finding('far', 150);
    reply = JSON.stringify([{ id: 'far', old_text: 'target', new_text: 'T' }]);
    expect(await generateFixes([f], [far])).toBe(0);
  });
});
