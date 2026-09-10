import { Finding, ReviewState } from '@/types/domain';
import { AgentToolSet } from './tools';
import { v4 as uuidv4 } from 'uuid';

export async function runSecurityAgent(state: ReviewState, tools: AgentToolSet): Promise<Finding[]> {
  // Deterministic Security Agent reasoning over candidate static findings
  const candidateFindings: Finding[] = [...state.staticFindings.filter((f) => f.category === 'security')];

  // Additional security heuristic check: search for sensitive auth or secret handling in files
  const authFiles = state.fileInventory.filter((f) => /auth|login|session|jwt|token|user/i.test(f));
  for (const file of authFiles.slice(0, 10)) {
    const fileData = await tools.readFile(file, 1, 100);
    const lines = fileData.content.split('\n');
    const pwdLineIdx = lines.findIndex(
      (l) => /password/i.test(l) && !/hash|bcrypt|argon|pbkdf/i.test(l)
    );
    if (pwdLineIdx !== -1) {
      const lineNum = pwdLineIdx + 1;
      candidateFindings.push({
        id: `finding-${uuidv4().slice(0, 8)}`,
        category: 'security',
        rule: 'UNHASHED_PASSWORD_USAGE',
        title: 'Potential Unhashed Password Operations in Authentication Flow',
        severity: 'high',
        confidence: 0.82,
        status: 'likely',
        file,
        start_line: lineNum,
        end_line: lineNum,
        evidence: lines[pwdLineIdx].trim(),
        explanation: 'Authentication file references raw password variable without evidence of cryptographic password hashing.',
        recommended_fix: 'Ensure passwords are hashed using bcrypt, argon2, or PBKDF2 before storage or comparison.',
        verification: {
          checks_performed: ['security_agent_auth_flow_analysis'],
          counter_evidence_considered: [],
          tools: ['security_agent'],
        },
      });
    }
  }

  return candidateFindings;
}

export async function runBugAgent(state: ReviewState, tools: AgentToolSet): Promise<Finding[]> {
  const candidateFindings: Finding[] = [];

  // Check changed diff files for logic defects, boundary condition errors, null dereferences
  if (state.diff) {
    const diffMatches = state.diff.match(/const\s+([A-Za-z0-9_$]+)\s*=\s*await\s+.*?;/g);
    if (diffMatches) {
      for (const file of state.fileInventory.filter((f) => /\.(ts|tsx|js|jsx)$/.test(f)).slice(0, 10)) {
        const data = await tools.readFile(file, 1, 150);
        const lines = data.content.split('\n');
        const mapLineIdx = lines.findIndex(
          (l) => l.includes('.map(') && !l.includes('Array.isArray') && !l.includes('?.map')
        );
        if (mapLineIdx !== -1) {
          const lineNum = mapLineIdx + 1;
          candidateFindings.push({
            id: `finding-${uuidv4().slice(0, 8)}`,
            category: 'bug',
            rule: 'UNCHECKED_ARRAY_MAPPING',
            title: 'Potential TypeError: .map() Called on Undefined or Non-Array Variable',
            severity: 'medium',
            confidence: 0.78,
            status: 'likely',
            file,
            start_line: lineNum,
            end_line: lineNum,
            evidence: lines[mapLineIdx].trim(),
            explanation: 'Calling .map() directly on asynchronous API responses without validating array type causes runtime crashes if response is null or an object error payload.',
            recommended_fix: 'Use optional chaining `data?.map(...)` or check `Array.isArray(data)`.',
            verification: {
              checks_performed: ['bug_agent_null_check_analysis'],
              counter_evidence_considered: [],
              tools: ['bug_agent'],
            },
          });
          break;
        }
      }
    }
  }

  return candidateFindings;
}

export async function runQualityAgent(state: ReviewState, tools: AgentToolSet): Promise<Finding[]> {
  return [...state.staticFindings.filter((f) => f.category === 'quality')];
}

export async function runDependencyAgent(state: ReviewState, tools: AgentToolSet): Promise<Finding[]> {
  return [...state.dependencyFindings];
}

export async function runVerificationAgent(
  candidates: Finding[],
  tools: AgentToolSet
): Promise<{ verified: Finding[]; rejected: Finding[] }> {
  const verified: Finding[] = [];
  const rejected: Finding[] = [];

  const results = await Promise.all(
    candidates.map(async (finding) => {
      // Counter-evidence step: inspect if sanitization/validation/authorization exists nearby
      const fileData = await tools.readFile(finding.file, Math.max(1, finding.start_line - 15), finding.end_line + 15);
      const codeSnippet = fileData.content.toLowerCase();

      let hasCounterEvidence = false;
      const counterReasons: string[] = [];

      if (finding.rule === 'SQL_INJECTION' && (codeSnippet.includes('prepare(') || codeSnippet.includes('parameter') || codeSnippet.includes('$1'))) {
        hasCounterEvidence = true;
        counterReasons.push('Found parameterized query indicator ($1 / prepare) in surrounding context.');
      }

      if (finding.rule === 'UNSAFE_INNER_HTML' && (codeSnippet.includes('dompurify') || codeSnippet.includes('sanitize'))) {
        hasCounterEvidence = true;
        counterReasons.push('Found DOMPurify / sanitize library invocation prior to dangerouslySetInnerHTML.');
      }

      if (hasCounterEvidence) {
        finding.status = 'false_positive';
        finding.confidence = Math.max(0.2, finding.confidence - 0.5);
        finding.verification.counter_evidence_considered = counterReasons;
        return { isVerified: false, finding };
      } else {
        finding.status = finding.confidence >= 0.85 ? 'confirmed' : 'likely';
        finding.verification.checks_performed.push('verification_agent_counter_evidence_passed');
        return { isVerified: true, finding };
      }
    })
  );

  for (const r of results) {
    if (r.isVerified) {
      verified.push(r.finding);
    } else {
      rejected.push(r.finding);
    }
  }

  return { verified, rejected };
}
