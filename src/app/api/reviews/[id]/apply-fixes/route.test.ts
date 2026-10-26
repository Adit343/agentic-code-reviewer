import { describe, it, expect } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { NextRequest } from 'next/server';
import { storage } from '@/lib/storage';
import { execFileSync } from 'child_process';
import { POST } from './route';

const call = (id: string, body: object) =>
  POST(new NextRequest('http://x/api', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });

describe('POST apply-fixes', () => {
  it('writes fix into the local repo, marks finding fixed, never re-applies', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rt-'));
    await fs.writeFile(path.join(root, 'a.js'), 'const k = "secret";\n');
    await storage.createReview({ id: 'r1', repositorySource: root, provider: 'local', commitSha: 'HEAD', status: 'completed', progressPercent: 100, currentPhase: '', toolVersions: {}, createdAt: '', updatedAt: '' });
    await storage.saveFindings('r1', [{
      id: 'f1', category: 'security', rule: 'R', title: 't', severity: 'high', confidence: 1, status: 'confirmed',
      file: 'a.js', start_line: 1, end_line: 1, evidence: '', explanation: '', recommended_fix: '',
      fix: { old_text: '"secret"', new_text: 'process.env.K' },
      verification: { checks_performed: [], counter_evidence_considered: [], tools: [] },
    }]);
    const res = await call('r1', { findingIds: ['f1'], mode: 'apply' });
    expect(res.status).toBe(200);
    expect(await fs.readFile(path.join(root, 'a.js'), 'utf8')).toBe('const k = process.env.K;\n');
    expect((await storage.getFindings('r1'))[0].status).toBe('fixed');
    expect((await call('r1', { findingIds: ['f1'], mode: 'apply' })).status).toBe(400);
  });
  it('requires a target path for remote reviews', async () => {
    await storage.createReview({ id: 'r2', repositorySource: 'o/r', provider: 'github', commitSha: 'HEAD', status: 'completed', progressPercent: 100, currentPhase: '', toolVersions: {}, createdAt: '', updatedAt: '' });
    await storage.saveFindings('r2', [{
      id: 'f', category: 'bug', rule: 'R', title: 't', severity: 'low', confidence: 1, status: 'confirmed',
      file: 'a.js', start_line: 1, end_line: 1, evidence: '', explanation: '', recommended_fix: '',
      fix: { old_text: 'a', new_text: 'b' },
      verification: { checks_performed: [], counter_evidence_considered: [], tools: [] },
    }]);
    const res = await call('r2', { findingIds: ['f'], mode: 'apply' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/local checkout/);
  });
  it('refuses to apply when the repo is on a different branch than the review', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'br-'));
    const git = (...a: string[]) => execFileSync('git', ['-c', 'user.email=a@b', '-c', 'user.name=t', ...a], { cwd: root });
    git('init', '-q', '-b', 'develop');
    await fs.writeFile(path.join(root, 'a.js'), 'let a = 1;\n');
    git('add', '.');
    git('commit', '-qm', 'init');
    git('checkout', '-q', '-b', 'client_feedbacks');
    await storage.createReview({ id: 'r3', repositorySource: root, provider: 'local', branch: 'develop', commitSha: 'HEAD', status: 'completed', progressPercent: 100, currentPhase: '', toolVersions: {}, createdAt: '', updatedAt: '' });
    await storage.saveFindings('r3', [{
      id: 'f', category: 'bug', rule: 'R', title: 't', severity: 'low', confidence: 1, status: 'confirmed',
      file: 'a.js', start_line: 1, end_line: 1, evidence: '', explanation: '', recommended_fix: '',
      fix: { old_text: 'let', new_text: 'const' },
      verification: { checks_performed: [], counter_evidence_considered: [], tools: [] },
    }]);
    const res = await call('r3', { findingIds: ['f'], mode: 'apply' });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('BRANCH_MISMATCH');
    expect(await fs.readFile(path.join(root, 'a.js'), 'utf8')).toBe('let a = 1;\n');

    git('checkout', '-q', 'develop');
    expect((await call('r3', { findingIds: ['f'], mode: 'apply' })).status).toBe(200);
    expect(await fs.readFile(path.join(root, 'a.js'), 'utf8')).toBe('const a = 1;\n');
  });
});
