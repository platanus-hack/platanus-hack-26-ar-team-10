'use strict';

const COLORS = {
  reset: '\u001b[0m',
  dim: '\u001b[2m',
  red: '\u001b[31m',
  green: '\u001b[32m',
  yellow: '\u001b[33m',
  cyan: '\u001b[36m',
};

function shouldColor(stream = process.stderr, env = process.env) {
  return Boolean(stream && stream.isTTY && !env.NO_COLOR && env.CI !== 'true');
}

function formatDecision(decision, options = {}) {
  const color = Boolean(options.color);
  const label = verdictLabel(decision);
  return `[yieldOS] ${paint(label.text, label.color, color)} ${cleanMessage(decision.message || '')}`.trimEnd();
}

function formatVerdict(verdict) {
  return `[yieldOS:verdict] ${verdict}`;
}

function formatRewriteTarget(target) {
  return `[yieldOS:rewrite-target] ${target}`;
}

function formatAuditFindings(audit, options = {}) {
  const findings = (audit.findings || []).slice(0, 3);
  if (findings.length === 0) return [];

  const color = Boolean(options.color);
  const lines = ['[yieldOS] Findings:'];
  for (const finding of findings) {
    const severity = String(finding.severity || 'info').toUpperCase();
    const colorName = severity === 'CRITICAL' || severity === 'HIGH' ? 'red' : severity === 'MEDIUM' ? 'yellow' : 'cyan';
    lines.push(`[yieldOS]   ${paint(severity, colorName, color)} ${finding.ruleId} ${finding.file} - ${finding.title}`);
  }

  const remaining = (audit.findings || []).length - findings.length;
  if (remaining > 0) {
    lines.push(`[yieldOS]   ${paint('...', 'dim', color)} ${remaining} more finding(s)`);
  }
  return lines;
}

function writeDecision(decision, stream = process.stderr) {
  const color = shouldColor(stream);
  if (decision.message) stream.write(`${formatDecision(decision, { color })}\n`);
  stream.write(`${formatVerdict(decision.verdict)}\n`);
}

function writeMessage(message, decision = {}, stream = process.stderr) {
  const color = shouldColor(stream);
  stream.write(`${formatDecision({ ...decision, message }, { color })}\n`);
}

function writeAudit(audit, stream = process.stderr) {
  const color = shouldColor(stream);
  if (audit.message) stream.write(`${formatDecision(audit, { color })}\n`);
  for (const line of formatAuditFindings(audit, { color })) {
    stream.write(`${line}\n`);
  }
  stream.write(`${formatVerdict(audit.verdict)}\n`);
}

function verdictLabel(decision) {
  if (decision.verdict && decision.verdict.includes('fix-applied')) return { text: 'FIXED', color: 'green' };
  if (decision.verdict === 'category-a-rewrite') return { text: 'REWRITE', color: 'cyan' };
  if ((decision.action || '').startsWith('block') || (decision.verdict || '').includes('blocked')) return { text: 'BLOCK', color: 'red' };
  if ((decision.verdict || '').includes('warning')) return { text: 'WARN', color: 'yellow' };
  if (decision.action === 'allow') return { text: 'ALLOW', color: 'green' };
  return { text: 'INFO', color: 'cyan' };
}

function cleanMessage(message) {
  return String(message).replace(/^yieldOS\s+/i, '');
}

function paint(text, colorName, enabled) {
  if (!enabled) return text;
  return `${COLORS[colorName] || ''}${text}${COLORS.reset}`;
}

module.exports = {
  shouldColor,
  formatDecision,
  formatVerdict,
  formatRewriteTarget,
  formatAuditFindings,
  writeDecision,
  writeMessage,
  writeAudit,
};
