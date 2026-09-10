import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { storage } from '@/lib/storage';
import { validateRepositoryExistence } from '@/services/repository/acquisition';
import { OptimizationReport } from '@/types/domain';

export async function POST(request: NextRequest) {
  try {
    const { repositorySource, provider = 'github' } = await request.json() as {
      repositorySource: string;
      provider: 'github' | 'gitlab' | 'url' | 'local';
    };

    if (!repositorySource?.trim()) {
      return NextResponse.json({ error: 'Repository source is required' }, { status: 400 });
    }

    const searchParams = request.nextUrl.searchParams;
    const reviewId = searchParams.get('reviewId');

    const validation = await validateRepositoryExistence(repositorySource, provider);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error || 'Repository does not exist or is unreachable' }, { status: 400 });
    }

    const id = uuidv4();
    const initialReport: OptimizationReport = {
      id,
      repositorySource,
      provider,
      analyzedFiles: [],
      totalFilesInRepo: 0,
      suggestions: [],
      summary: {
        quickWins: 0,
        mediumEffort: 0,
        refactors: 0,
        totalSuggestions: 0,
        categoryCounts: {},
        overallScore: 100,
      },
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    storage.saveOptimization(id, initialReport);

    // If reviewId is provided, check if a snapshot already exists to skip re-cloning
    if (reviewId) {
      const existingSnapshot = storage.getRepoSnapshot(reviewId);
      if (existingSnapshot) {
        // Copy existing snapshot for this optimization job
        storage.saveRepoSnapshot(id, { ...existingSnapshot, reviewId: id });
        storage.updateOptimization(id, {
          status: 'analyzing',
          totalFilesInRepo: existingSnapshot.totalFiles,
        });
        return NextResponse.json({ optimizationId: id });
      }
    }

    // Trigger background acquisition
    storage.updateOptimization(id, { status: 'acquiring' });

    setImmediate(async () => {
      try {
        const { createIsolatedWorkspace } = await import('@/services/repository/workspace');
        const { acquireRepository } = await import('@/services/repository/acquisition');
        const { buildCodeIndex } = await import('@/services/intelligence/codeIndex');
        const { captureRepoSnapshot } = await import('@/services/repository/snapshot');

        const workspace = await createIsolatedWorkspace(id);
        try {
          await acquireRepository(repositorySource, provider, undefined, workspace.path);
          const codeIndex = await buildCodeIndex(workspace.path);
          const snap = await captureRepoSnapshot(workspace.path, codeIndex.files, id);
          storage.saveRepoSnapshot(id, snap);
          storage.updateOptimization(id, {
            status: 'analyzing',
            totalFilesInRepo: snap.totalFiles,
          });
        } finally {
          await workspace.cleanup();
        }
      } catch (err: any) {
        storage.updateOptimization(id, { status: 'failed', error: err.message });
      }
    });

    return NextResponse.json({ optimizationId: id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
