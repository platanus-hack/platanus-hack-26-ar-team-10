import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { generatePolicyManifest } from './generate-policy-manifest.mjs';
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

function makeRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yieldos-policy-manifest-'));
  const policies = {
    'allowlist.json': { version: 'test', entries: [{ key: 'npm:react', category: 'framework', decision: 'allow', allow_any_version: true, reviewed_by: 'test', reviewed_at: '2026-05-10', rationale: 'fixture' }] },
    'denylist.json': { version: 'test', entries: [{ key: 'npm:event-stream', decision: 'deny', reason: 'fixture', severity: 'critical', reviewed_by: 'test', reviewed_at: '2026-05-10', source_urls: ['https://example.test/advisory'] }] },
    'categories.json': { version: 'test', A_safe_to_rewrite: [], D_never_rewrite: [] },
    'native-equivalents.json': { version: 'test', entries: {} },
    'skills.json': { version: 'test', entries: [], rules: { default_unlisted: 'block' } },
    'mcps.json': { version: 'test', entries: [], rules: { default_unlisted: 'block', validate_tool_surface_at_registration: true } },
    'injection-patterns.json': { version: 'test', patterns: [{ id: 'ignore-previous', regex: 'ignore previous instructions', severity: 'critical' }] },
    'build-scripts-allowed.json': { version: 'test', entries: [] },
    'required-settings.json': { version: 'test', managers: {} },
    'version.json': { version: 'test', updated_at: '2026-05-10T00:00:00.000Z', hash: 'placeholder' },
  };
  for (const [file, value] of Object.entries(policies)) {
    writeJson(path.join(root, 'policy', file), value);
    writeJson(path.join(root, 'yieldOS/plugins/yieldos/policy-cache', file), value);
  }
  writeJson(path.join(root, 'yieldOS/plugins/yieldos/config/defaults.json'), {
    policy: {
      repo: 'yieldos/yieldos',
      branch: 'main',
      path: 'policy',
      files: POLICY_FILES,
      raw_url_template: 'https://raw.githubusercontent.com/{repo}/{branch}/{path}/{file}',
    },
  });
  return root;
}

test('generatePolicyManifest writes policy and cache manifests and pins defaults', () => {
  const root = makeRepo();

  const result = generatePolicyManifest({ repoRoot: root });

  assert.match(result.manifestSha256, /^sha256:[a-f0-9]{64}$/);
  assert.equal(fs.existsSync(path.join(root, 'policy/manifest.json')), true);
  assert.equal(fs.existsSync(path.join(root, 'yieldOS/plugins/yieldos/policy-cache/manifest.json')), true);

  const defaults = JSON.parse(fs.readFileSync(path.join(root, 'yieldOS/plugins/yieldos/config/defaults.json'), 'utf8'));
  assert.equal(defaults.policy.integrity, 'pinned-manifest-sha256');
  assert.equal(defaults.policy.manifest_file, 'manifest.json');
  assert.equal(defaults.policy.manifest_sha256, result.manifestSha256);

  const version = JSON.parse(fs.readFileSync(path.join(root, 'policy/version.json'), 'utf8'));
  assert.match(version.hash, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(validatePolicyRoot(root), []);
});
