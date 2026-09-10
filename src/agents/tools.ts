import fs from 'fs/promises';
import path from 'path';
import { buildCodeIndex, searchCode } from '@/services/intelligence/codeIndex';
import { computeGitDiff } from '@/services/repository/diff';
import { Finding, CodeIndex } from '@/types/domain';

export class AgentToolSet {
  private fileCache = new Map<string, string[]>();

  constructor(
    private workspacePath: string,
    private staticFindings: Finding[],
    private dependencyFindings: Finding[],
    private codeIndex?: CodeIndex,
    preloadedFiles?: { relativePath: string; content: string }[]
  ) {
    if (preloadedFiles) {
      for (const file of preloadedFiles) {
        const lines = file.content.split('\n');
        const resolved = path.resolve(workspacePath, file.relativePath);
        this.fileCache.set(resolved, lines);
        this.fileCache.set(file.relativePath, lines);
      }
    }
  }

  async listFiles(subPath: string = '.', depth: number = 3): Promise<string[]> {
    if (this.codeIndex && subPath === '.') {
      return this.codeIndex.files;
    }

    const targetDir = path.resolve(this.workspacePath, subPath);
    if (!targetDir.startsWith(this.workspacePath)) {
      throw new Error('Access denied: Path outside workspace boundary');
    }

    const results: string[] = [];

    async function walk(dir: string, currentDepth: number, prefix: string) {
      if (currentDepth > depth) return;
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (['node_modules', '.git', '.next', 'dist', 'build'].includes(entry.name)) continue;
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          results.push(`${rel}/`);
          await walk(path.join(dir, entry.name), currentDepth + 1, rel);
        } else {
          results.push(rel);
        }
      }
    }

    await walk(targetDir, 1, subPath === '.' ? '' : subPath);
    return results;
  }

  async readFile(filePath: string, startLine: number = 1, endLine: number = 200): Promise<{ content: string; totalLines: number }> {
    const targetPath = path.resolve(this.workspacePath, filePath);
    if (!targetPath.startsWith(this.workspacePath)) {
      throw new Error('Access denied: Path outside workspace boundary');
    }

    try {
      let lines = this.fileCache.get(targetPath);
      if (!lines) {
        const raw = await fs.readFile(targetPath, 'utf-8');
        lines = raw.split('\n');
        this.fileCache.set(targetPath, lines);
      }
      const totalLines = lines.length;
      const sliced = lines.slice(Math.max(0, startLine - 1), Math.min(totalLines, endLine));
      return {
        content: sliced.map((l, i) => `${startLine + i}: ${l}`).join('\n'),
        totalLines,
      };
    } catch (err: any) {
      return { content: `Error reading file ${filePath}: ${err.message}`, totalLines: 0 };
    }
  }

  async searchCode(query: string, pathFilter?: string) {
    return searchCode(this.workspacePath, query, pathFilter);
  }

  async findReferences(symbolName: string) {
    const index = this.codeIndex || (await buildCodeIndex(this.workspacePath));
    const references = index.symbols.filter((s) => s.name === symbolName);
    const codeMatches = await searchCode(this.workspacePath, symbolName);
    return {
      symbolDeclarations: references,
      usages: codeMatches,
    };
  }

  async getFileSymbols(filePath: string) {
    const index = this.codeIndex || (await buildCodeIndex(this.workspacePath));
    return index.symbols.filter((s) => s.file === filePath);
  }

  async getImportGraph(filePath: string) {
    const index = this.codeIndex || (await buildCodeIndex(this.workspacePath));
    return index.imports.filter((i) => i.sourceFile === filePath);
  }

  async getGitDiff(headSha: string, baseSha?: string) {
    return computeGitDiff(this.workspacePath, headSha, baseSha);
  }

  async getStaticFindings() {
    return this.staticFindings;
  }

  async getDependencyFindings() {
    return this.dependencyFindings;
  }
}
