import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { config } from '@/lib/config';
import { OptimizationSuggestion, OptimizationCategory, OptimizationPriority } from '@/types/domain';
import { SnapshotFile } from '@/services/repository/snapshot';
import { v4 as uuidv4 } from 'uuid';

export function parseLLMJsonArray(raw: string): any[] {
  let cleaned = raw.trim();
  // Strip ```json ... ``` or ``` ... ```
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start === -1 || end === -1) return [];
  cleaned = cleaned.slice(start, end + 1);
  try {
    return JSON.parse(cleaned);
  } catch {
    // Try recovering partial array if JSON was truncated
    try {
      const partial = cleaned.slice(0, cleaned.lastIndexOf('},') + 1) + ']';
      return JSON.parse(partial);
    } catch {
      return [];
    }
  }
}

async function runPass(
  candidateModels: string[],
  fileContext: string,
  passName: string,
  passFocus: string
): Promise<OptimizationSuggestion[]> {
  if (config.isMockLlm) {
    return [];
  }

  const prompt = `You are a world-class code refactoring expert performing an automated code optimization pass focusing on: ${passName} (${passFocus}).

Analyze the source files below and output specific optimization/refactoring suggestions.

## SOURCE FILES TO ANALYZE:
${fileContext}

## JSON OUTPUT FORMAT REQUIREMENTS:
Return ONLY a raw JSON array (no markdown, no code fences, no explanation).
Each item in the array MUST match this JSON structure:
[
  {
    "id": "opt-1",
    "file": "path/to/file.ts",
    "start_line": 10,
    "end_line": 25,
    "category": "readability|performance|design-pattern|error-handling|type-safety|dead-code|naming|complexity|security-hardening",
    "priority": "quick-win|medium-effort|refactor",
    "title": "Short title describing the optimization",
    "explanation": "Detailed explanation of why this change is needed",
    "improvement": "Summary of what the improved code does",
    "before_code": "exact code snippet before change",
    "after_code": "improved code snippet after change",
    "estimated_impact": "High/Medium/Low - description of impact"
  }
]

Return ONLY the JSON array.`;

  let lastErr: any = null;
  for (const modelName of candidateModels) {
    try {
      const model = new ChatGoogleGenerativeAI({
        apiKey: config.geminiApiKey,
        model: modelName,
        temperature: 0.2,
      });

      const response = await model.invoke(prompt);
      const content = typeof response.content === 'string'
        ? response.content
        : (response.content as any[]).map(c => c.text || '').join('');
      
      const parsed = parseLLMJsonArray(content);
      return parsed.map((item: any) => ({
        id: item.id || `opt-${uuidv4().slice(0, 8)}`,
        file: item.file || 'unknown',
        start_line: Number(item.start_line) || 1,
        end_line: Number(item.end_line) || 1,
        category: (item.category as OptimizationCategory) || 'readability',
        priority: (item.priority as OptimizationPriority) || 'medium-effort',
        title: item.title || 'Code Optimization',
        explanation: item.explanation || '',
        improvement: item.improvement || '',
        before_code: item.before_code || '',
        after_code: item.after_code || '',
        estimated_impact: item.estimated_impact || 'Moderate code cleanup',
      }));
    } catch (err: any) {
      lastErr = err;
      if (err?.message?.includes('404') || err?.message?.includes('not found') || err?.message?.includes('ModelService')) {
        console.warn(`Optimization pass model ${modelName} not available, trying next fallback...`);
        continue;
      }
      console.error(`Pass ${passName} failed:`, err?.message || err);
      throw err;
    }
  }
  if (lastErr) throw lastErr;
  return [];
}

export async function runOptimizationAgent(files: SnapshotFile[]): Promise<OptimizationSuggestion[]> {
  if (config.isMockLlm) {
    // Return mock suggestions for testing without valid API key
    const suggestions: OptimizationSuggestion[] = [];
    const targetFiles = files.length > 0 ? files : [{ relativePath: 'src/app/example.ts' } as any];

    for (const f of targetFiles.slice(0, 3)) {
      suggestions.push(
        {
          id: `mock-${uuidv4().slice(0, 8)}`,
          file: f.relativePath,
          start_line: 12,
          end_line: 25,
          category: 'type-safety',
          priority: 'quick-win',
          title: 'Add explicit return type annotation to async function',
          explanation: `The async function in ${f.relativePath} relies on implicit return type inference which can leak internal types and slow down compiler checks.`,
          improvement: 'Add explicit return type annotation to the function signature.',
          before_code: `export async function fetchUserData(userId: string) {\n  const res = await fetch(\`/api/users/\${userId}\`);\n  return res.json();\n}`,
          after_code: `export async function fetchUserData(userId: string): Promise<UserResponse> {\n  const res = await fetch(\`/api/users/\${userId}\`);\n  return res.json();\n}`,
          estimated_impact: 'Improves TypeScript type safety and IDE autocomplete speed',
        },
        {
          id: `mock-${uuidv4().slice(0, 8)}`,
          file: f.relativePath,
          start_line: 42,
          end_line: 58,
          category: 'performance',
          priority: 'medium-effort',
          title: 'Optimize repetitive array iteration in filter loop',
          explanation: `Multiple .filter() and .map() calls in ${f.relativePath} traverse array multiple times instead of using a single pass.`,
          improvement: 'Combine array filter and map into a single pass or use a Set lookup.',
          before_code: `const active = items.filter(i => i.active);\nconst names = active.map(i => i.name);`,
          after_code: `const names = items.reduce<string[]>((acc, item) => {\n  if (item.active) acc.push(item.name);\n  return acc;\n}, []);`,
          estimated_impact: 'Reduces memory allocations and improves runtime performance',
        },
        {
          id: `mock-${uuidv4().slice(0, 8)}`,
          file: f.relativePath,
          start_line: 75,
          end_line: 105,
          category: 'complexity',
          priority: 'refactor',
          title: 'Decompose monolithic handler function (>30 lines)',
          explanation: `Function in ${f.relativePath} handles validation, data processing, formatting, and response assembly in a single block.`,
          improvement: 'Extract data querying and validation into dedicated helper modules.',
          before_code: `// Monolithic handler logic in ${f.relativePath}...`,
          after_code: `// Modular refactored handler logic in ${f.relativePath}...`,
          estimated_impact: 'Dramatically improves testability and code readability',
        }
      );
    }
    return suggestions;
  }

  const candidateModels = Array.from(new Set([
    config.geminiChatModel,
    'gemini-2.0-flash',
    'gemini-1.5-flash-latest',
    'gemini-2.5-flash',
    'gemini-1.5-pro',
  ])).filter(Boolean);

  const fileContext = files.map(f =>
    `### FILE: ${f.relativePath}\n\`\`\`${f.language}\n${f.content}\n\`\`\``
  ).join('\n\n');

  const [styleResults, perfResults, archResults, safetyResults] = await Promise.all([
    runPass(candidateModels, fileContext, 'Style & Readability',
      'naming conventions, function length >50 lines, magic numbers/strings, duplication, unclear names'),
    runPass(candidateModels, fileContext, 'Performance',
      'unnecessary re-renders, N+1 patterns, missing memoization, blocking ops, inefficient loops'),
    runPass(candidateModels, fileContext, 'Architecture & Design',
      'Single Responsibility violations, coupling, missing abstractions, God functions >100 lines'),
    runPass(candidateModels, fileContext, 'Error Handling & Type Safety',
      'missing try/catch on async, unhandled rejections, unsafe `as any`, missing null checks'),
  ]);

  const allSuggestions = [...styleResults, ...perfResults, ...archResults, ...safetyResults];

  // Deduplication after merge
  const deduped: OptimizationSuggestion[] = [];
  for (const s of allSuggestions) {
    const overlap = deduped.find(d =>
      d.file === s.file && Math.abs(d.start_line - s.start_line) < 5 && d.category === s.category
    );
    if (!overlap) deduped.push(s);
  }

  return deduped;
}
