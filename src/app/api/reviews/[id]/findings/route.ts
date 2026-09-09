import { NextRequest, NextResponse } from 'next/server';
import { storage } from '@/lib/storage';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const severity = url.searchParams.get('severity');
  const category = url.searchParams.get('category');
  const file = url.searchParams.get('file');

  let findings = await storage.getFindings(id);

  if (severity) {
    findings = findings.filter((f) => f.severity === severity);
  }
  if (category) {
    findings = findings.filter((f) => f.category === category);
  }
  if (file) {
    findings = findings.filter((f) => f.file.includes(file));
  }

  return NextResponse.json({
    total: findings.length,
    findings,
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json();
    const { findingId, status } = body;
    if (!findingId || !status) {
      return NextResponse.json({ error: 'findingId and status are required' }, { status: 400 });
    }

    const updated = await storage.updateFindingStatus(id, findingId, status);
    if (!updated) {
      return NextResponse.json({ error: 'Finding not found' }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
