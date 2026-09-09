import { NextRequest, NextResponse } from 'next/server';
import { storage } from '@/lib/storage';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const review = await storage.getReview(id);
  if (!review) {
    return NextResponse.json({ error: 'Review not found' }, { status: 404 });
  }

  const toolRuns = await storage.getToolRuns(id);
  const agentRuns = await storage.getAgentRuns(id);

  return NextResponse.json({
    review,
    toolRuns,
    agentRuns,
  });
}
