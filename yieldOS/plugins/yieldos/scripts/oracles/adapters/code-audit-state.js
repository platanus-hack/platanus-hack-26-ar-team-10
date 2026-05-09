'use strict';

const fs = require('node:fs');

const { pass, fail, unknown } = require('../result');
const auditState = require('../../code-audit/state');

function run(projectRoot, options = {}) {
  const mode = options.mode || options.context || 'pr';
  const verification = auditState.verifyAuditState(projectRoot, {
    mode,
    baseRef: options.baseRef,
    blockingSeverities: options.blockingSeverities,
  });

  if (verification.ok) {
    const committedCheck = requiresCommittedState(mode, options)
      ? verifyCommittedState(projectRoot)
      : { ok: true };
    if (!committedCheck.ok) {
      return unknown({
        id: 'code-audit-state',
        kind: 'evidence',
        subject: subjectFromVerification(verification),
        scope: { checked: ['diff hash', 'deterministic red-team rescan'], not_checked: ['audit state is not committed in HEAD'] },
        evidence: [{ type: 'reason', value: committedCheck.reason }],
        summary: 'Code-audit state matched the current diff but is not committed for push/PR acceptance.',
        blocking_reason: 'audit-state-not-committed',
      });
    }
    return pass({
      id: 'code-audit-state',
      kind: 'evidence',
      subject: subjectFromVerification(verification),
      scope: { checked: ['diff hash', 'deterministic red-team rescan', 'blocking findings'], not_checked: ['full repository runtime behavior'] },
      evidence: [
        { type: 'reason', value: verification.reason },
        { type: 'diff-hash', value: verification.state?.diff_hash },
        { type: 'mode', value: mode },
      ],
      summary: 'Code-audit state is fresh for the current diff and deterministic rescan is clean.',
    });
  }

  if (verification.reason === 'blocking-findings') {
    return fail({
      id: 'code-audit-state',
      kind: 'evidence',
      subject: subjectFromVerification(verification),
      scope: { checked: ['diff hash', 'deterministic red-team rescan'], not_checked: ['model-assisted findings without deterministic grounding'] },
      evidence: [
        { type: 'reason', value: verification.reason },
        { type: 'blocking-findings', value: summarizeFindings(verification.blockingFindings) },
      ],
      summary: 'Code-audit state verification found blocking findings in the current diff.',
      blocking_reason: 'blocking-findings',
    });
  }

  return unknown({
    id: 'code-audit-state',
    kind: 'evidence',
    subject: subjectFromVerification(verification),
    scope: { checked: ['code-audit state availability'], not_checked: ['fresh acceptance evidence'] },
    evidence: [
      { type: 'reason', value: verification.reason },
      { type: 'error', value: verification.error || '' },
    ],
    summary: `Code-audit state could not be verified: ${verification.reason}.`,
    blocking_reason: verification.reason || 'code-audit-state-unknown',
  });
}

function requiresCommittedState(mode, options = {}) {
  if (options.requireCommittedState === false) return false;
  return mode === 'push' || mode === 'pr';
}

function verifyCommittedState(projectRoot) {
  try {
    const content = fs.readFileSync(auditState.statePath(projectRoot), 'utf8');
    return auditState.isAuditStateCommitted(projectRoot, content)
      ? { ok: true }
      : { ok: false, reason: 'security/code-audit-state.json is not committed in HEAD' };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

function subjectFromVerification(verification = {}) {
  const state = verification.state || {};
  const current = verification.current || {};
  return {
    type: 'git-diff',
    ref: current.diffHash || state.diff_hash || 'unknown',
    mode: state.mode || current.mode || 'unknown',
  };
}

function summarizeFindings(findings = []) {
  return findings.map((finding) => ({
    rule_id: finding.ruleId,
    severity: finding.severity,
    file: finding.file,
    line: finding.line,
  }));
}

module.exports = { run };
