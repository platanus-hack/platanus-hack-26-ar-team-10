'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const DEFAULTS = require(path.join(PLUGIN_ROOT, 'config', 'defaults.json'));

const SECRET_PATTERNS = [
  /(?:password|passwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key)\s*[:=]\s*\S+/gi,
  /Bearer\s+[A-Za-z0-9._\-]+/g,
  /https?:\/\/[^\s/]*:[^\s/@]+@[^\s]+/g,
  /xox[abprs]-[A-Za-z0-9-]+/g,
  /sk-[A-Za-z0-9]{20,}/g,
  /ghp_[A-Za-z0-9]{20,}/g,
];

function sanitize(input) {
  if (typeof input !== 'string') return input;
  let out = input;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, '[REDACTED]');
  }
  return out;
}

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function ensureLogDir(projectRoot) {
  const logPath = path.join(projectRoot, DEFAULTS.log.path);
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  return logPath;
}

function ensureSecurityLog(projectRoot, filename) {
  const logPath = path.join(projectRoot, 'security', filename);
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  return logPath;
}

function stringifyItem(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try { return JSON.stringify(v); }
  catch (_) { return String(v); }
}

function renderField(key, value) {
  if (value === undefined || value === null) return `- ${key}:`;
  if (Array.isArray(value)) {
    if (value.length === 0) return `- ${key}: []`;
    return `- ${key}:\n${value.map((v) => `  - ${sanitize(stringifyItem(v))}`).join('\n')}`;
  }
  if (typeof value === 'object') {
    return `- ${key}:\n${Object.entries(value).map(([k, v]) => `  - ${k}: ${sanitize(stringifyItem(v))}`).join('\n')}`;
  }
  return `- ${key}: ${sanitize(String(value))}`;
}

function appendEntry(projectRoot, heading, fields) {
  const logPath = ensureLogDir(projectRoot);
  return appendEntryToFile(logPath, heading, fields);
}

function appendEntryToFile(logPath, heading, fields) {
  const stamp = nowStamp();
  const lines = [
    '',
    `## ${stamp} - ${heading}`,
    '',
    ...Object.entries(fields).map(([k, v]) => renderField(k, v)),
    '',
  ];
  fs.appendFileSync(logPath, lines.join('\n'));
  return logPath;
}

function logCodeAudit(projectRoot, audit) {
  const logPath = ensureSecurityLog(projectRoot, 'code-audit-events.md');
  return appendEntryToFile(logPath, 'Code Audit', {
    Mode: audit.mode,
    Verdict: audit.verdict,
    Action: audit.action,
    Files: audit.files,
    Findings: (audit.findings || []).map((f) => `${f.severity}:${f.ruleId}:${f.file} - ${f.title}`),
    'Patch applied': audit.patch?.fixed ? 'yes' : 'no',
    'Patch passes': audit.patch?.iterations,
    'Patched files': audit.patch?.files || [],
    Verification: summarizeVerification(audit.verification),
    Message: audit.message,
  });
}

function summarizeVerification(verification) {
  if (!verification) return '';
  if (!verification.checks?.ran) {
    return verification.ok ? 'static rescan passed; no project checks detected' : verification.checks?.reason;
  }
  const checks = verification.checks.checks || [];
  return checks.map((check) => `${check.name}: ${check.ok ? 'passed' : 'failed'}`).join(', ');
}

function logAllowed(projectRoot, candidate, extra = {}) {
  return appendEntry(projectRoot, 'Allowed Install', {
    Type: candidate.type,
    Name: candidate.name,
    Version: candidate.version,
    Source: candidate.source,
    'Requested by': candidate.requested_by || 'agent',
    Reason: candidate.reason || 'whitelist match',
    Command: candidate.command,
    Verification: extra.verification || 'whitelist exact match',
    'Files changed': extra.files_changed,
    Agent: candidate.agent || 'claude-code',
  });
}

function logBlocked(projectRoot, candidate, blockReason, extra = {}) {
  return appendEntry(projectRoot, 'Blocked Install', {
    Type: candidate.type,
    Name: candidate.name,
    Version: candidate.version,
    Source: candidate.source,
    'Requested by': candidate.requested_by || 'agent',
    Reason: candidate.reason,
    Command: candidate.command,
    'Block reason': blockReason,
    Findings: extra.findings,
    Agent: candidate.agent || 'claude-code',
  });
}

function logVerified(projectRoot, candidate, findings) {
  return appendEntry(projectRoot, 'Verified Install (not allowlisted, passed analysis)', {
    Type: candidate.type,
    Name: candidate.name,
    Version: candidate.version,
    Source: candidate.source,
    'Requested by': candidate.requested_by || 'agent',
    Command: candidate.command,
    Findings: findings && findings.length ? findings : 'no findings',
    Note: 'consider promoting to allowlist via PR to official repo',
    Agent: candidate.agent || 'claude-code',
  });
}

function logRewritten(projectRoot, candidate, rewriteInfo) {
  return appendEntry(projectRoot, 'Rewritten Locally', {
    Type: candidate.type,
    Name: candidate.name,
    Version: candidate.version,
    Source: candidate.source,
    'Requested by': candidate.requested_by || 'agent',
    Command: candidate.command,
    'Rewrite justification': rewriteInfo.justification,
    'Generated files': rewriteInfo.files,
    'Local API exposed': rewriteInfo.api,
    'Marker file': rewriteInfo.marker,
    Agent: candidate.agent || 'claude-code',
  });
}

function logTransitiveAudit(projectRoot, parent, audit) {
  return appendEntry(projectRoot, 'Transitive Audit', {
    'Parent install': `${parent.name}@${parent.version}`,
    'Validated by whitelist': audit.whitelisted,
    'Validated by 10-day rule': audit.aged,
    'Downgraded due to insufficient age': audit.downgraded,
    'Denylist alerts': audit.denylisted,
    'CVE alerts (OSV)': audit.cves,
    'Audit completeness': audit.complete ? 'complete' : 'incomplete',
  });
}

function logInstructionChange(projectRoot, file, summary) {
  return appendEntry(projectRoot, 'Instruction File Change Detected', {
    File: file,
    'Previous hash': summary.previousHash,
    'New hash': summary.newHash,
    'Diff summary': summary.diff,
    Action: summary.action,
  });
}

function logSelfDefense(projectRoot, attempt) {
  return appendEntry(projectRoot, 'Self-Defense Trigger', {
    'Attempted action': attempt.action,
    Target: attempt.target,
    'Blocked at': nowStamp(),
    Reason: 'modification of yieldOS-protected files is not permitted from agent context',
  });
}

module.exports = {
  appendEntry,
  logAllowed,
  logBlocked,
  logVerified,
  logRewritten,
  logTransitiveAudit,
  logInstructionChange,
  logSelfDefense,
  logCodeAudit,
  sanitize,
};
