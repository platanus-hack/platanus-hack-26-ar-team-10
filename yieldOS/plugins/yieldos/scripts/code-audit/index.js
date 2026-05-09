'use strict';

const { collectStagedDiff, collectPushDiff } = require('./git');
const { redTeam } = require('./red-team');
const { blueTeam } = require('./blue-team');
const { verifyFix } = require('./verify');
const { writeAuditState, readAuditState, verifyAuditState } = require('./state');

const MAX_FIX_ITERATIONS = 3;
const PATCHABLE_SEVERITIES = ['critical', 'high', 'medium'];
const PUSH_BLOCKING_SEVERITIES = ['critical', 'high', 'medium'];

function isGitCommit(command) {
  return /^\s*git\s+commit(?:\s|$)/.test(command || '');
}

function isGitPush(command) {
  return /^\s*git\s+push(?:\s|$)/.test(command || '');
}

function isGitAuditCommand(command) {
  return isGitCommit(command) || isGitPush(command);
}

function auditGitCommand(projectRoot, command, options = {}) {
  const mode = isGitPush(command) ? 'push' : 'commit';
  const input = mode === 'push' ? collectPushDiff(projectRoot) : collectStagedDiff(projectRoot);

  if (input.files.length === 0 || !input.diff) {
    return result('code-audit-clean', 'allow', mode, input, [], null, 'yieldOS code-audit: no code changes to audit', null, { maxIterations: 0 });
  }

  if (mode === 'push') {
    return auditPush(input);
  }

  return auditCommit(projectRoot, input, options);
}

function auditPush(input) {
  const findings = redTeam(input);
  if (findings.length === 0) {
    return result('code-audit-clean', 'allow', 'push', input, [], null, 'yieldOS code-audit: clean', null, { maxIterations: 0 });
  }

  const highest = highestSeverity(findings);
  if (PUSH_BLOCKING_SEVERITIES.includes(highest)) {
    return result('code-audit-blocked', 'block', 'push', input, findings, null, `yieldOS code-audit blocked unresolved ${highest}-risk code before push`, null, { maxIterations: 0 });
  }

  return result('code-audit-warning', 'allow', 'push', input, findings, null, 'yieldOS code-audit found low-risk code; see log', null, { maxIterations: 0 });
}

function auditCommit(projectRoot, initialInput, options) {
  let input = initialInput;
  let findings = redTeam(input);
  const maxIterations = options.maxFixIterations || MAX_FIX_ITERATIONS;
  const patches = [];

  while (findings.length > 0 && patches.length < maxIterations) {
    const highest = highestSeverity(findings);
    if (!PATCHABLE_SEVERITIES.includes(highest)) break;

    const patch = blueTeam(projectRoot, findings.filter((finding) => finding.severity === highest));
    if (!patch.fixed) break;

    patches.push(patch);
    input = collectStagedDiff(projectRoot);
    findings = redTeam(input);
  }

  if (patches.length > 0) {
    const patch = combinePatches(patches);
    patch.limitReached = findings.length > 0 && patches.length >= maxIterations;
    const verification = verifyFix(projectRoot);
    if (!verification.ok) {
      return result('code-audit-verification-failed', 'block', 'commit', input, findings, patch, verificationFailureMessage(patch), verification, { maxIterations });
    }
    return result('code-audit-fix-applied', 'block', 'commit', input, findings, patch, fixAppliedMessage(patch), verification, { maxIterations });
  }

  if (findings.length === 0) {
    return result('code-audit-clean', 'allow', 'commit', input, [], null, 'yieldOS code-audit: clean', null, { maxIterations });
  }

  const highest = highestSeverity(findings);
  if (highest === 'critical' || highest === 'high') {
    return result('code-audit-blocked', 'block', 'commit', input, findings, null, `yieldOS code-audit blocked unresolved ${highest}-risk code`, null, { maxIterations });
  }

  return result('code-audit-warning', 'allow', 'commit', input, findings, null, `yieldOS code-audit found ${highest}-risk code; see log`, null, { maxIterations });
}

function highestSeverity(findings) {
  const order = ['info', 'low', 'medium', 'high', 'critical'];
  return findings.reduce((highest, finding) => (
    order.indexOf(finding.severity) > order.indexOf(highest) ? finding.severity : highest
  ), 'info');
}

function combinePatches(patches) {
  return {
    fixed: patches.some((patch) => patch.fixed),
    iterations: patches.length,
    files: unique(patches.flatMap((patch) => patch.files || [])),
    appliedFindings: unique(patches.flatMap((patch) => patch.appliedFindings || [])),
  };
}

function fixAppliedMessage(patch) {
  return `yieldOS code-audit applied ${patch.iterations} security fix pass(es); rerun git commit`;
}

function verificationFailureMessage(patch) {
  if (patch.limitReached) {
    return `yieldOS code-audit reached the ${patch.iterations}-pass fix limit before verification was clean`;
  }
  return 'yieldOS code-audit fix did not verify cleanly';
}

function unique(items) {
  return Array.from(new Set(items));
}

function result(verdict, action, mode, input, findings, patch, message, verification = null, meta = {}) {
  return {
    handled: true,
    verdict,
    action,
    mode,
    diffSource: input.diffSource,
    diffHash: input.diffHash,
    range: input.range,
    files: input.files,
    findings,
    patch,
    verification,
    maxIterations: meta.maxIterations || 0,
    message,
  };
}

module.exports = {
  auditGitCommand,
  collectStagedDiff,
  collectPushDiff,
  highestSeverity,
  isGitAuditCommand,
  isGitCommit,
  isGitPush,
  redTeam,
  MAX_FIX_ITERATIONS,
  writeAuditState,
  readAuditState,
  verifyAuditState,
};
