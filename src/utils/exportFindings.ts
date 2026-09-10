import { jsPDF } from 'jspdf';
import { Finding } from '@/types/domain';

export function exportToCSV(findings: Finding[], repoName: string, commitSha: string) {
  const headers = [
    'ID',
    'Title',
    'Severity',
    'Category',
    'Confidence (%)',
    'Status',
    'File',
    'Start Line',
    'End Line',
    'Rule',
    'Explanation',
    'Impact / Threat Scenario',
    'Remediation Guidance',
  ];

  const escapeCSV = (val: unknown) => {
    const str = String(val ?? '').replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows = findings.map((f) => [
    f.id,
    f.title,
    f.severity,
    f.category,
    `${(f.confidence * 100).toFixed(0)}%`,
    f.status,
    f.file,
    f.start_line,
    f.end_line,
    f.rule,
    f.explanation,
    f.attack_scenario || f.impact || 'N/A',
    f.recommended_fix,
  ]);

  const csvContent = [
    headers.map(escapeCSV).join(','),
    ...rows.map((row) => row.map(escapeCSV).join(',')),
  ].join('\n');

  const blob = new Blob(['\ufeff', csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const sanitizedRepo = (repoName || 'repo').replace(/[^a-zA-Z0-9_-]/g, '_');
  link.download = `Audit_Findings_${sanitizedRepo}_${(commitSha || 'latest').slice(0, 8)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportToDOCX(findings: Finding[], repoName: string, commitSha: string) {
  const htmlContent = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset='utf-8'>
      <title>Audit Findings Report - ${repoName}</title>
      <style>
        body { font-family: Calibri, Arial, sans-serif; margin: 30px; color: #0f172a; line-height: 1.4; }
        h1 { color: #1e1b4b; border-bottom: 3px solid #6366f1; padding-bottom: 8px; font-size: 24px; }
        .meta { background-color: #f1f5f9; border-radius: 6px; padding: 12px; font-size: 13px; margin-bottom: 24px; color: #334155; }
        .finding-card { border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px; margin-bottom: 24px; page-break-inside: avoid; }
        .badge { display: inline-block; padding: 3px 8px; border-radius: 4px; font-weight: bold; font-size: 11px; text-transform: uppercase; }
        .critical { background: #ffe4e6; color: #be123c; }
        .high { background: #ffedd5; color: #c2410c; }
        .medium { background: #fef3c7; color: #b45309; }
        .low { background: #dbeafe; color: #1d4ed8; }
        .code-box { background: #0f172a; color: #f8fafc; font-family: 'Courier New', Consolas, monospace; padding: 12px; border-radius: 6px; font-size: 11px; white-space: pre-wrap; margin-top: 10px; }
        .remediation { background: #ecfdf5; border-left: 4px solid #10b981; padding: 10px 14px; margin-top: 12px; font-size: 12px; color: #064e3b; }
      </style>
    </head>
    <body>
      <h1>Security & Code Quality Audit Findings Report</h1>
      <div class="meta">
        <strong>Repository Source:</strong> ${repoName}<br>
        <strong>Commit Reference:</strong> ${commitSha}<br>
        <strong>Report Exported At:</strong> ${new Date().toLocaleString()}<br>
        <strong>Total Verified Findings:</strong> ${findings.length}
      </div>
      ${findings.map((f, i) => `
        <div class="finding-card">
          <h2 style="font-size: 16px; margin-top: 0; color: #0f172a;">${i + 1}. ${f.title}</h2>
          <p>
            <span class="badge ${f.severity}">${f.severity}</span>
            <strong>Category:</strong> ${f.category} | 
            <strong>Status:</strong> ${f.status} | 
            <strong>Confidence:</strong> ${(f.confidence * 100).toFixed(0)}%
          </p>
          <p><strong>Location:</strong> <code>${f.file}:${f.start_line}-${f.end_line}</code></p>
          <p><strong>Rule Reference:</strong> ${f.rule}</p>
          <p><strong>Explanation:</strong> ${f.explanation}</p>
          ${f.attack_scenario || f.impact ? `<p><strong>Threat Scenario:</strong> ${f.attack_scenario || f.impact}</p>` : ''}
          ${f.evidence ? `<div class="code-box"><strong>Evidence Snippet:</strong><br>${f.evidence.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>` : ''}
          <div class="remediation"><strong>Remediation Guidance:</strong><br>${f.recommended_fix}</div>
        </div>
      `).join('')}
    </body>
    </html>
  `;

  const blob = new Blob(['\ufeff', htmlContent], { type: 'application/vnd.ms-word;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const sanitizedRepo = (repoName || 'repo').replace(/[^a-zA-Z0-9_-]/g, '_');
  link.download = `Audit_Findings_${sanitizedRepo}_${(commitSha || 'latest').slice(0, 8)}.docx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportToPDF(findings: Finding[], repoName: string, commitSha: string) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;

  let y = 18;

  // Header Banner Background
  doc.setFillColor(15, 23, 42); // #0f172a (dark slate)
  doc.rect(0, 0, pageWidth, 28, 'F');

  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('Security & Code Quality Audit Report', margin, 12);

  // Subtitle / Meta
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(148, 163, 184); // #94a3b8
  const metaStr = `Repository: ${repoName}  |  Commit: ${(commitSha || '').slice(0, 8)}  |  Total Findings: ${findings.length}  |  Date: ${new Date().toLocaleDateString()}`;
  doc.text(metaStr, margin, 20);

  y = 35;

  findings.forEach((f, idx) => {
    // Page overflow check
    if (y > pageHeight - 35) {
      doc.addPage();
      y = 20;
    }

    // Title
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    const titleLines = doc.splitTextToSize(`${idx + 1}. ${f.title}`, contentWidth);
    doc.text(titleLines, margin, y);
    y += titleLines.length * 5;

    // Severity Badge & Location
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8.5);

    // Color by severity
    if (f.severity === 'critical') doc.setTextColor(225, 29, 72);
    else if (f.severity === 'high') doc.setTextColor(234, 88, 12);
    else if (f.severity === 'medium') doc.setTextColor(217, 119, 6);
    else doc.setTextColor(37, 99, 235);

    doc.text(`[${f.severity.toUpperCase()}]`, margin, y);

    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    const detailsStr = `  Category: ${f.category}  |  Status: ${f.status}  |  File: ${f.file}:${f.start_line}-${f.end_line}`;
    doc.text(detailsStr, margin + 18, y);
    y += 5;

    // Rule
    doc.setFont('Helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`Rule: ${f.rule}`, margin, y);
    y += 5;

    // Explanation
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);
    const expLines = doc.splitTextToSize(`Vulnerability Explanation: ${f.explanation}`, contentWidth);
    doc.text(expLines, margin, y);
    y += expLines.length * 4.2;

    // Evidence snippet
    if (f.evidence) {
      if (y > pageHeight - 30) {
        doc.addPage();
        y = 20;
      }
      doc.setFont('Courier', 'normal');
      doc.setFontSize(7.5);
      const evLines = doc.splitTextToSize(f.evidence, contentWidth - 8);
      const displayEvLines = evLines.slice(0, 6);
      const boxHeight = displayEvLines.length * 3.8 + 5;

      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(margin, y, contentWidth, boxHeight, 2, 2, 'FD');

      doc.setTextColor(15, 23, 42);
      doc.text(displayEvLines, margin + 4, y + 4);
      y += boxHeight + 4;
    }

    // Recommended Fix
    if (y > pageHeight - 25) {
      doc.addPage();
      y = 20;
    }
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(16, 185, 129);
    doc.text('Remediation:', margin, y);

    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(6, 78, 59);
    const fixLines = doc.splitTextToSize(f.recommended_fix, contentWidth - 22);
    doc.text(fixLines, margin + 22, y);
    y += Math.max(fixLines.length * 4.2, 5) + 6;

    // Divider Line
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y - 2, pageWidth - margin, y - 2);
    y += 4;
  });

  const sanitizedRepo = (repoName || 'repo').replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`Audit_Findings_${sanitizedRepo}_${(commitSha || 'latest').slice(0, 8)}.pdf`);
}

export function exportToJSON(findings: Finding[], repoName: string, commitSha: string) {
  const data = {
    repository: repoName,
    commitSha: commitSha,
    exportedAt: new Date().toISOString(),
    totalFindings: findings.length,
    findings: findings,
  };

  const jsonContent = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const sanitizedRepo = (repoName || 'repo').replace(/[^a-zA-Z0-9_-]/g, '_');
  link.download = `Audit_Findings_${sanitizedRepo}_${(commitSha || 'latest').slice(0, 8)}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
