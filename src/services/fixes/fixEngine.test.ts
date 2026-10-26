import { describe, it, expect } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { Finding } from '@/types/domain';
import { applyFixToContent, applyFixesToDisk, buildPatch, locateFix } from './fixEngine';

const mk = (id: string, file: string, old_text: string, new_text: string): Finding => ({
  id, file, old: undefined,
  category: 'bug', rule: 'R', title: id, severity: 'high', confidence: 1, status: 'confirmed',
  start_line: 1, end_line: 1, evidence: '', explanation: '', recommended_fix: '',
  verification: { checks_performed: [], counter_evidence_considered: [], tools: [] },
  fix: { old_text, new_text },
} as unknown as Finding);

describe('locateFix', () => {
  it('finds a unique match and reports its line', () => {
    const r = locateFix('a\nb\nc\n', { old_text: 'b', new_text: 'x' });
    expect(r).toMatchObject({ ok: true, line: 2 });
  });
  it('rejects missing and ambiguous matches', () => {
    expect(locateFix('a\nb\n', { old_text: 'zz', new_text: '' }).ok).toBe(false);
    expect(locateFix('a\na\n', { old_text: 'a', new_text: 'b' }).ok).toBe(false);
  });
  it('preserves CRLF line endings', () => {
    const r = applyFixToContent('f.ts', 'a\r\nb\r\nc\r\n', { old_text: 'b\nc', new_text: 'x\ny' });
    expect(r.ok && r.content).toBe('a\r\nx\r\ny\r\n');
  });
  it('refuses a fix that breaks JSON', () => {
    expect(applyFixToContent('p.json', '{"a":1}', { old_text: '1', new_text: '1,' }).ok).toBe(false);
  });
});

describe('applyFixesToDisk', () => {
  it('applies several fixes in one file regardless of line shifts, skips stale ones', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fx-'));
    await fs.writeFile(path.join(root, 'a.ts'), 'one\ntwo\nthree\nfour\n');
    const { outcomes: out } = await applyFixesToDisk(root, [
      mk('1', 'a.ts', 'one', 'uno\nuno2\nuno3'),
      mk('2', 'a.ts', 'four', 'quattro'),
      mk('3', 'a.ts', 'gone', 'x'),
    ]);
    expect(out.map((o) => o.status)).toEqual(['applied', 'applied', 'skipped']);
    expect(await fs.readFile(path.join(root, 'a.ts'), 'utf8')).toBe('uno\nuno2\nuno3\ntwo\nthree\nquattro\n');
  });
  it('refuses paths outside the root', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fx-'));
    const outside = path.join(os.tmpdir(), 'fx-outside.txt');
    await fs.writeFile(outside, 'secret');
    const { outcomes: out } = await applyFixesToDisk(root, [mk('1', '../fx-outside.txt', 'secret', 'pwned')]);
    expect(out[0].status).toBe('skipped');
    expect(await fs.readFile(outside, 'utf8')).toBe('secret');
  });
});

describe('buildPatch', () => {
  it('produces a patch that git apply accepts', async () => {
    const original = 'l1\nl2\nl3\nl4\nl5\n';
    const { patch } = await buildPatch(new Map([['src/a.ts', original]]), [mk('1', 'src/a.ts', 'l3', 'L3')]);
    expect(patch).toContain('--- a/src/a.ts');
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fx-'));
    await fs.mkdir(path.join(root, 'src'));
    await fs.writeFile(path.join(root, 'src/a.ts'), original);
    await fs.writeFile(path.join(root, 'x.patch'), patch);
    const { execFileSync } = await import('child_process');
    execFileSync('git', ['apply', 'x.patch'], { cwd: root });
    expect(await fs.readFile(path.join(root, 'src/a.ts'), 'utf8')).toBe('l1\nl2\nL3\nl4\nl5\n');
  });
});

describe('applyFixesToDisk type-check verification', () => {
  async function project(files: Record<string, string>) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tc-'));
    await fs.mkdir(path.join(root, 'node_modules'));
    await fs.symlink(path.resolve('node_modules/typescript'), path.join(root, 'node_modules/typescript'));
    await fs.writeFile(path.join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true, noEmit: true, target: 'es2020', types: [] }, include: ['*.ts'] }));
    for (const [n, c] of Object.entries(files)) await fs.writeFile(path.join(root, n), c);
    return root;
  }

  it('rolls back a fix that introduces a type error but keeps the good one', async () => {
    const root = await project({
      'a.ts': 'export const f = (x: any) => x;\nexport const g = (y: any) => y;\n',
    });
    const { outcomes, typeCheck } = await applyFixesToDisk(root, [
      mk('good', 'a.ts', '(x: any) => x', '(x: string) => x'),
      mk('bad', 'a.ts', '(y: any) => y', '(y: React.ReactNode) => y'),
    ]);
    expect(typeCheck).toBe('passed');
    expect(outcomes.find((o) => o.findingId === 'good')?.status).toBe('applied');
    const bad = outcomes.find((o) => o.findingId === 'bad')!;
    expect(bad.status).toBe('skipped');
    expect(await fs.readFile(path.join(root, 'a.ts'), 'utf8')).toBe(
      'export const f = (x: string) => x;\nexport const g = (y: any) => y;\n'
    );
  }, 60000);

  it('rolls back when the error appears in a different file', async () => {
    const root = await project({
      'lib.ts': 'export const n = (x: number) => x;\n',
      'use.ts': 'import { n } from "./lib";\nexport const v = n(1);\n',
    });
    const { outcomes } = await applyFixesToDisk(root, [mk('break', 'lib.ts', '(x: number) => x', '(x: string) => x')]);
    expect(outcomes[0].status).toBe('skipped');
    expect(await fs.readFile(path.join(root, 'lib.ts'), 'utf8')).toBe('export const n = (x: number) => x;\n');
  }, 60000);

  it('rejects a fix that makes the file unparseable', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sx-'));
    await fs.writeFile(path.join(root, 'a.ts'), 'const a = 1;\n');
    const { outcomes, typeCheck } = await applyFixesToDisk(root, [mk('s', 'a.ts', 'const a = 1;', 'const a = ;;{')]);
    expect(typeCheck).toBe('unavailable');
    expect(outcomes[0].status).toBe('skipped');
    expect(await fs.readFile(path.join(root, 'a.ts'), 'utf8')).toBe('const a = 1;\n');
  });
});
