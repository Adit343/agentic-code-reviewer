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

async function runComprehensiveOptimizationPass(
  candidateModels: string[],
  fileContext: string
): Promise<any[]> {
  const prompt = `You are a world-class code reviewer and optimization expert.
Analyze the provided source code files and find genuine, high-impact optimizations across:
1. Performance (inefficient loops, unnecessary memory allocations, redundant array passes, blocking operations, missing memoization)
2. Type Safety & Error Handling (unsafe \`any\`, missing null/undefined guards, unhandled Promise rejections, missing return types)
3. Readability & Code Cleanliness (overly complex logic, magic strings/numbers, poor naming, dead code)
4. Architecture & Design Patterns (Single Responsibility violations, monolithic functions >30 lines, tight coupling, missing abstractions)

## CRITICAL ACCURACY RULES
1. ONLY suggest optimizations for code that ACTUALLY and EXACTLY exists in the files provided below.
2. The "file" field MUST be the exact relative path of the file from below.
3. The "before_code" MUST be an exact verbatim copy of the code from the file. Do NOT include line number prefixes (e.g. '12 | ') in before_code or after_code.
4. The "after_code" MUST be a concrete, working replacement for before_code.
5. If a file (such as a configuration file, schema, or clean code) has NO genuine optimization issues, DO NOT invent any. Return an empty array []. Accuracy is strictly required.
6. NEVER fabricate functions, variables, or code that do not exist in the files.

## SOURCE FILES TO ANALYZE:
${fileContext}

## JSON OUTPUT FORMAT
Return ONLY a raw JSON array (no markdown fences, no explanation text before or after).
[
  {
    "id": "opt-<unique-short-id>",
    "file": "exact/relative/path/from/above.ts",
    "start_line": <real line number from the file>,
    "end_line": <real line number from the file>,
    "category": "<one of: readability|performance|design-pattern|error-handling|type-safety|dead-code|naming|complexity|security-hardening>",
    "priority": "<one of: quick-win|medium-effort|refactor>",
    "title": "Concise title describing the specific optimization",
    "explanation": "Detailed explanation of WHY this specific code is problematic, referencing the actual code",
    "improvement": "What the improved code does differently and why it's better",
    "before_code": "exact problematic code copied verbatim from the file above",
    "after_code": "concrete improved replacement code",
    "estimated_impact": "High|Medium|Low — specific impact description"
  }
]

Return ONLY the JSON array. If no genuine issues found, return [].`;

  let lastErr: any = null;
  for (const modelName of candidateModels) {
    try {
      const model = new ChatGoogleGenerativeAI({
        apiKey: config.geminiApiKey,
        model: modelName,
        temperature: 0.1,
      });

      console.log(`[Optimizer] Running optimization analysis with model: ${modelName}`);
      const response = await model.invoke(prompt);
      const content = typeof response.content === 'string'
        ? response.content
        : (response.content as any[]).map(c => c.text || '').join('');

      const parsed = parseLLMJsonArray(content);
      console.log(`[Optimizer] Model ${modelName} returned ${parsed.length} raw suggestions`);
      return parsed;
    } catch (err: any) {
      lastErr = err;
      const isRetryable = err?.message?.includes('404') ||
        err?.message?.includes('not found') ||
        err?.message?.includes('ModelService') ||
        err?.message?.includes('no longer available') ||
        err?.message?.includes('429') ||
        err?.message?.includes('Quota');

      if (isRetryable) {
        console.warn(`[Optimizer] Model ${modelName} unavailable (${err?.message?.slice(0, 80)}), checking next fallback...`);
        continue;
      }
      console.error(`[Optimizer] Model ${modelName} failed:`, err?.message || err);
      throw err;
    }
  }

  if (lastErr) {
    const isQuota = lastErr?.message?.includes('429') || lastErr?.message?.includes('Quota') || lastErr?.message?.includes('Too Many Requests');
    if (isQuota) {
      throw new Error('Gemini API free tier rate limit reached. Please wait ~1 minute for quota reset, or use another Gemini API key in your .env.local file.');
    }
    throw lastErr;
  }
  return [];
}

function validateAndAnchorSuggestion(
  item: any,
  filesMap: Map<string, SnapshotFile>
): OptimizationSuggestion | null {
  if (!item || !item.file || !item.before_code) return null;

  // Match file path
  let targetFile = filesMap.get(item.file);
  if (!targetFile) {
    const cleanItemPath = item.file.replace(/^[./\\]+/, '');
    for (const [path, file] of filesMap.entries()) {
      const cleanPath = path.replace(/^[./\\]+/, '');
      if (cleanPath === cleanItemPath || cleanPath.endsWith(cleanItemPath) || cleanItemPath.endsWith(cleanPath)) {
        targetFile = file;
        break;
      }
    }
  }

  if (!targetFile || !targetFile.content) return null;

  const content = targetFile.content;
  const beforeCodeRaw = String(item.before_code).trim();
  if (!beforeCodeRaw) return null;

  // 1. Direct substring check
  let matchStart = content.indexOf(beforeCodeRaw);

  // 2. Normalized line endings check
  if (matchStart === -1) {
    const normContent = content.replace(/\r\n/g, '\n');
    const normBefore = beforeCodeRaw.replace(/\r\n/g, '\n');
    matchStart = normContent.indexOf(normBefore);
  }

  let startLine = Number(item.start_line) || 1;
  let endLine = Number(item.end_line) || startLine;

  if (matchStart !== -1) {
    const textBefore = content.slice(0, matchStart);
    startLine = textBefore.split('\n').length;
    const matchLines = beforeCodeRaw.split('\n').length;
    endLine = startLine + matchLines - 1;
  } else {
    // 3. Line-by-line trimmed matching
    const fileLines = content.split('\n');
    const beforeLines = beforeCodeRaw.split('\n').map(l => l.trim()).filter(Boolean);

    if (beforeLines.length === 0) return null;

    let matchedLineIndex = -1;
    for (let i = 0; i < fileLines.length; i++) {
      if (fileLines[i].trim() === beforeLines[0]) {
        let matchAll = true;
        for (let j = 1; j < beforeLines.length && (i + j) < fileLines.length; j++) {
          if (fileLines[i + j].trim() !== beforeLines[j]) {
            matchAll = false;
            break;
          }
        }
        if (matchAll) {
          matchedLineIndex = i;
          break;
        }
      }
    }

    if (matchedLineIndex === -1) {
      console.warn(`[Optimizer] Discarding suggestion "${item.title}" — before_code does not exist in ${targetFile.relativePath}`);
      return null;
    }

    startLine = matchedLineIndex + 1;
    endLine = matchedLineIndex + beforeLines.length;
  }

  return {
    id: item.id || `opt-${uuidv4().slice(0, 8)}`,
    file: targetFile.relativePath,
    start_line: startLine,
    end_line: Math.max(startLine, endLine),
    category: (item.category as OptimizationCategory) || 'readability',
    priority: (item.priority as OptimizationPriority) || 'medium-effort',
    title: item.title || 'Code Optimization',
    explanation: item.explanation || '',
    improvement: item.improvement || '',
    before_code: item.before_code,
    after_code: item.after_code || '',
    estimated_impact: item.estimated_impact || 'Moderate code cleanup',
  };
}

export async function runOptimizationAgent(files: SnapshotFile[]): Promise<OptimizationSuggestion[]> {
  if (config.isMockLlm) {
    throw new Error('Gemini API key is not configured. Please add a valid GEMINI_API_KEY in your .env.local file to enable code optimization.');
  }

  // Filter out non-code binary or asset files
  const codeFiles = files.filter(f => {
    const ext = f.relativePath.toLowerCase();
    return !ext.match(/\.(png|jpe?g|gif|svg|ico|webp|woff2?|eot|ttf|otf|pdf|lock|map)$/i);
  });

  if (codeFiles.length === 0) {
    return [];
  }

  const filesMap = new Map<string, SnapshotFile>();
  for (const f of codeFiles) {
    filesMap.set(f.relativePath, f);
  }

  console.log(`[Optimizer] Running live LLM optimization on ${codeFiles.length} files`);

  const candidateModels = Array.from(new Set([
    config.geminiModel,
    'gemini-3.7-flash',
    'gemini-3.5-flash',
    'gemini-flash-lite-latest',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    config.geminiChatModel,
  ])).filter(Boolean);

  const fileContext = codeFiles.map(f => {
    const numbered = f.content.split('\n').map((line, idx) => `${idx + 1} | ${line}`).join('\n');
    return `### FILE: ${f.relativePath}\n\`\`\`${f.language || 'text'}\n${numbered}\n\`\`\``;
  }).join('\n\n');

  console.log(`[Optimizer] File context size: ${(fileContext.length / 1024).toFixed(1)}KB across ${codeFiles.length} files`);

  const rawSuggestions = await runComprehensiveOptimizationPass(candidateModels, fileContext);

  // Strictly validate and anchor each suggestion against real file content
  const validSuggestions: OptimizationSuggestion[] = [];
  for (const raw of rawSuggestions) {
    const validated = validateAndAnchorSuggestion(raw, filesMap);
    if (validated) {
      validSuggestions.push(validated);
    }
  }

  // Deduplication
  const deduped: OptimizationSuggestion[] = [];
  for (const s of validSuggestions) {
    const overlap = deduped.find(d =>
      d.file === s.file && Math.abs(d.start_line - s.start_line) < 3 && d.category === s.category
    );
    if (!overlap) deduped.push(s);
  }

  console.log(`[Optimizer] Completed analysis: ${deduped.length} verified suggestions returned (out of ${rawSuggestions.length} raw)`);
  return deduped;
}
