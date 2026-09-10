import { NextRequest, NextResponse } from 'next/server';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { config } from '@/lib/config';
import { storage } from '@/lib/storage';
import path from 'path';

// Score files by relevance to the user's question
function selectRelevantFiles(
  userMessage: string,
  snapshotFiles: { relativePath: string; content: string }[],
  findings: { file: string; severity: string }[],
  maxFiles = 5,
  maxCharsPerFile = 4000
): { relativePath: string; content: string }[] {
  const msgLower = userMessage.toLowerCase();
  return snapshotFiles
    .map((f) => {
      let score = 0;
      const basename = path.basename(f.relativePath).toLowerCase();
      if (msgLower.includes(basename)) score += 15;
      if (msgLower.includes(f.relativePath.toLowerCase())) score += 20;
      const hasFinding = findings.find(fd =>
        fd.file.includes(f.relativePath) || f.relativePath.includes(path.basename(fd.file))
      );
      if (hasFinding) score += 5;
      if (['critical', 'high'].includes(hasFinding?.severity || '')) score += 5;
      if (/fix|patch|how|explain/i.test(userMessage)) score += 2;
      return { ...f, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, maxFiles)
    .map(f => ({
      relativePath: f.relativePath,
      content: f.content.length > maxCharsPerFile
        ? f.content.slice(0, maxCharsPerFile) + '\n... [truncated]'
        : f.content,
    }));
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { message, history = [] } = await request.json() as {
      message: string;
      history: { role: 'user' | 'assistant'; content: string }[];
    };

    if (!message?.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const review = await storage.getReview(id);
    if (!review) {
      return NextResponse.json({ error: 'Review not found' }, { status: 404 });
    }

    const findings = await storage.getFindings(id);
    const snapshot = storage.getRepoSnapshot(id);

    // Build findings context (always included — small and structured)
    const findingsContext = findings.length > 0
      ? JSON.stringify(findings.map(f => ({
          id: f.id, title: f.title, severity: f.severity, category: f.category,
          file: f.file, start_line: f.start_line, explanation: f.explanation,
          recommended_fix: f.recommended_fix, suggested_patch: f.suggested_patch,
        })), null, 2)
      : 'No findings recorded for this review.';

    // Build file context from snapshot
    let fileSection = '';
    if (snapshot?.files.length) {
      const relevant = selectRelevantFiles(message, snapshot.files, findings);
      if (relevant.length > 0) {
        fileSection = '\n\n## RELEVANT SOURCE FILES:\n' +
          relevant.map(f =>
            `### ${f.relativePath}\n\`\`\`\n${f.content}\n\`\`\``
          ).join('\n\n');
      }
    }

    const historyText = history
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n');

    const systemPrompt = `You are an expert code review assistant for: ${review.repositorySource}
You have full context of this repository's AI-powered security and quality review.
Be specific. Reference exact file names and line numbers. Format code in fenced code blocks.

## REVIEW SUMMARY:
- Repository: ${review.repositorySource}
- Overall Risk: ${review.summary?.overallRisk || 'unknown'}
- Total Findings: ${findings.length}
- Files Affected: ${review.summary?.filesAffected || 0}

## ALL FINDINGS (JSON):
${findingsContext}${fileSection}
${historyText ? `\n## CONVERSATION HISTORY:\n${historyText}` : ''}`;

    if (config.isMockLlm) {
      let mockResponse = '';
      const msgLower = message.toLowerCase();

      const securityFindings = findings.filter(f => f.category === 'security');
      const criticals = findings.filter(f => f.severity === 'critical' || f.severity === 'high');

      if (msgLower.includes('security') || msgLower.includes('vulnerability') || msgLower.includes('vulnerab')) {
        if (securityFindings.length > 0) {
          const sec = securityFindings[0];
          mockResponse = `### 🛡️ Security Vulnerability Analysis\n\n` +
            `Found **${securityFindings.length} security vulnerability finding(s)** in this repository:\n\n` +
            `**1. ${sec.title}** (\`${sec.severity.toUpperCase()}\` severity)\n` +
            `- **Location**: \`${sec.file}:${sec.start_line}\`\n` +
            `- **Rule**: \`${sec.rule}\`\n` +
            `- **Explanation**: ${sec.explanation}\n` +
            `- **Recommended Fix**: ${sec.recommended_fix}\n\n` +
            `**Suggested Patch**:\n\`\`\`typescript\n// Refactored fix for ${sec.rule}\n// Apply in ${sec.file}:${sec.start_line}\n${sec.suggested_patch || sec.recommended_fix}\n\`\`\``;
        } else {
          mockResponse = `### 🛡️ Security Vulnerability Analysis\n\n` +
            `Good news! **0 Security Vulnerabilities** were detected in **${review.repositorySource}**.\n\n` +
            `Total recorded findings in other categories (Quality/Bugs): **${findings.length}**.`;
        }
      } else if (msgLower.includes('critical') || msgLower.includes('high') || msgLower.includes('most')) {
        if (criticals.length > 0) {
          mockResponse = `### 🚨 Top Critical & High Severity Findings (${criticals.length})\n\n` +
            criticals.slice(0, 3).map((f, i) =>
              `**${i + 1}. ${f.title}** (\`${f.severity.toUpperCase()}\` severity)\n` +
              `- **File**: \`${f.file}:${f.start_line}\`\n` +
              `- **Rule**: \`${f.rule}\`\n` +
              `- **Explanation**: ${f.explanation}\n` +
              `- **Recommended Fix**: ${f.recommended_fix}`
            ).join('\n\n');
        } else {
          mockResponse = `No critical or high severity findings were recorded for **${review.repositorySource}**. Total findings: **${findings.length}**.`;
        }
      } else if (msgLower.includes('fix') || msgLower.includes('patch') || msgLower.includes('how to')) {
        const targetFinding = criticals[0] || findings[0];
        if (targetFinding) {
          mockResponse = `### 🛠 How to Fix: ${targetFinding.title}\n\n` +
            `**Location**: \`${targetFinding.file}:${targetFinding.start_line}\`\n\n` +
            `**Explanation**: ${targetFinding.explanation}\n\n` +
            `**Recommended Patch**:\n\`\`\`typescript\n// Refactored fix for ${targetFinding.rule}\n// Apply in ${targetFinding.file}:${targetFinding.start_line}\n${targetFinding.suggested_patch || targetFinding.recommended_fix}\n\`\`\``;
        } else {
          mockResponse = `All security and quality findings look clean for **${review.repositorySource}**!`;
        }
      } else {
        mockResponse = `### 📋 Code Review Summary for ${review.repositorySource}\n\n` +
          `- **Overall Risk Level**: \`${review.summary?.overallRisk?.toUpperCase() || 'NORMAL'}\`\n` +
          `- **Total Findings**: **${findings.length}**\n` +
          `- **Files Scanned**: **${review.summary?.filesAffected || snapshot?.files.length || 0}**\n\n` +
          `Key issues identified include ${findings.slice(0, 2).map(f => `\`${f.title}\``).join(' and ') || 'no major defects'}.\n\n` +
          `*(Note: Add a valid Gemini API key in your \`.env.local\` file to connect to live Gemini 3.6 Flash).*`;
      }

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(mockResponse));
          controller.close();
        },
      });
      return new Response(stream, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }

    const candidateModels = Array.from(new Set([
      config.geminiChatModel,
      config.geminiModel,
      'gemini-3.7-flash',
      'gemini-3.5-flash',
      'gemini-flash-lite-latest',
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite',
    ])).filter(Boolean);

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          let streamResponse = null;
          let lastError: any = null;

          for (const modelName of candidateModels) {
            try {
              const model = new ChatGoogleGenerativeAI({
                apiKey: config.geminiApiKey,
                model: modelName,
                temperature: 0.3,
                streaming: true,
              });

              streamResponse = await model.stream([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: message },
              ]);
              break;
            } catch (err: any) {
              lastError = err;
              if (err?.message?.includes('404') || err?.message?.includes('not found') || err?.message?.includes('ModelService') || err?.message?.includes('no longer available') || err?.message?.includes('429') || err?.message?.includes('Quota')) {
                console.warn(`Model ${modelName} not available, trying next fallback...`);
                continue;
              }
              throw err;
            }
          }

          if (!streamResponse) {
            throw lastError || new Error('No compatible Gemini model found');
          }

          for await (const chunk of streamResponse) {
            const text = typeof chunk.content === 'string'
              ? chunk.content
              : (chunk.content as any[]).map((c: any) => c.type === 'text' ? c.text : '').join('');
            if (text) controller.enqueue(encoder.encode(text));
          }
        } catch (err: any) {
          controller.enqueue(encoder.encode(`\n\n[Error: ${err.message}]`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
