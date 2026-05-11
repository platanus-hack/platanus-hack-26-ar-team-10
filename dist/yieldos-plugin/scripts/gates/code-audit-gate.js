'use strict';

const logger = require('../logger');
const ui = require('../ui');
const codeAudit = require('../code-audit');

function handleCodeAuditCommand(projectRoot, command, options = {}) {
  const emitHookOutput = options.emitHookOutput;
  if (typeof emitHookOutput !== 'function') throw new Error('handleCodeAuditCommand requires emitHookOutput');
  if (!codeAudit.isGitAuditCommand(command)) return false;

  let audit;
  try {
    audit = codeAudit.auditGitCommand(projectRoot, command, {
      agent: codeAudit.agentOptionsFromEnv(process.env),
      runtimeConfig: options.runtimeConfig,
    });
  } catch (err) {
    audit = {
      handled: true,
      verdict: 'code-audit-verification-failed',
      action: 'block',
      mode: codeAudit.gitSubcommand(command) === 'push' ? 'push' : 'commit',
      files: [],
      findings: [],
      patch: null,
      message: `yieldOS code-audit failed: ${err.message}`,
    };
  }

  const auditRoot = audit.projectRoot || projectRoot;
  if (audit.files && audit.files.length > 0) {
    try {
      const shouldStageState = audit.mode === 'commit' || (audit.mode === 'push' && audit.action !== 'block');
      const stateWrite = codeAudit.writeAuditState(auditRoot, audit, { stage: shouldStageState });
      audit = {
        ...audit,
        savedFiles: stateWrite.changed ? ['security/code-audit-state.json'] : [],
      };
      if (audit.mode === 'push' && audit.action !== 'block' && !stateWrite.committed) {
        audit = {
          ...audit,
          verdict: 'code-audit-blocked',
          action: 'block',
          message: 'yieldOS code-audit wrote verification state; commit security/code-audit-state.json and rerun git push',
        };
      }
    } catch (err) {
      audit = {
        ...audit,
        verdict: 'code-audit-verification-failed',
        action: 'block',
        message: `yieldOS code-audit could not write verification state: ${err.message}`,
      };
    }
  }

  logger.logCodeAudit(auditRoot, audit);
  ui.writeAudit(audit);
  emitHookOutput([{
    candidate: { type: 'git', name: `git-${audit.mode}`, version: 'unknown' },
    decision: { verdict: audit.verdict },
  }]);
  process.exit(audit.action === 'block' ? 2 : 0);
}

module.exports = { handleCodeAuditCommand };
