'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { pass, fail, unknown } = require('../result');
const injectionScanner = require('../../injection-scanner');

const POLICY_FILE = path.join(__dirname, '..', '..', '..', 'policy-cache', 'injection-patterns.json');

function run(projectRoot, options = {}) {
  const relativeFile = options.file || 'AGENTS.md';
  const subject = { type: 'instruction-file', ref: relativeFile };
  const file = safeProjectPath(projectRoot, relativeFile);
  const policy = loadPatterns(options.policyPath || POLICY_FILE);
  if (!policy.ok) {
    return unknown({
      id: 'instruction-policy',
      kind: 'policy',
      subject,
      scope: { checked: [], not_checked: ['prompt-injection policy patterns'] },
      evidence: [{ type: 'error', value: policy.error }],
      summary: 'Instruction policy patterns are missing or invalid.',
      blocking_reason: 'instruction-policy-missing',
    });
  }

  if (!fs.existsSync(file)) {
    return unknown({
      id: 'instruction-policy',
      kind: 'policy',
      subject,
      scope: { checked: ['instruction file existence'], not_checked: ['instruction content'] },
      evidence: [{ type: 'file', value: relativeFile }],
      summary: 'Instruction file was not found.',
      blocking_reason: 'instruction-file-missing',
    });
  }

  const content = fs.readFileSync(file, 'utf8');
  const findings = injectionScanner.scan(content, policy.patterns);
  if (findings.length > 0) {
    return fail({
      id: 'instruction-policy',
      kind: 'policy',
      subject,
      scope: { checked: ['prompt-injection regex policy'], not_checked: ['semantic review beyond configured regexes'] },
      evidence: [{ type: 'findings', value: findings }],
      summary: 'Instruction file contains policy-downgrade or prompt-injection patterns.',
      blocking_reason: 'instruction-policy-findings',
    });
  }

  return pass({
    id: 'instruction-policy',
    kind: 'policy',
    subject,
    scope: { checked: ['prompt-injection regex policy'], not_checked: ['full semantic intent of every instruction'] },
    evidence: [{ type: 'patterns', value: policy.patterns.length }],
    summary: 'Instruction file passed configured injection-pattern policy.',
  });
}

function loadPatterns(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(data.patterns) || data.patterns.length === 0) {
      return { ok: false, error: 'patterns list is empty' };
    }
    if (data.patterns.some((pattern) => typeof pattern.regex !== 'string')) {
      return { ok: false, error: 'patterns must use regex keys' };
    }
    return { ok: true, patterns: data.patterns };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function safeProjectPath(projectRoot, relativeFile) {
  if (path.isAbsolute(relativeFile)) throw new Error('instruction file must stay inside the project');
  const root = path.resolve(projectRoot);
  const target = path.resolve(root, relativeFile);
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (target !== root && !target.startsWith(prefix)) throw new Error('instruction file must stay inside the project');
  return target;
}

module.exports = { run, loadPatterns };
