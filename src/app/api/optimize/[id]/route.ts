import { NextRequest, NextResponse } from 'next/server';
import { storage } from '@/lib/storage';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const report = storage.getOptimization(id);
  if (!report) {
    return NextResponse.json({ error: 'Optimization report not found' }, { status: 404 });
  }
  return NextResponse.json(report);
}
