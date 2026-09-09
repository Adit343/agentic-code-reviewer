import { describe, it, expect } from 'vitest';
import { executeReviewPipeline } from '../../src/services/../../src/agents/graph';
import { storage } from '../../src/services/../../src/lib/storage';

describe('Review Pipeline End-to-End Integration Test', () => {
  it('executes full review pipeline on current workspace repository', async () => {
    const reviewId = 'test-rev-1';
    const cwd = process.cwd();
    const review = await storage.createReview({
      id: reviewId,
      repositorySource: cwd,
      provider: 'local',
      commitSha: 'HEAD',
      status: 'queued',
      progressPercent: 0,
      currentPhase: 'Queued',
      toolVersions: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const resultState = await executeReviewPipeline(
      reviewId,
      cwd,
      'local',
      'HEAD'
    );

    expect(resultState.reviewId).toBe(reviewId);
    expect(resultState.fileInventory.length).toBeGreaterThan(0);
    expect(resultState.verifiedFindings).toBeDefined();

    const storedReview = await storage.getReview(reviewId);
    expect(storedReview?.status).toBe('completed');
    expect(storedReview?.progressPercent).toBe(100);
  }, 30000);
});
