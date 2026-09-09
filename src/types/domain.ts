import { z } from 'zod';

export type FindingCategory = 'security' | 'bug' | 'dependency' | 'quality' | 'architecture';
export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type FindingStatus = 'confirmed' | 'likely' | 'needs_review' | 'false_positive' | 'accepted' | 'fixed';

export interface VerificationDetails {
  checks_performed: string[];
  counter_evidence_considered: string[];
  tools: string[];
}

export interface Finding {
  id: string;
  category: FindingCategory;
  rule: string;
  title: string;
  severity: FindingSeverity;
  confidence: number; // 0 to 1
  status: FindingStatus;
  introduced_by_commit?: boolean;
  file: string;
  start_line: number;
  end_line: number;
  evidence: string;
  explanation: string;
  impact?: string;
  attack_scenario?: string;
  recommended_fix: string;
  suggested_patch?: string;
  verification: VerificationDetails;
}

export interface ReviewProject {
  id: string;
  name: string;
  provider: 'github' | 'gitlab' | 'url' | 'local';
  repositoryRef: string;
  defaultBranch: string;
  createdAt: string;
}

export type ReviewStatus = 'queued' | 'acquisiton' | 'static_analysis' | 'agent_review' | 'verification' | 'completed' | 'failed' | 'cancelled';

export interface ToolRun {
  id: string;
  reviewId: string;
  tool: string;
  version: string;
  status: 'success' | 'error';
  durationMs: number;
  findingsCount: number;
  errorDetails?: string;
}

export interface AgentRun {
  id: string;
  reviewId: string;
  agent: string;
  model: string;
  status: 'running' | 'completed' | 'failed';
  tokensUsed?: number;
  durationMs: number;
}

export interface ReviewSummary {
  overallRisk: 'critical' | 'high' | 'medium' | 'low' | 'clean';
  totalFindings: number;
  severityCounts: Record<FindingSeverity, number>;
  categoryCounts: Record<FindingCategory, number>;
  confidenceDistribution: {
    high: number; // >= 0.85
    medium: number; // 0.6 - 0.84
    low: number; // < 0.6
  };
  filesAffected: number;
}

export interface Review {
  id: string;
  projectId?: string;
  repositorySource: string;
  provider: 'github' | 'gitlab' | 'url' | 'local';
  commitSha: string;
  parentSha?: string;
  branch?: string;
  status: ReviewStatus;
  progressPercent: number;
  currentPhase: string;
  summary?: ReviewSummary;
  toolVersions: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: string;
}

export interface CodeSymbol {
  name: string;
  kind: 'function' | 'class' | 'method' | 'interface' | 'variable' | 'type';
  file: string;
  line: number;
  exported: boolean;
}

export interface ImportRelation {
  sourceFile: string;
  importedPath: string;
  resolvedFile?: string;
  importedSymbols: string[];
}

export interface CodeIndex {
  files: string[];
  languages: Record<string, number>;
  symbols: CodeSymbol[];
  imports: ImportRelation[];
  callGraph: Record<string, string[]>; // symbol -> callers/callees
}

export interface ReviewState {
  reviewId: string;
  repositorySource: string;
  provider: 'github' | 'gitlab' | 'url' | 'local';
  workspacePath: string;
  commitSha: string;
  parentSha?: string;
  fileInventory: string[];
  languageSummary: Record<string, number>;
  diff?: string;
  staticFindings: Finding[];
  dependencyFindings: Finding[];
  codeIndex?: CodeIndex;
  candidateFindings: Finding[];
  verifiedFindings: Finding[];
  rejectedFindings: Finding[];
  agentMessages: string[];
  errors: string[];
  metrics: {
    startTime: number;
    endTime?: number;
    totalFilesScanned: number;
    tokensUsed: number;
  };
}

// Zod Validation Schemas
export const CreateReviewSchema = z.object({
  repositorySource: z.string().min(1, 'Repository source is required'),
  provider: z.enum(['github', 'gitlab', 'url', 'local']),
  commitSha: z.string().optional(),
  branch: z.string().optional(),
});

export const FindingZodSchema = z.object({
  id: z.string(),
  category: z.enum(['security', 'bug', 'dependency', 'quality', 'architecture']),
  rule: z.string(),
  title: z.string(),
  severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
  confidence: z.number().min(0).max(1),
  status: z.enum(['confirmed', 'likely', 'needs_review', 'false_positive', 'accepted', 'fixed']),
  introduced_by_commit: z.boolean().optional(),
  file: z.string(),
  start_line: z.number(),
  end_line: z.number(),
  evidence: z.string(),
  explanation: z.string(),
  impact: z.string().optional(),
  attack_scenario: z.string().optional(),
  recommended_fix: z.string(),
  suggested_patch: z.string().optional(),
  verification: z.object({
    checks_performed: z.array(z.string()),
    counter_evidence_considered: z.array(z.string()),
    tools: z.array(z.string()),
  }),
});
