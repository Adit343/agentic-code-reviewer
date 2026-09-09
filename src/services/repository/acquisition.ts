import fs from 'fs/promises';
import path from 'path';
import simpleGit, { SimpleGit } from 'simple-git';

export interface AcquisitionResult {
  workspacePath: string;
  commitSha: string;
  parentSha?: string;
  branch?: string;
  filesCount: number;
}

export function validateSha(sha: string): boolean {
  if (sha === 'HEAD' || /^HEAD~\d+$/.test(sha)) return true;
  return /^[0-9a-fA-F]{7,40}$/.test(sha);
}

export function validateLocalPath(targetPath: string): string {
  const resolvedPath = path.resolve(targetPath);
  // Ensure path traversal is prevented
  if (!path.isAbsolute(resolvedPath)) {
    throw new Error(`Invalid local path: ${targetPath}`);
  }
  return resolvedPath;
}

export async function acquireRepository(
  source: string,
  provider: 'github' | 'gitlab' | 'url' | 'local',
  requestedCommitSha: string | undefined,
  destinationWorkspace: string
): Promise<AcquisitionResult> {
  const git: SimpleGit = simpleGit(destinationWorkspace);

  if (provider === 'local') {
    const canonicalPath = validateLocalPath(source);
    
    // Check path existence
    try {
      const stats = await fs.stat(canonicalPath);
      if (!stats.isDirectory()) {
        throw new Error(`Local path is not a directory: ${canonicalPath}`);
      }
    } catch {
      throw new Error(`Local repository path does not exist: ${canonicalPath}`);
    }

    // Copy repository contents into isolated workspace
    await fs.cp(canonicalPath, destinationWorkspace, {
      recursive: true,
      filter: (src) => {
        // Exclude node_modules, build outputs, .next, dist to stay light & safe
        const base = path.basename(src);
        return base !== 'node_modules' && base !== '.next' && base !== 'dist' && base !== 'build';
      },
    });

    const localGit = simpleGit(destinationWorkspace);
    let isGitRepo = false;
    try {
      isGitRepo = await localGit.checkIsRepo();
    } catch {
      isGitRepo = false;
    }

    let commitSha = requestedCommitSha || 'HEAD';
    let parentSha: string | undefined = undefined;
    let branch: string | undefined = undefined;

    if (isGitRepo) {
      if (requestedCommitSha && !validateSha(requestedCommitSha)) {
        throw new Error(`Invalid commit SHA format: ${requestedCommitSha}`);
      }

      if (requestedCommitSha && requestedCommitSha !== 'HEAD') {
        await localGit.checkout(requestedCommitSha);
      }

      try {
        const log = await localGit.log({ maxCount: 1 });
        const latestAny = log.latest as any;
        if (latestAny) {
          commitSha = latestAny.hash;
          if (latestAny.parents && latestAny.parents.length > 0) {
            parentSha = latestAny.parents[0];
          }
        }
      } catch {
        commitSha = 'workspace-head';
      }
      try {
        const status = await localGit.status();
        branch = status.current || undefined;
      } catch {
        // ignore branch resolution failure
      }
    }

    return {
      workspacePath: destinationWorkspace,
      commitSha: commitSha.slice(0, 40),
      parentSha,
      branch,
      filesCount: 0,
    };
  } else {
    // Remote Git repo (GitHub, GitLab, or raw URL)
    let cloneUrl = source;
    if (provider === 'github' && !source.startsWith('http://') && !source.startsWith('https://')) {
      cloneUrl = `https://github.com/${source.replace(/^\//, '')}.git`;
    } else if (provider === 'gitlab' && !source.startsWith('http://') && !source.startsWith('https://')) {
      cloneUrl = `https://gitlab.com/${source.replace(/^\//, '')}.git`;
    }

    // Safety check on cloneUrl scheme
    if (!cloneUrl.startsWith('https://') && !cloneUrl.startsWith('http://') && !cloneUrl.startsWith('git@')) {
      throw new Error(`Unsupported or unsafe repository URL scheme: ${cloneUrl}`);
    }

    const hostGit = simpleGit();
    await hostGit.clone(cloneUrl, destinationWorkspace, ['--depth', '10']);

    const workspaceGit = simpleGit(destinationWorkspace);
    if (requestedCommitSha) {
      if (!validateSha(requestedCommitSha)) {
        throw new Error(`Invalid commit SHA format: ${requestedCommitSha}`);
      }
      await workspaceGit.fetch(['--depth', '10']);
      await workspaceGit.checkout(requestedCommitSha);
    }

    const log = await workspaceGit.log({ maxCount: 1 });
    let commitSha = requestedCommitSha || 'unknown';
    let parentSha: string | undefined = undefined;

    const latestAny = log.latest as any;
    if (latestAny) {
      commitSha = latestAny.hash;
      if (latestAny.parents && latestAny.parents.length > 0) {
        parentSha = latestAny.parents[0];
      }
    }

    return {
      workspacePath: destinationWorkspace,
      commitSha,
      parentSha,
      filesCount: 0,
    };
  }
}
