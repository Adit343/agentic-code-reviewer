import { it, expect } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { acquireRepository } from './acquisition';

it('reports the branch checked out in the real local folder, not the .git-less copy', async () => {
  const src = await fs.mkdtemp(path.join(os.tmpdir(), 'src-'));
  const dest = await fs.mkdtemp(path.join(os.tmpdir(), 'dst-'));
  const git = (...a: string[]) => execFileSync('git', ['-c', 'user.email=a@b', '-c', 'user.name=t', ...a], { cwd: src });
  git('init', '-q', '-b', 'develop');
  await fs.writeFile(path.join(src, 'a.ts'), 'x\n');
  git('add', '.');
  git('commit', '-qm', 'i');
  const res = await acquireRepository(src, 'local', undefined, dest);
  expect(res.branch).toBe('develop');
});
