import simpleGit, { SimpleGit } from 'simple-git';

export interface ChangedFileDiff {
  file: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  addedLines: number[];
  deletedLines: number[];
  diffChunk: string;
}

export interface DiffResult {
  baseSha?: string;
  headSha: string;
  rawDiff: string;
  changedFiles: ChangedFileDiff[];
  changedFilePaths: string[];
}

export async function computeGitDiff(
  workspacePath: string,
  headSha: string,
  baseSha?: string
): Promise<DiffResult> {
  const git: SimpleGit = simpleGit(workspacePath);
  
  let isRepo = false;
  try {
    isRepo = await git.checkIsRepo();
  } catch {
    isRepo = false;
  }

  if (!isRepo) {
    return {
      baseSha,
      headSha,
      rawDiff: '',
      changedFiles: [],
      changedFilePaths: [],
    };
  }

  let rawDiff = '';
  try {
    if (baseSha) {
      rawDiff = await git.diff([`${baseSha}..${headSha}`]);
    } else {
      // Diff against parent commit or first commit
      rawDiff = await git.diff([`${headSha}~1..${headSha}`]);
    }
  } catch {
    try {
      rawDiff = await git.diff(['HEAD~1..HEAD']);
    } catch {
      rawDiff = '';
    }
  }

  const changedFiles = parseGitDiff(rawDiff);
  const changedFilePaths = changedFiles.map((f) => f.file);

  return {
    baseSha,
    headSha,
    rawDiff,
    changedFiles,
    changedFilePaths,
  };
}

export function parseGitDiff(rawDiff: string): ChangedFileDiff[] {
  if (!rawDiff.trim()) return [];

  const files: ChangedFileDiff[] = [];
  const fileChunks = rawDiff.split(/^diff --git /m).filter(Boolean);

  for (const chunk of fileChunks) {
    const lines = chunk.split('\n');
    let filePath = '';
    const headerMatch = lines[0]?.match(/a\/(.+?)\s+b\/(.+)/);
    if (headerMatch) {
      filePath = headerMatch[2];
    }

    if (!filePath) continue;

    let status: ChangedFileDiff['status'] = 'modified';
    if (chunk.includes('new file mode')) status = 'added';
    if (chunk.includes('deleted file mode')) status = 'deleted';
    if (chunk.includes('similarity index')) status = 'renamed';

    const addedLines: number[] = [];
    const deletedLines: number[] = [];
    let currentLineNum = 0;

    for (const line of lines) {
      if (line.startsWith('@@')) {
        const match = line.match(/@@ -\d+,\d+ \+(\d+),\d+ @@/);
        if (match) {
          currentLineNum = parseInt(match[1], 10);
        }
      } else if (line.startsWith('+') && !line.startsWith('+++')) {
        addedLines.push(currentLineNum);
        currentLineNum++;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        deletedLines.push(currentLineNum);
      } else if (!line.startsWith('\\')) {
        currentLineNum++;
      }
    }

    files.push({
      file: filePath,
      status,
      addedLines,
      deletedLines,
      diffChunk: chunk,
    });
  }

  return files;
}

export function isLineInDiff(filePath: string, line: number, diffResult?: DiffResult): boolean {
  if (!diffResult || diffResult.changedFilePaths.length === 0) {
    return false;
  }
  const changed = diffResult.changedFiles.find((f) => f.file === filePath);
  if (!changed) return false;
  return changed.addedLines.includes(line);
}
