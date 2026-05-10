'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const policyFetcher = require('../scripts/policy-fetcher');
const policyManifest = require('../scripts/policy-manifest');

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

function tmpDir(prefix = 'yieldos-policy-fetcher-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256(bytes) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

function writeBundle(root) {
  const data = {
    'allowlist.json': { version: 'test', entries: [{ key: 'npm:react', decision: 'allow', category: 'framework', allow_any_version: true, reviewed_by: 'test', reviewed_at: '2026-05-10', rationale: 'fixture' }] },
    'denylist.json': { version: 'test', entries: [{ key: 'npm:event-stream@3.3.6', decision: 'deny', reason: 'fixture', severity: 'critical', reviewed_by: 'test', reviewed_at: '2026-05-10', source_urls: ['https://example.test/advisory'] }] },
    'categories.json': { version: 'test', A_safe_to_rewrite: [], D_never_rewrite: [] },
    'native-equivalents.json': { version: 'test', entries: {} },
    'skills.json': { version: 'test', entries: [], rules: { default_unlisted: 'block' } },
    'mcps.json': { version: 'test', entries: [], rules: { default_unlisted: 'block', validate_tool_surface_at_registration: true } },
    'injection-patterns.json': { version: 'test', patterns: [{ id: 'ignore-previous', regex: 'ignore previous instructions', severity: 'critical' }] },
    'build-scripts-allowed.json': { version: 'test', entries: [] },
    'required-settings.json': { version: 'test', managers: {} },
    'version.json': { version: 'test', updated_at: '2026-05-10T00:00:00.000Z', hash: `sha256:${'1'.repeat(64)}` },
  };
  for (const [file, value] of Object.entries(data)) writeJson(path.join(root, file), value);
  const manifest = policyManifest.buildPolicyManifest(root, { files: POLICY_FILES });
  writeJson(path.join(root, 'manifest.json'), manifest);
  return {
    data,
    manifest,
    manifestSha256: sha256(fs.readFileSync(path.join(root, 'manifest.json'))),
  };
}

test('loadFromPolicyDirectory accepts only a manifest-pinned policy bundle', () => {
  const root = tmpDir();
  const { manifestSha256 } = writeBundle(root);

  const loaded = policyFetcher.loadFromPolicyDirectory(root, {
    files: POLICY_FILES,
    expectedManifestSha256: manifestSha256,
  });
  assert.equal(loaded['denylist.json'].entries[0].key, 'npm:event-stream@3.3.6');

  const tampered = JSON.parse(fs.readFileSync(path.join(root, 'allowlist.json'), 'utf8'));
  tampered.entries.push({ key: 'npm:lodash', decision: 'allow', category: 'utility', allow_any_version: true, reviewed_by: 'test', reviewed_at: '2026-05-10', rationale: 'tamper' });
  writeJson(path.join(root, 'allowlist.json'), tampered);

  assert.equal(policyFetcher.loadFromPolicyDirectory(root, {
    files: POLICY_FILES,
    expectedManifestSha256: manifestSha256,
  }), null);
});

test('refreshBundleFromOrigin activates the runtime cache only after every fetched file matches the pinned manifest', async () => {
  const origin = tmpDir('yieldos-policy-origin-');
  const runtime = tmpDir('yieldos-policy-runtime-');
  const { manifest, manifestSha256 } = writeBundle(origin);
  const bodies = new Map([
    ['manifest.json', fs.readFileSync(path.join(origin, 'manifest.json'), 'utf8')],
    ...POLICY_FILES.map((file) => [file, fs.readFileSync(path.join(origin, file), 'utf8')]),
  ]);
  bodies.set('allowlist.json', JSON.stringify({ version: 'tampered', entries: [] }));

  await assert.rejects(
    () => policyFetcher.refreshBundleFromOrigin({
      runtimeDir: runtime,
      files: POLICY_FILES,
      manifestFile: 'manifest.json',
      expectedManifestSha256: manifestSha256,
      fetchText: async (file) => bodies.get(file),
    }),
    /hash mismatch|sha256/,
  );
  assert.equal(fs.existsSync(path.join(runtime, 'allowlist.json')), false);

  bodies.set('allowlist.json', fs.readFileSync(path.join(origin, 'allowlist.json'), 'utf8'));
  const refreshed = await policyFetcher.refreshBundleFromOrigin({
    runtimeDir: runtime,
    files: POLICY_FILES,
    manifestFile: 'manifest.json',
    expectedManifestSha256: manifestSha256,
    fetchText: async (file) => bodies.get(file),
  });

  assert.equal(refreshed.manifest.policy_version, manifest.policy_version);
  assert.equal(fs.existsSync(path.join(runtime, 'manifest.json')), true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(runtime, 'denylist.json'), 'utf8')).entries[0].key, 'npm:event-stream@3.3.6');
});
