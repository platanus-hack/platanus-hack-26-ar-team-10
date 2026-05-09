'use strict';

const { pass, fail, unknown } = require('../result');
const verify = require('../../code-audit/verify');

function run(projectRoot, options = {}) {
  const context = options.context || 'manual';
  const checks = verify.runDetectedChecks(projectRoot);
  const subject = { type: 'project-tests', ref: context };

  if (!checks.ran) {
    return unknown({
      id: 'project-tests',
      kind: 'test',
      subject,
      blocking: context === 'commit' || context === 'push' || context === 'cdsc' || options.blocking === true,
      blocking_reason: context === 'manual' && options.blocking !== true ? '' : 'project-tests-not-detected',
      scope: { checked: ['project test discovery'], not_checked: ['runtime regression tests'] },
      evidence: [{ type: 'reason', value: checks.reason || 'no project checks detected' }],
      summary: 'No project tests were detected.',
    });
  }

  if (!checks.ok) {
    return fail({
      id: 'project-tests',
      kind: 'test',
      subject,
      scope: { checked: checks.checks.map((check) => check.name), not_checked: [] },
      evidence: [{ type: 'checks', value: summarizeChecks(checks.checks) }],
      summary: 'Project tests failed.',
      blocking_reason: 'project-tests-failed',
    });
  }

  return pass({
    id: 'project-tests',
    kind: 'test',
    subject,
    scope: { checked: checks.checks.map((check) => check.name), not_checked: ['security properties without tests'] },
    evidence: [{ type: 'checks', value: summarizeChecks(checks.checks) }],
    summary: 'Detected project tests passed.',
  });
}

function summarizeChecks(checks = []) {
  return checks.map((check) => ({
    name: check.name,
    status: check.status,
    ok: check.ok,
    stdout: check.stdout,
    stderr: check.stderr,
  }));
}

module.exports = { run };
