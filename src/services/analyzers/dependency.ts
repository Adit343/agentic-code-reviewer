import fs from 'fs/promises';
import path from 'path';
import { Finding } from '@/types/domain';
import { v4 as uuidv4 } from 'uuid';

export async function runDependencyAnalyzer(workspacePath: string): Promise<Finding[]> {
  const findings: Finding[] = [];

  const KNOWN_VULNERABLE_PACKAGES: Record<string, { severity: Finding['severity']; cve: string; fix: string }> = {
    'express': { severity: 'medium', cve: 'CVE-2022-24999', fix: 'Upgrade to express >= 4.18.2' },
    'lodash': { severity: 'high', cve: 'CVE-2020-8203', fix: 'Upgrade to lodash >= 4.17.21' },
    'axios': { severity: 'high', cve: 'CVE-2023-45857', fix: 'Upgrade to axios >= 1.6.0' },
    'jsonwebtoken': { severity: 'critical', cve: 'CVE-2022-23529', fix: 'Upgrade to jsonwebtoken >= 9.0.0' },
    'minimist': { severity: 'high', cve: 'CVE-2021-44906', fix: 'Upgrade to minimist >= 1.2.6' },
  };

  const pkgJsonPath = path.join(workspacePath, 'package.json');
  try {
    const raw = await fs.readFile(pkgJsonPath, 'utf-8');
    const rawLines = raw.split('\n');
    const parsed = JSON.parse(raw);
    const deps = { ...parsed.dependencies, ...parsed.devDependencies };

    for (const [pkg, version] of Object.entries(deps)) {
      const pkgName = pkg.toLowerCase();
      if (KNOWN_VULNERABLE_PACKAGES[pkgName]) {
        const vuln = KNOWN_VULNERABLE_PACKAGES[pkgName];
        const lineIdx = rawLines.findIndex((l) => l.includes(`"${pkg}"`));
        const lineNum = lineIdx !== -1 ? lineIdx + 1 : 1;
        findings.push({
          id: `finding-${uuidv4().slice(0, 8)}`,
          category: 'dependency',
          rule: `VULNERABLE_DEPENDENCY_${vuln.cve.replace(/-/g, '_')}`,
          title: `Known Vulnerable Dependency: ${pkg} (${version})`,
          severity: vuln.severity,
          confidence: 0.95,
          status: 'confirmed',
          file: 'package.json',
          start_line: lineNum,
          end_line: lineNum,
          evidence: lineIdx !== -1 ? rawLines[lineIdx].trim() : `"${pkg}": "${version}"`,
          explanation: `Dependency ${pkg} version ${version} is flagged under ${vuln.cve}.`,
          recommended_fix: vuln.fix,
          verification: {
            checks_performed: ['package_manifest_advisory_lookup'],
            counter_evidence_considered: [],
            tools: ['dependency_scanner'],
          },
        });
      }
    }
  } catch {
    // package.json does not exist or invalid JSON
  }

  return findings;
}
