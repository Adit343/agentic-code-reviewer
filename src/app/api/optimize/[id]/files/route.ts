import { NextRequest, NextResponse } from 'next/server';
import { storage } from '@/lib/storage';
import { SnapshotFile } from '@/services/repository/snapshot';
import { FileTreeNode } from '@/types/domain';

function buildTree(files: SnapshotFile[]): FileTreeNode[] {
  const root: FileTreeNode[] = [];
  const dirMap = new Map<string, FileTreeNode>();

  for (const file of files) {
    const parts = file.relativePath.split('/');
    let current = root;
    let currentPath = '';

    for (let i = 0; i < parts.length - 1; i++) {
      currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
      if (!dirMap.has(currentPath)) {
        const dir: FileTreeNode = { name: parts[i], path: currentPath, type: 'directory', children: [] };
        dirMap.set(currentPath, dir);
        current.push(dir);
      }
      current = dirMap.get(currentPath)!.children!;
    }

    current.push({
      name: parts[parts.length - 1],
      path: file.relativePath,
      type: 'file',
      language: file.language,
      lineCount: file.lineCount,
      sizeBytes: file.sizeBytes,
    });
  }

  return root;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const snapshot = storage.getRepoSnapshot(id);
  if (!snapshot) {
    return NextResponse.json({ error: 'Repository snapshot not found' }, { status: 404 });
  }

  const tree = buildTree(snapshot.files);
  return NextResponse.json({ tree, totalFiles: snapshot.totalFiles });
}
