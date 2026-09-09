import { NextResponse } from 'next/server';
import { config } from '@/lib/config';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
    engineMode: config.isMockLlm ? 'Deterministic SAST + Heuristic AI' : 'Live Google Gemini AI Engine',
    sastAnalysisEngine: 'Active (Semgrep SAST + AST Symbol Indexer + Pattern Rules)',
    dependencySecurityEngine: 'Active (Package Manifest OSV CVE Lookup)',
    llmProvider: config.isMockLlm ? 'Heuristic Rule Agent (Add GEMINI_API_KEY for Gemini Pro)' : `Google Gemini (${config.geminiModel})`,
    hasGeminiApiKey: !config.isMockLlm,
    model: config.geminiModel,
  });
}
