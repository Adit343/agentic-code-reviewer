import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export interface IsolatedWorkspace {
  id: string;
  path: string;
  cleanup: () => Promise<void>;
}

export async function createIsolatedWorkspace(reviewId: string): Promise<IsolatedWorkspace> {
  const baseDir = path.join(os.tmpdir(), 'agentic-code-reviewer-workspaces');
  await fs.mkdir(baseDir, { recursive: true });

  const workspacePath = path.join(baseDir, reviewId);
  await fs.mkdir(workspacePath, { recursive: true });

  return {
    id: reviewId,
    path: workspacePath,
    cleanup: async () => {
      try {
        await fs.rm(workspacePath, { recursive: true, force: true });
      } catch (err) {
        console.error(`Failed to clean workspace at ${workspacePath}:`, err);
      }
    },
  };
}
