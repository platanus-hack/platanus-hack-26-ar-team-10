'use strict';

const path = require('node:path');

const logger = require('../logger');
const injectionScanner = require('../injection-scanner');

async function handleInstructionEdit(input, projectRoot, policy, options = {}) {
  const emitDecision = options.emitDecision;
  const contentForWriteOrEdit = options.contentForWriteOrEdit;
  if (typeof emitDecision !== 'function') throw new Error('handleInstructionEdit requires emitDecision');
  if (typeof contentForWriteOrEdit !== 'function') throw new Error('handleInstructionEdit requires contentForWriteOrEdit');

  const tool = input.tool_name;
  const ti = input.tool_input || {};
  const target = ti.file_path || ti.path;
  if (!target) return false;
  const base = path.basename(target);
  if (!/^(?:CLAUDE\.md|AGENTS\.md|\.cursorrules)$/i.test(base)) return false;
  const edit = contentForWriteOrEdit(tool, ti);
  const content = edit.newContent || '';
  if (typeof content !== 'string' || content.length === 0) return false;
  const findings = injectionScanner.scan(content, (policy['injection-patterns.json'] || {}).patterns);
  if (findings.length === 0) return false;
  const tier = injectionScanner.tierFromInjectionFindings(findings);
  if (tier === 'tier1' || tier === 'tier2') {
    logger.appendEntry(projectRoot, 'Blocked Instruction File Edit (injection)', {
      File: target,
      Findings: findings.map((f) => `${f.id} (${f.severity}): ${f.sample}`),
    });
    emitDecision('injection-blocked', `yieldOS bloqueó edición de ${base}: detectó intento de inyección`, 2);
    return true;
  }
  return false;
}

module.exports = { handleInstructionEdit };
