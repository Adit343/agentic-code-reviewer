import { Review, Finding, ReviewProject, ToolRun, AgentRun } from '@/types/domain';

class StorageStore {
  private projects: Map<string, ReviewProject> = new Map();
  private reviews: Map<string, Review> = new Map();
  private findings: Map<string, Finding[]> = new Map(); // reviewId -> Finding[]
  private toolRuns: Map<string, ToolRun[]> = new Map(); // reviewId -> ToolRun[]
  private agentRuns: Map<string, AgentRun[]> = new Map(); // reviewId -> AgentRun[]

  // Project methods
  async createProject(project: ReviewProject): Promise<ReviewProject> {
    this.projects.set(project.id, project);
    return project;
  }

  async getProject(id: string): Promise<ReviewProject | null> {
    return this.projects.get(id) || null;
  }

  async listProjects(): Promise<ReviewProject[]> {
    return Array.from(this.projects.values());
  }

  // Review methods
  async createReview(review: Review): Promise<Review> {
    this.reviews.set(review.id, review);
    return review;
  }

  async updateReview(id: string, updates: Partial<Review>): Promise<Review | null> {
    const existing = this.reviews.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    this.reviews.set(id, updated);
    return updated;
  }

  async getReview(id: string): Promise<Review | null> {
    return this.reviews.get(id) || null;
  }

  async listReviews(): Promise<Review[]> {
    return Array.from(this.reviews.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  // Finding methods
  async saveFindings(reviewId: string, findingsList: Finding[]): Promise<void> {
    this.findings.set(reviewId, findingsList);
  }

  async getFindings(reviewId: string): Promise<Finding[]> {
    return this.findings.get(reviewId) || [];
  }

  async updateFindingStatus(reviewId: string, findingId: string, status: Finding['status']): Promise<Finding | null> {
    const list = this.findings.get(reviewId) || [];
    const finding = list.find((f) => f.id === findingId);
    if (finding) {
      finding.status = status;
      return finding;
    }
    return null;
  }

  // Tool Runs
  async addToolRun(reviewId: string, run: ToolRun): Promise<void> {
    const runs = this.toolRuns.get(reviewId) || [];
    runs.push(run);
    this.toolRuns.set(reviewId, runs);
  }

  async getToolRuns(reviewId: string): Promise<ToolRun[]> {
    return this.toolRuns.get(reviewId) || [];
  }

  // Agent Runs
  async addAgentRun(reviewId: string, run: AgentRun): Promise<void> {
    const runs = this.agentRuns.get(reviewId) || [];
    runs.push(run);
    this.agentRuns.set(reviewId, runs);
  }

  async getAgentRuns(reviewId: string): Promise<AgentRun[]> {
    return this.agentRuns.get(reviewId) || [];
  }
}

// Global singleton instance for development persistence across fast reloads
const globalStore = (global as any).__reviewerStorageStore || new StorageStore();
if (process.env.NODE_ENV !== 'production') {
  (global as any).__reviewerStorageStore = globalStore;
}

export const storage = globalStore as StorageStore;
