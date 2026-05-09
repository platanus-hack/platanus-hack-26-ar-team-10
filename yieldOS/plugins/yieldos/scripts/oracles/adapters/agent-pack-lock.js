'use strict';

const { pass, fail, unknown } = require('../result');
const agentPack = require('../../agent-pack-command');

function run(projectRoot, options = {}) {
  const packPath = options.packPath || options.pack || 'yield.agent-pack.yaml';
  const result = agentPack.runPack(projectRoot, ['verify', '--pack', packPath], options);
  const subject = { type: 'agent-pack', ref: packPath };

  if (result.exitCode === 0 && result.verification?.checked) {
    return pass({
      id: 'agent-pack-lock',
      kind: 'policy',
      subject,
      scope: { checked: ['manifest policy validation', 'pack lock metadata', 'generated file hashes'], not_checked: ['host-specific runtime enforcement outside yieldOS'] },
      evidence: [
        { type: 'pack', value: result.pack?.name || packPath },
        { type: 'generated-file-count', value: result.verification.generatedFileCount },
      ],
      summary: 'Agent-pack generated files are verified against the pack lock.',
    });
  }

  if (result.exitCode === 0) {
    return unknown({
      id: 'agent-pack-lock',
      kind: 'policy',
      subject,
      scope: { checked: ['manifest policy validation'], not_checked: ['active generated file hashes'] },
      evidence: [{ type: 'verify-output', value: result.message }],
      summary: 'Agent-pack manifest is valid, but no active pack lock was checked.',
      blocking_reason: 'agent-pack-lock-not-checked',
    });
  }

  return fail({
    id: 'agent-pack-lock',
    kind: 'policy',
    subject,
    scope: { checked: ['manifest policy validation or pack lock verification'], not_checked: [] },
    evidence: [{ type: 'verify-output', value: result.message }],
    summary: 'Agent-pack verification failed.',
    blocking_reason: 'agent-pack-verification-failed',
  });
}

module.exports = { run };
