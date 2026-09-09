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

export interface ValidationResult {
  valid: boolean;
  error?: string;
  resolvedPath?: string;
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

/**
 * Validates repository existence and accessibility before triggering a review job.
 * Returns a friendly, descriptive error message if invalid or non-existent.
 */
export async function validateRepositoryExistence(
  source: string,
  provider: 'github' | 'gitlab' | 'url' | 'local'
): Promise<ValidationResult> {
  const trimmed = (source || '').trim();
  if (!trimmed) {
    return {
      valid: false,
      error: 'Repository source cannot be empty. Please enter a valid repository path or URL.',
    };
  }

  if (provider === 'local') {
    try {
      const canonicalPath = validateLocalPath(trimmed);
      let stats;
      try {
        stats = await fs.stat(canonicalPath);
      } catch {
        return {
          valid: false,
          error: `Local repository path does not exist: "${trimmed}". Please provide a valid directory path on your system (e.g. "." for current workspace).`,
        };
      }

      if (!stats.isDirectory()) {
        return {
          valid: false,
          error: `Local path "${trimmed}" is a file, not a directory. Please provide the root folder of your project.`,
        };
      }

      try {
        const files = await fs.readdir(canonicalPath);
        if (files.length === 0) {
          return {
            valid: false,
            error: `Directory "${trimmed}" is empty. Please choose a folder containing your project files.`,
          };
        }
      } catch {
        return {
          valid: false,
          error: `Directory "${trimmed}" exists but is not readable. Please verify read permissions for this folder.`,
        };
      }

      return { valid: true, resolvedPath: canonicalPath };
    } catch (err: any) {
      return {
        valid: false,
        error: err.message || `Invalid local path: "${trimmed}".`,
      };
    }
  }

  if (provider === 'github') {
    let clean = trimmed.replace(/\.git$/, '');
    clean = clean.replace(/^https?:\/\/github\.com\//, '').replace(/^\/+/, '');
    const parts = clean.split('/').filter(Boolean);
    if (parts.length < 2) {
      return {
        valid: false,
        error: `Invalid GitHub repository format: "${trimmed}". Please specify in "owner/repo" format or full URL (e.g. "facebook/react" or "https://github.com/facebook/react").`,
      };
    }
    const [owner, repo] = parts;
    const testUrl = `https://github.com/${owner}/${repo}.git/info/refs?service=git-upload-pack`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7000);
      const res = await fetch(testUrl, {
        signal: controller.signal,
        headers: { 'User-Agent': 'agentic-code-reviewer' },
      });
      clearTimeout(timeoutId);

      if (res.status === 200) {
        return { valid: true };
      }
      if (res.status === 401 || res.status === 404 || res.status === 403) {
        return {
          valid: false,
          error: `GitHub repository "${owner}/${repo}" was not found or is private. Please verify the owner and repository name, check for typos, and ensure it is public.`,
        };
      }
      return {
        valid: false,
        error: `GitHub returned status ${res.status} for "${owner}/${repo}". Please check the repository address.`,
      };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return {
          valid: false,
          error: `Connection timed out while verifying GitHub repository "${owner}/${repo}". Please check your internet connection.`,
        };
      }
      return {
        valid: false,
        error: `Could not verify GitHub repository "${owner}/${repo}": ${err.message || 'Network error'}.`,
      };
    }
  }

  if (provider === 'gitlab') {
    let clean = trimmed.replace(/\.git$/, '');
    clean = clean.replace(/^https?:\/\/gitlab\.com\//, '').replace(/^\/+/, '');
    const parts = clean.split('/').filter(Boolean);
    if (parts.length < 2) {
      return {
        valid: false,
        error: `Invalid GitLab repository format: "${trimmed}". Please specify in "owner/repo" format or full URL (e.g. "gitlab-org/gitlab").`,
      };
    }
    const projectPath = parts.join('/');
    const testUrl = `https://gitlab.com/${projectPath}.git/info/refs?service=git-upload-pack`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7000);
      const res = await fetch(testUrl, {
        signal: controller.signal,
        headers: { 'User-Agent': 'agentic-code-reviewer' },
      });
      clearTimeout(timeoutId);

      if (res.status === 200) {
        return { valid: true };
      }
      if (res.status === 401 || res.status === 404 || res.status === 403) {
        return {
          valid: false,
          error: `GitLab repository "${projectPath}" was not found or is private. Please verify the project path, check for typos, and ensure it is public.`,
        };
      }
      return {
        valid: false,
        error: `GitLab returned status ${res.status} for "${projectPath}". Please check the repository path.`,
      };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return {
          valid: false,
          error: `Connection timed out while verifying GitLab repository "${projectPath}". Please check your internet connection.`,
        };
      }
      return {
        valid: false,
        error: `Could not verify GitLab repository "${projectPath}": ${err.message || 'Network error'}.`,
      };
    }
  }

  if (provider === 'url') {
    if (!trimmed.startsWith('https://') && !trimmed.startsWith('http://') && !trimmed.startsWith('git@')) {
      return {
        valid: false,
        error: `Unsupported or invalid Git URL scheme for "${trimmed}". Please enter an HTTP or HTTPS Git repository URL (e.g. "https://github.com/owner/repo.git").`,
      };
    }

    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const testUrl = trimmed.replace(/\.git$/, '') + '.git/info/refs?service=git-upload-pack';
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 7000);
        const res = await fetch(testUrl, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (res.status === 200) {
          return { valid: true };
        }
        if (res.status === 401 || res.status === 404 || res.status === 403) {
          return {
            valid: false,
            error: `Git repository at "${trimmed}" could not be accessed (HTTP ${res.status}). Please verify the URL exists and is publicly accessible.`,
          };
        }
      } catch (err: any) {
        // If the smart HTTP probe fails, we allow clone step to attempt it, or report connection error if network is unreachable
        if (err.name === 'AbortError') {
          return {
            valid: false,
            error: `Connection timed out connecting to "${trimmed}". Please verify the URL and network connection.`,
          };
        }
      }
    }
    return { valid: true };
  }

  return { valid: true };
}

export async function acquireRepository(
  source: string,
  provider: 'github' | 'gitlab' | 'url' | 'local',
  requestedCommitSha: string | undefined,
  destinationWorkspace: string
): Promise<AcquisitionResult> {
  const git: SimpleGit = simpleGit({ baseDir: destinationWorkspace, unsafe: { allowUnsafeEditor: true } });

  if (provider === 'local') {
    const canonicalPath = validateLocalPath(source);
    
    // Check path existence with user-friendly messages
    let stats;
    try {
      stats = await fs.stat(canonicalPath);
    } catch {
      throw new Error(`Local repository path does not exist: "${source}". Please ensure the folder exists and provide a valid path.`);
    }

    if (!stats.isDirectory()) {
      throw new Error(`Local path "${source}" is a file, not a directory. Please provide a folder path containing your project.`);
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

    const localGit = simpleGit({ baseDir: destinationWorkspace, unsafe: { allowUnsafeEditor: true } });
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
        throw new Error(`Invalid commit SHA format: ${requestedCommitSha}. Must be a 7-40 hex character hash or HEAD.`);
      }

      if (requestedCommitSha && requestedCommitSha !== 'HEAD') {
        try {
          await localGit.checkout(requestedCommitSha);
        } catch {
          throw new Error(`Commit revision "${requestedCommitSha}" does not exist in local repository.`);
        }
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
    let cloneUrl = source.trim();
    if (provider === 'github') {
      if (!cloneUrl.startsWith('http://') && !cloneUrl.startsWith('https://')) {
        cloneUrl = `https://github.com/${cloneUrl.replace(/^\//, '').replace(/\.git$/, '')}.git`;
      } else if (!cloneUrl.endsWith('.git')) {
        cloneUrl += '.git';
      }
    } else if (provider === 'gitlab') {
      if (!cloneUrl.startsWith('http://') && !cloneUrl.startsWith('https://')) {
        cloneUrl = `https://gitlab.com/${cloneUrl.replace(/^\//, '').replace(/\.git$/, '')}.git`;
      } else if (!cloneUrl.endsWith('.git')) {
        cloneUrl += '.git';
      }
    }

    // Safety check on cloneUrl scheme
    if (!cloneUrl.startsWith('https://') && !cloneUrl.startsWith('http://') && !cloneUrl.startsWith('git@')) {
      throw new Error(`Unsupported or unsafe repository URL scheme: "${cloneUrl}". Please use an HTTPS repository URL.`);
    }

    const hostGit = simpleGit({ unsafe: { allowUnsafeEditor: true } }).env('GIT_TERMINAL_PROMPT', '0');
    try {
      await hostGit.clone(cloneUrl, destinationWorkspace, ['--depth', '2']);
    } catch (gitErr: any) {
      const msg = gitErr.message || '';
      if (msg.includes('not found') || msg.includes('Repository not found') || msg.includes('fatal: repository')) {
        throw new Error(
          `Repository "${source}" was not found or is inaccessible. Please check for typos and verify that the repository exists and is public.`
        );
      }
      if (msg.includes('Authentication failed') || msg.includes('could not read Username') || msg.includes('terminal prompts disabled')) {
        throw new Error(
          `Authentication required for repository "${source}". Please ensure the repository is public or provide an accessible URL.`
        );
      }
      throw new Error(`Failed to clone repository "${source}": ${msg}`);
    }

    const workspaceGit = simpleGit({ baseDir: destinationWorkspace, unsafe: { allowUnsafeEditor: true } });
    if (requestedCommitSha) {
      if (!validateSha(requestedCommitSha)) {
        throw new Error(`Invalid commit SHA format: "${requestedCommitSha}". Must be a 7-40 hex character hash or HEAD.`);
      }
      try {
        await workspaceGit.fetch(['--depth', '10']);
        await workspaceGit.checkout(requestedCommitSha);
      } catch {
        throw new Error(`Commit revision "${requestedCommitSha}" does not exist in repository "${source}".`);
      }
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
