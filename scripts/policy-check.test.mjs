import assert from 'node:assert/strict';
import crypto from 'node:crypto';
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

function sha256(buffer) {
  return `sha256:${crypto.createHash('sha256').update(buffer).digest('hex')}`;
}

function writePolicyManifest(root) {
  const version = JSON.parse(fs.readFileSync(path.join(root, 'policy/version.json'), 'utf8'));
  const files = POLICY_FILES.map((file) => {
    const bytes = fs.readFileSync(path.join(root, 'policy', file));
    return {
      path: file,
      sha256: sha256(bytes),
      bytes: bytes.length,
    };
  });
  const manifest = {
    schema_version: 1,
    policy_version: version.version,
    generated_at: version.updated_at || '1970-01-01T00:00:00.000Z',
    authority: {
      repo: 'yieldos/yieldos',
      ref: 'main',
      path: 'policy',
      integrity: 'pinned-manifest-sha256',
    },
    files,
    bundle_sha256: sha256(Buffer.from(JSON.stringify(files.map(({ path: file, sha256: hash }) => [file, hash])))),
  };
  writeJson(path.join(root, 'policy/manifest.json'), manifest);
  writeJson(path.join(root, 'yieldOS/plugins/yieldos/policy-cache/manifest.json'), manifest);

  const manifestHash = sha256(fs.readFileSync(path.join(root, 'policy/manifest.json')));
  writeJson(path.join(root, 'yieldOS/plugins/yieldos/config/defaults.json'), {
    policy: {
      repo: 'yieldos/yieldos',
      branch: 'main',
      path: 'policy',
      files: POLICY_FILES,
      manifest_file: 'manifest.json',
      manifest_sha256: manifestHash,
      integrity: 'pinned-manifest-sha256',
      raw_url_template: 'https://raw.githubusercontent.com/{repo}/{branch}/{path}/{file}',
    },
  });
}

function makePolicyRoot(overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yieldos-policy-'));
  const base = {
    'allowlist.json': {
      version: 'test',
      entries: [{
        key: 'npm:react',
        category: 'framework',
        decision: 'allow',
        allow_any_version: true,
        reviewed_by: 'test',
        reviewed_at: '2026-05-10',
        rationale: 'trusted fixture package',
      }],
    },
    'denylist.json': {
      version: 'test',
      entries: [{
        key: 'npm:event-stream',
        decision: 'deny',
        reason: 'known incident',
        severity: 'critical',
        reviewed_by: 'test',
        reviewed_at: '2026-05-10',
        source_urls: ['https://example.test/advisory'],
      }],
    },
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
    'version.json': { version: 'test', updated_at: '2026-05-10T00:00:00.000Z', hash: `sha256:${'1'.repeat(64)}` },
    ...overrides,
  };

  for (const file of POLICY_FILES) {
    writeJson(path.join(root, 'policy', file), base[file]);
    writeJson(path.join(root, 'yieldOS/plugins/yieldos/policy-cache', file), base[file]);
  }
  writePolicyManifest(root);
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
    'version.json': { version: 5, hash: 'not-a-real-digest' },
  });

  const errors = validatePolicyRoot(root);

  assert.equal(errors.some((error) => error.includes('categories.json A_safe_to_rewrite must be an array')), true);
  assert.equal(errors.some((error) => error.includes('native-equivalents.json entries must be an object')), true);
  assert.equal(errors.some((error) => error.includes('injection-patterns.json patterns must be a non-empty array')), true);
  assert.equal(errors.some((error) => error.includes('required-settings.json managers must be an object')), true);
  assert.equal(errors.some((error) => error.includes('version.json version must be a string')), true);
  assert.equal(errors.some((error) => error.includes('version.json hash must be sha256:<64 hex>')), true);
});

test('validatePolicyRoot rejects allowlist entries without explicit rolling-version metadata', () => {
  const root = makePolicyRoot({
    'allowlist.json': {
      version: 'test',
      entries: [{
        key: 'npm:rolling-package',
        category: 'fixture',
        decision: 'allow',
        reviewed_by: 'test',
        reviewed_at: '2026-05-10',
        rationale: 'missing allow_any_version should fail',
      }],
    },
  });

  const errors = validatePolicyRoot(root);
  assert.equal(errors.some((error) => error.includes('name-only entry requires allow_any_version: true')), true);
});

test('validatePolicyRoot rejects denylist entries without security metadata', () => {
  const root = makePolicyRoot({
    'denylist.json': {
      version: 'test',
      entries: [{ key: 'npm:known-bad', decision: 'deny', reason: 'known incident' }],
    },
  });

  const errors = validatePolicyRoot(root);
  assert.equal(errors.some((error) => error.includes('denylist.json entries[0].severity must be critical')), true);
  assert.equal(errors.some((error) => error.includes('denylist.json entries[0].source_urls must be an array')), true);
});

test('validatePolicyRoot rejects denylist entries with empty source references', () => {
  const root = makePolicyRoot({
    'denylist.json': {
      version: 'test',
      entries: [{
        key: 'npm:known-bad',
        decision: 'deny',
        reason: 'known incident',
        severity: 'high',
        reviewed_by: 'test',
        reviewed_at: '2026-05-10',
        source_urls: [],
      }],
    },
  });

  const errors = validatePolicyRoot(root);
  assert.equal(errors.some((error) => error.includes('source_urls must include at least one entry')), true);
});

test('validatePolicyRoot rejects allowlist and denylist conflicts', () => {
  const root = makePolicyRoot({
    'allowlist.json': {
      version: 'test',
      entries: [{
        key: 'npm:conflicted',
        category: 'fixture',
        decision: 'allow',
        allow_any_version: true,
        reviewed_by: 'test',
        reviewed_at: '2026-05-10',
        rationale: 'conflict fixture',
      }],
    },
    'denylist.json': {
      version: 'test',
      entries: [{
        key: 'npm:conflicted@1.0.0',
        decision: 'deny',
        reason: 'conflict fixture',
        severity: 'high',
        reviewed_by: 'test',
        reviewed_at: '2026-05-10',
        source_urls: ['https://example.test/advisory'],
      }],
    },
  });

  const errors = validatePolicyRoot(root);
  assert.equal(errors.some((error) => error.includes('conflicts with allowlist name entry npm:conflicted')), true);
});

test('validatePolicyRoot rejects missing policy integrity manifest', () => {
  const root = makePolicyRoot();
  fs.rmSync(path.join(root, 'policy/manifest.json'));
  fs.rmSync(path.join(root, 'yieldOS/plugins/yieldos/policy-cache/manifest.json'));

  const errors = validatePolicyRoot(root);
  assert.equal(errors.some((error) => error.includes('missing policy/manifest.json')), true);
  assert.equal(errors.some((error) => error.includes('missing policy-cache/manifest.json')), true);
});

test('validatePolicyRoot rejects policy drift from the pinned manifest even when cache matches', () => {
  const root = makePolicyRoot();
  const allowlist = JSON.parse(fs.readFileSync(path.join(root, 'policy/allowlist.json'), 'utf8'));
  allowlist.entries.push({
    key: 'npm:lodash@4.17.21',
    category: 'utility',
    decision: 'allow',
    reviewed_by: 'test',
    reviewed_at: '2026-05-10',
    rationale: 'valid fixture entry that intentionally drifts from manifest',
    source_urls: ['https://example.test/lodash'],
  });
  writeJson(path.join(root, 'policy/allowlist.json'), allowlist);
  writeJson(path.join(root, 'yieldOS/plugins/yieldos/policy-cache/allowlist.json'), allowlist);

  const errors = validatePolicyRoot(root);
  assert.equal(errors.some((error) => error.includes('policy/allowlist.json sha256 does not match manifest')), true);
});

test('validatePolicyRoot rejects plugin defaults that pin a different manifest hash', () => {
  const root = makePolicyRoot();
  const defaultsPath = path.join(root, 'yieldOS/plugins/yieldos/config/defaults.json');
  const defaults = JSON.parse(fs.readFileSync(defaultsPath, 'utf8'));
  defaults.policy.manifest_sha256 = `sha256:${'0'.repeat(64)}`;
  writeJson(defaultsPath, defaults);

  const errors = validatePolicyRoot(root);
  assert.equal(errors.some((error) => error.includes('defaults policy.manifest_sha256 does not match policy/manifest.json')), true);
});
