import fs from 'fs/promises';
import path from 'path';
import { CodeIndex, CodeSymbol, ImportRelation } from '@/types/domain';

const DEFAULT_EXCLUDED_PATTERNS = [
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  'coverage',
  '.venv',
  'vendor',
  '__pycache__',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
];

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.mp4', '.webm', '.mp3', '.wav', '.ogg',
  '.pdf', '.zip', '.tar', '.gz', '.7z', '.rar',
  '.exe', '.dll', '.so', '.dylib', '.bin', '.class', '.pyc', '.o', '.obj',
  '.lock', '.wasm', '.sqlite', '.db', '.ds_store', '.sys', '.iso',
]);

const LANGUAGE_EXTENSIONS: Record<string, string> = {
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript (React)',
  '.js': 'JavaScript',
  '.jsx': 'JavaScript (React)',
  '.mjs': 'JavaScript',
  '.cjs': 'JavaScript',
  '.py': 'Python',
  '.go': 'Go',
  '.java': 'Java',
  '.rb': 'Ruby',
  '.rs': 'Rust',
  '.c': 'C',
  '.cpp': 'C++',
  '.h': 'C/C++ Header',
  '.hpp': 'C++ Header',
  '.cs': 'C#',
  '.php': 'PHP',
  '.vue': 'Vue',
  '.svelte': 'Svelte',
  '.html': 'HTML',
  '.css': 'CSS',
  '.scss': 'SCSS',
  '.sass': 'Sass',
  '.json': 'JSON',
  '.yaml': 'YAML',
  '.yml': 'YAML',
  '.toml': 'TOML',
  '.md': 'Markdown',
  '.sql': 'SQL',
  '.graphql': 'GraphQL',
  '.gql': 'GraphQL',
  '.prisma': 'Prisma',
  '.swift': 'Swift',
  '.kt': 'Kotlin',
  '.dart': 'Dart',
  '.sh': 'Shell',
  '.bash': 'Shell',
};

export async function loadGitignorePatterns(workspacePath: string): Promise<string[]> {
  const patterns = [...DEFAULT_EXCLUDED_PATTERNS];
  try {
    const gitignorePath = path.join(workspacePath, '.gitignore');
    const content = await fs.readFile(gitignorePath, 'utf-8');
    const lines = content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
    patterns.push(...lines);
  } catch {
    // Ignore missing .gitignore
  }
  return patterns;
}

export function isIgnoredPath(relPath: string, patterns: string[]): boolean {
  const normalized = relPath.replace(/\\/g, '/');
  const parts = normalized.split('/');
  const basename = parts[parts.length - 1];

  for (let pattern of patterns) {
    pattern = pattern.trim();
    if (!pattern || pattern.startsWith('#')) continue;

    if (pattern.endsWith('/')) pattern = pattern.slice(0, -1);

    if (pattern.startsWith('/')) {
      const match = pattern.slice(1);
      if (normalized === match || normalized.startsWith(match + '/')) return true;
      continue;
    }

    if (pattern.startsWith('*.')) {
      const ext = pattern.slice(1);
      if (normalized.endsWith(ext) || basename.endsWith(ext)) return true;
      continue;
    }

    if (parts.includes(pattern) || normalized === pattern || basename === pattern) {
      return true;
    }
  }

  return false;
}

export async function discoverWorkspaceFiles(workspacePath: string): Promise<string[]> {
  const gitignorePatterns = await loadGitignorePatterns(workspacePath);
  const files: string[] = [];

  async function walkDir(currentPath: string, relativePrefix: string = '') {
    let entries;
    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const relPath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;
      if (isIgnoredPath(relPath, gitignorePatterns)) continue;

      const fullPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        await walkDir(fullPath, relPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (BINARY_EXTENSIONS.has(ext)) continue;
        files.push(relPath);
      }
    }
  }

  await walkDir(workspacePath);
  return files;
}

export async function buildCodeIndex(
  workspacePath: string,
  preloadedFiles?: { relativePath: string; content: string }[]
): Promise<CodeIndex> {
  const files: string[] = [];
  const languages: Record<string, number> = {};
  const symbols: CodeSymbol[] = [];
  const imports: ImportRelation[] = [];
  const callGraph: Record<string, string[]> = {};

  if (preloadedFiles && preloadedFiles.length > 0) {
    // Fast path: In-memory index building from preloaded snapshot
    for (const item of preloadedFiles) {
      files.push(item.relativePath);
      const ext = path.extname(item.relativePath).toLowerCase();
      const lang = LANGUAGE_EXTENSIONS[ext] || 'Other';
      languages[lang] = (languages[lang] || 0) + 1;

      if (/\.(js|jsx|ts|tsx)$/i.test(item.relativePath)) {
        const fileSymbols = extractJsTsSymbols(item.relativePath, item.content);
        symbols.push(...fileSymbols);

        const fileImports = extractJsTsImports(item.relativePath, item.content);
        imports.push(...fileImports);
      }
    }
  } else {
    // Disk path: Discover files and load symbols if preloaded files are not provided
    const discoveredFiles = await discoverWorkspaceFiles(workspacePath);
    for (const f of discoveredFiles) {
      files.push(f);
      const ext = path.extname(f).toLowerCase();
      const lang = LANGUAGE_EXTENSIONS[ext] || 'Other';
      languages[lang] = (languages[lang] || 0) + 1;
    }

    // Parallel batch reading of JS/TS files for symbols & imports
    const jsTsFiles = files.filter(f => /\.(js|jsx|ts|tsx)$/i.test(f));
    const BATCH_SIZE = 25;
    for (let i = 0; i < jsTsFiles.length; i += BATCH_SIZE) {
      const batch = jsTsFiles.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (relFile) => {
          const fullPath = path.join(workspacePath, relFile);
          try {
            const content = await fs.readFile(fullPath, 'utf-8');
            const fileSymbols = extractJsTsSymbols(relFile, content);
            symbols.push(...fileSymbols);

            const fileImports = extractJsTsImports(relFile, content);
            imports.push(...fileImports);
          } catch {
            // ignore individual unreadable files
          }
        })
      );
    }
  }

  // Populate call graph relationships
  for (const sym of symbols) {
    callGraph[sym.name] = [];
  }

  return {
    files,
    languages,
    symbols,
    imports,
    callGraph,
  };
}

export function extractJsTsSymbols(relFile: string, content: string): CodeSymbol[] {
  const symbols: CodeSymbol[] = [];
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    const lineNum = index + 1;
    const isExported = line.includes('export ');

    const funcMatch = line.match(/(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)/);
    if (funcMatch) {
      symbols.push({
        name: funcMatch[1],
        kind: 'function',
        file: relFile,
        line: lineNum,
        exported: isExported,
      });
    }

    const classMatch = line.match(/(?:export\s+)?class\s+([A-Za-z0-9_$]+)/);
    if (classMatch) {
      symbols.push({
        name: classMatch[1],
        kind: 'class',
        file: relFile,
        line: lineNum,
        exported: isExported,
      });
    }

    const arrowMatch = line.match(/(?:export\s+)?const\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?\(/);
    if (arrowMatch) {
      symbols.push({
        name: arrowMatch[1],
        kind: 'function',
        file: relFile,
        line: lineNum,
        exported: isExported,
      });
    }

    const interfaceMatch = line.match(/(?:export\s+)?(?:interface|type)\s+([A-Za-z0-9_$]+)/);
    if (interfaceMatch) {
      symbols.push({
        name: interfaceMatch[1],
        kind: 'interface',
        file: relFile,
        line: lineNum,
        exported: isExported,
      });
    }
  });

  return symbols;
}

export function extractJsTsImports(relFile: string, content: string): ImportRelation[] {
  const relations: ImportRelation[] = [];
  const lines = content.split('\n');

  lines.forEach((line) => {
    const importMatch = line.match(/import\s+(?:\{([^}]+)\}|([A-Za-z0-9_$]+))\s+from\s+['"]([^'"]+)['"]/);
    if (importMatch) {
      const symbolsRaw = importMatch[1] || importMatch[2] || '';
      const symbols = symbolsRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const importedPath = importMatch[3];

      relations.push({
        sourceFile: relFile,
        importedPath,
        importedSymbols: symbols,
      });
    }
  });

  return relations;
}

export async function searchCode(
  workspacePath: string,
  query: string,
  pathFilter?: string
): Promise<{ file: string; line: number; content: string }[]> {
  const results: { file: string; line: number; content: string }[] = [];
  const index = await buildCodeIndex(workspacePath);
  
  let targetFiles = index.files;
  if (pathFilter) {
    targetFiles = targetFiles.filter((f) => f.includes(pathFilter));
  }

  const regex = new RegExp(query, 'i');

  for (const relFile of targetFiles.slice(0, 200)) {
    const fullPath = path.join(workspacePath, relFile);
    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        if (regex.test(line)) {
          results.push({
            file: relFile,
            line: idx + 1,
            content: line.trim(),
          });
        }
      });
    } catch {
      // ignore error
    }
    if (results.length >= 100) break;
  }

  return results;
}
