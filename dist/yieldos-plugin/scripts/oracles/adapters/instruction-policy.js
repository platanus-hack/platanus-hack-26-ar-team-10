'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { pass, fail, unknown } = require('../result');
const injectionScanner = require('../../injection-scanner');
const policyFetcher = require('../../policy-fetcher');

const POLICY_ROOT = path.join(__dirname, '..', '..', '..', 'policy-cache');

function run(projectRoot, options = {}) {
  const relativeFile = options.file || 'AGENTS.md';
  const subject = { type: 'instruction-file', ref: relativeFile };
  const file = safeProjectPath(projectRoot, relativeFile);
  const policy = loadPatternsFromPolicyRoot(options.policyRoot || POLICY_ROOT);
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

function loadPatternsFromPolicyRoot(policyRoot) {
  const policy = policyFetcher.loadFromPolicyDirectory(policyRoot);
  if (!policy) {
    return { ok: false, error: 'policy bundle failed integrity verification' };
  }
  return validatePatterns(policy['injection-patterns.json']);
}

function loadPatterns(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return validatePatterns(data);
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function validatePatterns(data) {
  if (!data || !Array.isArray(data.patterns) || data.patterns.length === 0) {
    return { ok: false, error: 'patterns list is empty' };
  }
  if (data.patterns.some((pattern) => typeof pattern.regex !== 'string')) {
    return { ok: false, error: 'patterns must use regex keys' };
  }
  return { ok: true, patterns: data.patterns };
}

function safeProjectPath(projectRoot, relativeFile) {
  if (path.isAbsolute(relativeFile)) throw new Error('instruction file must stay inside the project');
  const root = path.resolve(projectRoot);
  const target = path.resolve(root, relativeFile);
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (target !== root && !target.startsWith(prefix)) throw new Error('instruction file must stay inside the project');
  return target;
}

module.exports = { run, loadPatterns, loadPatternsFromPolicyRoot };
