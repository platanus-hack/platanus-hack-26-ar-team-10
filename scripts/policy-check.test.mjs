import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { validatePolicyRoot } from './policy-check.mjs';

const POLICY_FILES = [
  'allowlist.json',
  'denylist.json',
  'categories.json',
  'native-equivalents.json',
  'skills.json',
  'mcps.json',
  'injection-patterns.json',
  'build-scripts-allowed.json',
  'required-settings.json',
  'version.json',
];

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function makePolicyRoot(overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yieldos-policy-'));
  const base = {
    'allowlist.json': { version: 'test', entries: [{ key: 'npm:react' }] },
    'denylist.json': { version: 'test', entries: [{ key: 'npm:event-stream', reason: 'known incident' }] },
    'categories.json': { version: 'test', A_safe_to_rewrite: [], D_never_rewrite: [] },
    'native-equivalents.json': { version: 'test', entries: {} },
    'skills.json': {
      version: 'test',
      entries: [{ key: 'skill:dependency-gate', category: 'self', vendor: 'yieldos', purpose: 'gate' }],
      rules: { default_unlisted: 'block' },
    },
    'mcps.json': {
      version: 'test',
      entries: [{
        key: 'mcp:filesystem',
        vendor: 'modelcontextprotocol',
        purpose: 'read files',
        approved_tools: ['read_file'],
        denied_tools: ['write_file'],
        scope: 'read-only',
      }],
      rules: { default_unlisted: 'block', validate_tool_surface_at_registration: true },
    },
    'injection-patterns.json': {
      version: 'test',
      patterns: [{ id: 'ignore-previous', regex: 'ignore previous instructions', severity: 'critical' }],
    },
    'build-scripts-allowed.json': { version: 'test', entries: [] },
    'required-settings.json': { version: 'test', managers: {} },
    'version.json': { version: 'test' },
    ...overrides,
  };

  for (const file of POLICY_FILES) {
    writeJson(path.join(root, 'policy', file), base[file]);
    writeJson(path.join(root, 'yieldOS/plugins/yieldos/policy-cache', file), base[file]);
  }
  return root;
}

test('validatePolicyRoot accepts well-formed policy and synced cache', () => {
  const root = makePolicyRoot();
  assert.deepEqual(validatePolicyRoot(root), []);
});

test('validatePolicyRoot rejects unsafe MCP tool overlap and stale cache', () => {
  const root = makePolicyRoot({
    'mcps.json': {
      version: 'test',
      entries: [{
        key: 'mcp:filesystem',
        vendor: 'modelcontextprotocol',
        purpose: 'read files',
        approved_tools: ['read_file', 'write_file'],
        denied_tools: ['write_file'],
        scope: 'read-only',
      }],
      rules: { default_unlisted: 'allow', validate_tool_surface_at_registration: false },
    },
  });
  writeJson(path.join(root, 'yieldOS/plugins/yieldos/policy-cache/mcps.json'), { version: 'stale' });

  const errors = validatePolicyRoot(root);
  assert.equal(errors.some((error) => error.includes('mcps.json rules.default_unlisted must be block')), true);
  assert.equal(errors.some((error) => error.includes('approved and denied tools overlap')), true);
  assert.equal(errors.some((error) => error.includes('policy-cache/mcps.json differs')), true);
});

test('validatePolicyRoot rejects malformed non-entry policy schemas', () => {
  const root = makePolicyRoot({
    'categories.json': { version: 'test', A_safe_to_rewrite: 'npm:clsx', D_never_rewrite: [] },
    'native-equivalents.json': { version: 'test', entries: [] },
    'injection-patterns.json': { version: 'test', patterns: 'not-an-array' },
    'required-settings.json': { version: 'test', managers: [] },
    'version.json': { version: 5 },
  });

  const errors = validatePolicyRoot(root);

  assert.equal(errors.some((error) => error.includes('categories.json A_safe_to_rewrite must be an array')), true);
  assert.equal(errors.some((error) => error.includes('native-equivalents.json entries must be an object')), true);
  assert.equal(errors.some((error) => error.includes('injection-patterns.json patterns must be a non-empty array')), true);
  assert.equal(errors.some((error) => error.includes('required-settings.json managers must be an object')), true);
  assert.equal(errors.some((error) => error.includes('version.json version must be a string')), true);
});
