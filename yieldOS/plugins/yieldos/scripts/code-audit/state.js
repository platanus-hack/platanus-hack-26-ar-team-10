'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { collectStagedDiff, collectPushDiff, collectBaseDiff, restageFiles } = require('./git');
const { redTeam } = require('./red-team');

const STATE_FILE = path.join('security', 'code-audit-state.json');
const DEFAULT_BLOCKING_BY_MODE = {
  commit: ['critical', 'high'],
  push: ['critical', 'high', 'medium'],
  pr: ['critical', 'high', 'medium'],
};

function statePath(projectRoot) {
  return path.join(projectRoot, STATE_FILE);
}

function writeAuditState(projectRoot, audit, options = {}) {
  const file = statePath(projectRoot);
  const content = auditStateContent(audit);
  const previous = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  const changed = previous !== content;
  const committed = isAuditStateCommitted(projectRoot, content);

  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (changed) fs.writeFileSync(file, content);
  if (changed && options.stage) restageFiles(projectRoot, [STATE_FILE]);
  return { file, changed, committed };
}

function readAuditState(projectRoot) {
  return JSON.parse(fs.readFileSync(statePath(projectRoot), 'utf8'));
}

function buildAuditState(audit) {
  return {
    version: 1,
    mode: audit.mode,
    diff_source: audit.diffSource,
    diff_hash: audit.diffHash,
    range: audit.range,
    files: audit.files || [],
    verdict: audit.verdict,
    action: audit.action,
    max_iterations: audit.maxIterations || 0,
    iterations: audit.patch?.iterations || 0,
    agent_mode: audit.agent?.mode || 'deterministic',
    agent_provider: audit.agent?.provider || 'auto',
    agent_runs: audit.agent?.runs || 0,
    agent_findings: audit.agent?.findings || 0,
    agent_patch_applied: Boolean(audit.agent?.patchApplied),
    agent_errors: audit.agent?.errors || [],
    findings: summarizeFindings(audit.findings || []),
    resolved_findings: audit.patch?.appliedFindings || [],
    verification: summarizeVerification(audit.verification),
  };
}

function auditStateContent(audit) {
  return `${JSON.stringify(buildAuditState(audit), null, 2)}\n`;
}

function isAuditStateCommitted(projectRoot, expectedContent) {
  try {
    const committed = execFileSync('git', ['show', `HEAD:${STATE_FILE}`], {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return committed === expectedContent;
  } catch (_) {
    return false;
  }
}

function verifyAuditState(projectRoot, options = {}) {
  let state;
  try {
    state = readAuditState(projectRoot);
  } catch (err) {
    return { ok: false, reason: 'state-missing', error: err.message };
  }

  const mode = options.mode || state.mode || 'pr';
  let input;
  try {
    input = collectInput(projectRoot, mode, options);
  } catch (err) {
    return { ok: false, reason: 'diff-unavailable', error: err.message, state };
  }

  if (state.diff_hash !== input.diffHash) {
    return { ok: false, reason: 'diff-hash-mismatch', state, current: input };
  }

  const blockingSeverities = options.blockingSeverities || DEFAULT_BLOCKING_BY_MODE[mode] || DEFAULT_BLOCKING_BY_MODE.pr;
  const findings = redTeam(input);
  const blockingFindings = findings.filter((finding) => blockingSeverities.includes(finding.severity));
  if (blockingFindings.length > 0) {
    return { ok: false, reason: 'blocking-findings', state, findings, blockingFindings };
  }

  return { ok: true, reason: 'verified', state, findings, current: input };
}

function collectInput(projectRoot, mode, options) {
  if (mode === 'commit') return collectStagedDiff(projectRoot);
  if (options.baseRef) return collectBaseDiff(projectRoot, options.baseRef, mode);
  if (mode === 'push') return collectPushDiff(projectRoot);
  const baseRef = process.env.CODE_AUDIT_BASE_REF || (process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : 'origin/main');
  return collectBaseDiff(projectRoot, baseRef, mode);
}

function summarizeFindings(findings) {
  return findings.map((finding) => ({
    rule_id: finding.ruleId,
    severity: finding.severity,
    file: finding.file,
    title: finding.title,
    status: 'unresolved',
  }));
}

function summarizeVerification(verification) {
  if (!verification) return { static_rescan: 'not-run', checks: [] };
  return {
    static_rescan: verification.blockingFindings && verification.blockingFindings.length > 0 ? 'failed' : 'passed',
    checks: verification.checks?.checks ? verification.checks.checks.map((check) => ({
      name: check.name,
      status: check.ok ? 'passed' : 'failed',
    })) : [],
  };
}

module.exports = {
  STATE_FILE,
  statePath,
  buildAuditState,
  auditStateContent,
  isAuditStateCommitted,
  writeAuditState,
  readAuditState,
  verifyAuditState,
  collectInput,
};
