import { NextRequest, NextResponse } from 'next/server';
import { storage } from '@/lib/storage';
import { runOptimizationAgent } from '@/agents/optimizationAgent';
import { OptimizationCategory } from '@/types/domain';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { selectedPaths = [] } = await request.json() as { selectedPaths: string[] };

    const snapshot = storage.getRepoSnapshot(id);
    if (!snapshot) {
      return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 });
    }

    // Filter files: exact match OR file relativePath starts with selected folder path + '/'
    const filtered = snapshot.files.filter(f =>
      selectedPaths.some(p => f.relativePath === p || f.relativePath.startsWith(`${p}/`))
    );

    const targetFiles = filtered.slice(0, 20); // Cap at 20 files max
    const analyzedFilePaths = targetFiles.map(f => f.relativePath);

    storage.updateOptimization(id, {
      status: 'analyzing',
      analyzedFiles: analyzedFilePaths,
    });

    setImmediate(async () => {
      try {
        const suggestions = await runOptimizationAgent(targetFiles);

        let quickWins = 0;
        let mediumEffort = 0;
        let refactors = 0;
        const categoryCounts: Partial<Record<OptimizationCategory, number>> = {};

        for (const s of suggestions) {
          if (s.priority === 'quick-win') quickWins++;
          else if (s.priority === 'medium-effort') mediumEffort++;
          else if (s.priority === 'refactor') refactors++;

          categoryCounts[s.category] = (categoryCounts[s.category] || 0) + 1;
        }

        const overallScore = Math.max(0, 100 - quickWins - mediumEffort * 2 - refactors * 5);

        storage.updateOptimization(id, {
          status: 'completed',
          suggestions,
          summary: {
            quickWins,
            mediumEffort,
            refactors,
            totalSuggestions: suggestions.length,
            categoryCounts,
            overallScore,
          },
          completedAt: new Date().toISOString(),
        });
      } catch (err: any) {
        storage.updateOptimization(id, {
          status: 'failed',
          error: err.message || 'Optimization analysis failed',
        });
      }
    });

    return NextResponse.json({ success: true, message: 'Optimization analysis started' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
