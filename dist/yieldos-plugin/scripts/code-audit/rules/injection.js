'use strict';

const { makeFinding } = require('./shared');

function dangerousInstructionEdit(item) {
  if (item.sign !== '+') return null;
  if (!/(CLAUDE\.md|AGENTS\.md|\.cursorrules)$/i.test(item.file || '')) return null;
  if (!/(ignore previous|disable yieldos|do not log|without confirmation)/i.test(item.code)) return null;
  return makeFinding(item, 'dangerous-instruction-edit', 'critical', 'Dangerous agent instruction edit', {
    attackerControlledInput: 'Repository instructions control future agent behavior.',
    vulnerableSink: 'Agent instruction file.',
    exploitPath: 'A future agent follows the injected instruction and bypasses controls.',
    impact: 'Security tooling can be disabled or hidden by prompt injection.',
    fixStrategy: 'manual',
  });
}

module.exports = { dangerousInstructionEdit };
