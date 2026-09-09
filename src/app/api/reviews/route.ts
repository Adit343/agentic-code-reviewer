import { NextRequest, NextResponse } from 'next/server';
import { CreateReviewSchema, Review } from '@/types/domain';
import { storage } from '@/lib/storage';
import { executeReviewPipeline } from '@/agents/graph';
import { v4 as uuidv4 } from 'uuid';

export async function GET() {
  const reviews = await storage.listReviews();
  return NextResponse.json(reviews);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = CreateReviewSchema.parse(body);

    const reviewId = `rev-${uuidv4().slice(0, 8)}`;
    const now = new Date().toISOString();

    const review: Review = {
      id: reviewId,
      repositorySource: validated.repositorySource,
      provider: validated.provider,
      commitSha: validated.commitSha || 'HEAD',
      branch: validated.branch,
      status: 'queued',
      progressPercent: 0,
      currentPhase: 'Job queued...',
      toolVersions: {
        semgrep: '1.45.0',
        eslint: '9.0.0',
        agenticEngine: '1.0.0',
      },
      createdAt: now,
      updatedAt: now,
    };

    await storage.createReview(review);

    // Trigger async execution of review pipeline
    executeReviewPipeline(reviewId, validated.repositorySource, validated.provider, validated.commitSha).catch((err) => {
      console.error(`Review job ${reviewId} failed:`, err);
    });

    return NextResponse.json(review, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Invalid request body' }, { status: 400 });
  }
}
