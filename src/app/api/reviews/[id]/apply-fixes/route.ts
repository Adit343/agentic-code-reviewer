import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import simpleGit from 'simple-git';
import { z } from 'zod';
import { storage } from '@/lib/storage';
import { validateLocalPath } from '@/services/repository/acquisition';
import { applyFixesToDisk, buildPatch } from '@/services/fixes/fixEngine';

const BodySchema = z.object({
  findingIds: z.array(z.string()).min(1, 'Select at least one finding.'),
  mode: z.enum(['apply', 'patch']),
  // Local checkout to modify. Required for remote reviews; local reviews use their own source path.
  targetPath: z.string().optional(),
  // Apply even though the repo is on a different branch than the one that was reviewed.
  allowBranchMismatch: z.boolean().optional(),
});

async function resolveTargetRoot(provider: string, source: string, targetPath?: string): Promise<string> {
  const raw = provider === 'local' ? source : targetPath?.trim();
  if (!raw) {
    throw new Error('This review came from a remote repository. Enter the path of your local checkout, or download the patch instead.');
  }
  const root = validateLocalPath(raw);
  const stats = await fs.stat(root).catch(() => null);
  if (!stats?.isDirectory()) throw new Error(`Target path is not a directory: "${raw}".`);
  return root;
}

async function currentBranch(root: string): Promise<string | null> {
  try {
    const git = simpleGit({ baseDir: root });
    if (!(await git.checkIsRepo())) return null;
    const name = (await git.revparse(['--abbrev-ref', 'HEAD'])).trim();
    return name && name !== 'HEAD' ? name : null;
  } catch {
    return null;
  }
}

/** Files among `files` that already have uncommitted changes, so the user knows the diff will be mixed. */
async function findDirtyFiles(root: string, files: string[]): Promise<string[]> {
  try {
    const git = simpleGit({ baseDir: root });
    if (!(await git.checkIsRepo())) return [];
    const status = await git.status();
    const dirty = new Set(status.files.map((f) => f.path));
    return files.filter((f) => dirty.has(path.posix.normalize(f)));
  } catch {
    return [];
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = BodySchema.parse(await req.json());

    const review = await storage.getReview(id);
    if (!review) return NextResponse.json({ error: 'Review not found' }, { status: 404 });

    const all = await storage.getFindings(id);
    const selected = body.findingIds
      .map((fid) => all.find((f) => f.id === fid))
      .filter((f): f is NonNullable<typeof f> => !!f && !!f.fix && f.status !== 'fixed' && f.status !== 'false_positive');
    if (selected.length === 0) {
      return NextResponse.json({ error: 'None of the selected findings has an applicable fix.' }, { status: 400 });
    }

    if (body.mode === 'patch') {
      const snapshot = storage.getRepoSnapshot(id);
      if (!snapshot) {
        return NextResponse.json({ error: 'Repository snapshot is no longer available. Re-run the review.' }, { status: 410 });
      }
      const originals = new Map(snapshot.files.map((f) => [f.relativePath, f.content]));
      const { patch, outcomes } = await buildPatch(originals, selected);
      return NextResponse.json({ patch, outcomes });
    }

    const root = await resolveTargetRoot(review.provider, review.repositorySource, body.targetPath);
    const branchNow = await currentBranch(root);
    if (review.branch && branchNow && branchNow !== review.branch && !body.allowBranchMismatch) {
      return NextResponse.json(
        {
          code: 'BRANCH_MISMATCH',
          error: `This review was run on branch "${review.branch}", but "${root}" is currently on "${branchNow}". Check out "${review.branch}" first so the fixes land on the right branch.`,
          reviewedBranch: review.branch,
          currentBranch: branchNow,
        },
        { status: 409 }
      );
    }
    const dirtyFiles = await findDirtyFiles(root, Array.from(new Set(selected.map((f) => f.file))));
    const { outcomes, typeCheck } = await applyFixesToDisk(root, selected);

    for (const o of outcomes) {
      if (o.status === 'applied') await storage.updateFindingStatus(id, o.findingId, 'fixed');
    }

    return NextResponse.json({ root, dirtyFiles, outcomes, typeCheck, branch: branchNow });
  } catch (err: any) {
    const message = err instanceof z.ZodError ? err.issues[0]?.message : err.message;
    return NextResponse.json({ error: message || 'Failed to apply fixes' }, { status: 400 });
  }
}
