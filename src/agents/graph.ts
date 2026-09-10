import { ReviewState, Finding, ReviewSummary } from '@/types/domain';
import { acquireRepository } from '@/services/repository/acquisition';
import { createIsolatedWorkspace } from '@/services/repository/workspace';
import { computeGitDiff } from '@/services/repository/diff';
import { buildCodeIndex, discoverWorkspaceFiles } from '@/services/intelligence/codeIndex';
import { captureRepoSnapshot } from '@/services/repository/snapshot';
import { runSemgrepAnalyzer } from '@/services/analyzers/semgrep';
import { runQualityAnalyzer } from '@/services/analyzers/eslint';
import { runDependencyAnalyzer } from '@/services/analyzers/dependency';
import { AgentToolSet } from './tools';
import {
  runSecurityAgent,
  runBugAgent,
  runQualityAgent,
  runDependencyAgent,
  runVerificationAgent,
} from './llmProvider';
import { storage } from '@/lib/storage';

export async function executeReviewPipeline(
  reviewId: string,
  repositorySource: string,
  provider: 'github' | 'gitlab' | 'url' | 'local',
  requestedCommitSha?: string
): Promise<ReviewState> {
  const startTime = Date.now();

  // Step 1: Update Review status -> acquisition
  await storage.updateReview(reviewId, {
    status: 'acquisiton',
    progressPercent: 10,
    currentPhase: 'Acquiring repository revision...',
  });

  // Step 2: Create isolated workspace
  const workspace = await createIsolatedWorkspace(reviewId);

  try {
    // Step 3: Acquire repo
    const acqResult = await acquireRepository(repositorySource, provider, requestedCommitSha, workspace.path);

    // Step 4: Compute diff if parent exists
    const diffResult = await computeGitDiff(workspace.path, acqResult.commitSha, acqResult.parentSha);

    // Step 5: Fast single-pass snapshot
    await storage.updateReview(reviewId, {
      status: 'static_analysis',
      progressPercent: 30,
      currentPhase: 'Capturing repository snapshot and indexing code...',
      commitSha: acqResult.commitSha,
      parentSha: acqResult.parentSha,
    });

    const fileInventory = await discoverWorkspaceFiles(workspace.path);
    const snapshot = await captureRepoSnapshot(workspace.path, fileInventory, reviewId);
    storage.saveRepoSnapshot(reviewId, snapshot);

    // Step 6: Run Code Intelligence Indexing and Deterministic Analyzers concurrently in memory
    await storage.updateReview(reviewId, {
      status: 'static_analysis',
      progressPercent: 45,
      currentPhase: 'Running deterministic static and security analyzers...',
    });

    const [codeIndex, staticFindings, qualityFindings, dependencyFindings] = await Promise.all([
      buildCodeIndex(workspace.path, snapshot.files),
      runSemgrepAnalyzer(workspace.path, snapshot.files),
      runQualityAnalyzer(workspace.path, snapshot.files),
      runDependencyAnalyzer(workspace.path),
    ]);

    const allStatic = [...staticFindings, ...qualityFindings];

    // Tool set for agents (with preloaded snapshot files for 0ms in-memory reads and precomputed codeIndex)
    const tools = new AgentToolSet(workspace.path, allStatic, dependencyFindings, codeIndex, snapshot.files);

    let state: ReviewState = {
      reviewId,
      repositorySource,
      provider,
      workspacePath: workspace.path,
      commitSha: acqResult.commitSha,
      parentSha: acqResult.parentSha,
      fileInventory: codeIndex.files,
      languageSummary: codeIndex.languages,
      diff: diffResult.rawDiff,
      staticFindings: allStatic,
      dependencyFindings,
      codeIndex,
      candidateFindings: [],
      verifiedFindings: [],
      rejectedFindings: [],
      agentMessages: ['Repository acquired and deterministic analysis completed.'],
      errors: [],
      metrics: {
        startTime,
        totalFilesScanned: codeIndex.files.length,
        tokensUsed: 0,
      },
    };

    // Step 7: Run Specialized Agents in parallel
    await storage.updateReview(reviewId, {
      status: 'agent_review',
      progressPercent: 60,
      currentPhase: 'Running Security, Bug, Quality & Dependency AI agents...',
    });

    const [secCandidates, bugCandidates, qualCandidates, depCandidates] = await Promise.all([
      runSecurityAgent(state, tools),
      runBugAgent(state, tools),
      runQualityAgent(state, tools),
      runDependencyAgent(state, tools),
    ]);

    const rawCandidates = [...secCandidates, ...bugCandidates, ...qualCandidates, ...depCandidates];

    // Deduplicate candidate findings by file + start_line + rule
    const deduplicatedMap = new Map<string, Finding>();
    for (const f of rawCandidates) {
      // Flag if introduced by current commit diff
      if (diffResult.changedFilePaths.includes(f.file)) {
        f.introduced_by_commit = true;
      }
      const key = `${f.file}:${f.start_line}:${f.rule}`;
      if (!deduplicatedMap.has(key)) {
        deduplicatedMap.set(key, f);
      }
    }
    state.candidateFindings = Array.from(deduplicatedMap.values());

    // Step 8: Verification Agent
    await storage.updateReview(reviewId, {
      status: 'verification',
      progressPercent: 80,
      currentPhase: 'Verification agent cross-checking candidate findings for false positives...',
    });

    const verificationResult = await runVerificationAgent(state.candidateFindings, tools);
    state.verifiedFindings = verificationResult.verified;
    state.rejectedFindings = verificationResult.rejected;

    // Compute Review Summary
    const summary = computeReviewSummary(state.verifiedFindings, codeIndex.files.length);

    state.metrics.endTime = Date.now();

    // Step 9: Save findings and update completed review status
    await storage.saveFindings(reviewId, state.verifiedFindings);
    await storage.updateReview(reviewId, {
      status: 'completed',
      progressPercent: 100,
      currentPhase: 'Review completed successfully.',
      summary,
      completedAt: new Date().toISOString(),
    });

    return state;
  } catch (err: any) {
    const existing = await storage.getReview(reviewId);
    await storage.updateReview(reviewId, {
      status: 'failed',
      progressPercent: existing?.progressPercent || 10,
      currentPhase: `Failed: ${err.message}`,
      error: err.message,
    });
    throw err;
  } finally {
    // Cleanup temporary workspace directory
    await workspace.cleanup();
  }
}

export function computeReviewSummary(findings: Finding[], totalFiles: number): ReviewSummary {
  const severityCounts: Record<Finding['severity'], number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };

  const categoryCounts: Record<Finding['category'], number> = {
    security: 0,
    bug: 0,
    dependency: 0,
    quality: 0,
    architecture: 0,
  };

  const confidenceDist = { high: 0, medium: 0, low: 0 };
  const affectedFilesSet = new Set<string>();

  for (const f of findings) {
    severityCounts[f.severity] = (severityCounts[f.severity] || 0) + 1;
    categoryCounts[f.category] = (categoryCounts[f.category] || 0) + 1;
    affectedFilesSet.add(f.file);

    if (f.confidence >= 0.85) confidenceDist.high++;
    else if (f.confidence >= 0.6) confidenceDist.medium++;
    else confidenceDist.low++;
  }

  let overallRisk: ReviewSummary['overallRisk'] = 'clean';
  if (severityCounts.critical > 0) overallRisk = 'critical';
  else if (severityCounts.high > 0) overallRisk = 'high';
  else if (severityCounts.medium > 0) overallRisk = 'medium';
  else if (severityCounts.low > 0) overallRisk = 'low';

  return {
    overallRisk,
    totalFindings: findings.length,
    severityCounts,
    categoryCounts,
    confidenceDistribution: confidenceDist,
    filesAffected: affectedFilesSet.size,
  };
}
