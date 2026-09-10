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

  let totalBytes = 0;
  let fileCount = 0;
  const gitignorePatterns = await loadGitignorePatterns(workspacePath);

  for (const item of fileInventory) {
    if (fileCount >= MAX_FILES || totalBytes >= MAX_TOTAL_BYTES) break;

    const fullPath = path.isAbsolute(item) ? item : path.join(workspacePath, item);
    const relativePath = path.relative(workspacePath, fullPath).replace(/\\/g, '/');

    // Skip if relative path goes outside workspaceRoot or matches gitignore
    if (relativePath.startsWith('..') || isIgnoredPath(relativePath, gitignorePatterns)) {
      continue;
    }

    const ext = path.extname(fullPath).toLowerCase();
    const basename = path.basename(fullPath);

    if (BINARY_EXTENSIONS.has(ext)) continue;

    try {
      const stats = await fs.stat(fullPath);
      if (stats.size > MAX_FILE_BYTES) continue;

      const content = await fs.readFile(fullPath, 'utf-8');
      const language = detectLanguage(ext);

      snapshot.files.push({
        relativePath,
        content,
        language,
        lineCount: content.split('\n').length,
        sizeBytes: stats.size,
      });

      totalBytes += stats.size;
      fileCount++;
      snapshot.languages[language] = (snapshot.languages[language] || 0) + 1;
    } catch {
      // Skip unreadable files silently
    }
  }

  snapshot.totalFiles = fileCount;
  snapshot.totalSizeBytes = totalBytes;
  return snapshot;
}
