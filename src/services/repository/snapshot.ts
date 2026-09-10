import fs from 'fs/promises';
import path from 'path';
import { loadGitignorePatterns, isIgnoredPath } from '@/services/intelligence/codeIndex';

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.mp4', '.webm', '.mp3', '.wav', '.ogg',
  '.pdf', '.zip', '.tar', '.gz', '.7z', '.rar',
  '.exe', '.dll', '.so', '.dylib', '.bin', '.class', '.pyc', '.o', '.obj',
  '.lock', '.wasm', '.sqlite', '.db', '.ds_store', '.sys', '.iso',
]);

const MAX_FILES = 500;
const MAX_TOTAL_BYTES = 25 * 1024 * 1024; // 25MB total
const MAX_FILE_BYTES = 500 * 1024; // 500KB per file

export interface SnapshotFile {
  relativePath: string;
  content: string;
  language: string;
  lineCount: number;
  sizeBytes: number;
}

export interface RepoSnapshot {
  reviewId: string;
  createdAt: string;
  workspaceRoot: string;
  files: SnapshotFile[];
  totalFiles: number;
  totalSizeBytes: number;
  languages: Record<string, number>;
}

function detectLanguage(ext: string): string {
  const map: Record<string, string> = {
    '.ts': 'typescript', '.tsx': 'typescript',
    '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
    '.py': 'python', '.go': 'go', '.java': 'java', '.rb': 'ruby',
    '.rs': 'rust', '.cpp': 'cpp', '.c': 'c', '.h': 'c', '.hpp': 'cpp', '.cs': 'csharp', '.php': 'php',
    '.vue': 'vue', '.svelte': 'svelte', '.html': 'html',
    '.css': 'css', '.scss': 'scss', '.sass': 'sass',
    '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'toml',
    '.md': 'markdown', '.mdx': 'markdown', '.sh': 'bash', '.bash': 'bash',
    '.sql': 'sql', '.graphql': 'graphql', '.gql': 'graphql', '.prisma': 'prisma',
    '.swift': 'swift', '.kt': 'kotlin', '.dart': 'dart',
  };
  return map[ext] || 'plaintext';
}

export async function captureRepoSnapshot(
  workspacePath: string,
  fileInventory: string[],
  reviewId: string
): Promise<RepoSnapshot> {
  const snapshot: RepoSnapshot = {
    reviewId,
    createdAt: new Date().toISOString(),
    workspaceRoot: workspacePath,
    files: [],
    totalFiles: 0,
    totalSizeBytes: 0,
    languages: {},
  };

  const gitignorePatterns = await loadGitignorePatterns(workspacePath);

  // Filter valid candidate paths first
  const validCandidates: { relativePath: string; fullPath: string; ext: string }[] = [];
  for (const item of fileInventory) {
    if (validCandidates.length >= MAX_FILES) break;
    const fullPath = path.isAbsolute(item) ? item : path.join(workspacePath, item);
    const relativePath = path.relative(workspacePath, fullPath).replace(/\\/g, '/');

    if (relativePath.startsWith('..') || isIgnoredPath(relativePath, gitignorePatterns)) {
      continue;
    }

    const ext = path.extname(fullPath).toLowerCase();
    if (BINARY_EXTENSIONS.has(ext)) continue;

    validCandidates.push({ relativePath, fullPath, ext });
  }

  // Read files in parallel batches of 25 for blazing fast async I/O
  const BATCH_SIZE = 25;
  let totalBytes = 0;

  for (let i = 0; i < validCandidates.length; i += BATCH_SIZE) {
    if (totalBytes >= MAX_TOTAL_BYTES) break;
    const batch = validCandidates.slice(i, i + BATCH_SIZE);

    const results = await Promise.all(
      batch.map(async ({ relativePath, fullPath, ext }) => {
        try {
          const stats = await fs.stat(fullPath);
          if (stats.size > MAX_FILE_BYTES) return null;

          const content = await fs.readFile(fullPath, 'utf-8');
          const language = detectLanguage(ext);

          return {
            relativePath,
            content,
            language,
            lineCount: content.split('\n').length,
            sizeBytes: stats.size,
          };
        } catch {
          return null;
        }
      })
    );

    for (const res of results) {
      if (!res) continue;
      if (totalBytes + res.sizeBytes > MAX_TOTAL_BYTES) break;

      snapshot.files.push(res);
      totalBytes += res.sizeBytes;
      snapshot.languages[res.language] = (snapshot.languages[res.language] || 0) + 1;
    }
  }

  snapshot.totalFiles = snapshot.files.length;
  snapshot.totalSizeBytes = totalBytes;
  return snapshot;
}
