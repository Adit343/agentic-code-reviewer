import fs from 'fs/promises';
import path from 'path';
import { CodeIndex, CodeSymbol, ImportRelation } from '@/types/domain';

const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  'coverage',
  '.venv',
  'vendor',
  '__pycache__',
]);

const LANGUAGE_EXTENSIONS: Record<string, string> = {
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript (React)',
  '.js': 'JavaScript',
  '.jsx': 'JavaScript (React)',
  '.py': 'Python',
  '.go': 'Go',
  '.java': 'Java',
  '.rs': 'Rust',
  '.c': 'C',
  '.cpp': 'C++',
  '.json': 'JSON',
  '.yaml': 'YAML',
  '.yml': 'YAML',
  '.md': 'Markdown',
};

export async function buildCodeIndex(workspacePath: string): Promise<CodeIndex> {
  const files: string[] = [];
  const languages: Record<string, number> = {};

  async function walkDir(currentPath: string, relativePrefix: string = '') {
    let entries;
    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;

      const relPath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;
      const fullPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        await walkDir(fullPath, relPath);
      } else if (entry.isFile()) {
        files.push(relPath);
        const ext = path.extname(entry.name).toLowerCase();
        const lang = LANGUAGE_EXTENSIONS[ext] || 'Other';
        languages[lang] = (languages[lang] || 0) + 1;
      }
    }
  }

  await walkDir(workspacePath);

  const symbols: CodeSymbol[] = [];
  const imports: ImportRelation[] = [];
  const callGraph: Record<string, string[]> = {};

  // Parse JS/TS files for symbols & imports
  for (const relFile of files) {
    if (!/\.(js|jsx|ts|tsx)$/i.test(relFile)) continue;
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

    // Match function definition
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

    // Match class definition
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

    // Match const/let function definitions or arrow functions
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

    // Match type/interface definition
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
