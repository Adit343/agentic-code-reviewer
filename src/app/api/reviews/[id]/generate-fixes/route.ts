import { NextRequest, NextResponse } from 'next/server';
import { storage } from '@/lib/storage';
import { runFixGeneration } from '@/agents/fixAgent';

// Starts (or retries) background fix generation for findings that don't have a fix yet.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const review = await storage.getReview(id);
  if (!review) return NextResponse.json({ error: 'Review not found' }, { status: 404 });
  if (review.status !== 'completed') return NextResponse.json({ error: 'Review is not complete yet.' }, { status: 409 });
  if (!storage.getRepoSnapshot(id)) {
    return NextResponse.json({ error: 'Repository snapshot is no longer available. Re-run the review.' }, { status: 410 });
  }
  if (review.fixGeneration?.status === 'running') return NextResponse.json({ status: 'running' }, { status: 202 });

  void runFixGeneration(id);
  return NextResponse.json({ status: 'started' }, { status: 202 });
}
