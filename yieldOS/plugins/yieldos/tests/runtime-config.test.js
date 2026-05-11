'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const runtimeConfig = require('../scripts/runtime-config');

function tmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'yieldos-runtime-config-'));
}

function writeConfig(root, value) {
  fs.mkdirSync(path.join(root, '.yieldos'), { recursive: true });
  fs.writeFileSync(path.join(root, '.yieldos', 'config.json'), `${JSON.stringify(value, null, 2)}\n`);
}

test('resolveRuntimeConfig defaults to standard without repo config', () => {
  const root = tmpProject();
  const resolved = runtimeConfig.resolveRuntimeConfig(root, { env: {} });

  assert.equal(resolved.config.mode, 'standard');
  assert.equal(resolved.config.ui.verbosity, 'normal');
  assert.equal(resolved.source, 'default');
  assert.deepEqual(resolved.warnings, []);
});

test('resolveRuntimeConfig lets YIELDOS_MODE override repo config', () => {
  const root = tmpProject();
  writeConfig(root, { version: 1, mode: 'monitor' });

  const resolved = runtimeConfig.resolveRuntimeConfig(root, {
    env: { YIELDOS_MODE: 'strict' },
  });

  assert.equal(resolved.config.mode, 'strict');
  assert.equal(resolved.source, 'env');
});

test('resolveRuntimeConfig degrades invalid hook config to standard with warning', () => {
  const root = tmpProject();
  writeConfig(root, { version: 99, mode: 'dangerously-off' });

  const resolved = runtimeConfig.resolveRuntimeConfig(root, { env: {} });

  assert.equal(resolved.config.mode, 'standard');
  assert.equal(resolved.source, 'fallback');
  assert.match(resolved.warnings.join('\n'), /unsupported config version/);
  assert.match(resolved.warnings.join('\n'), /unsupported mode/);
});

test('validateRuntimeConfig fails invalid config explicitly', () => {
  const result = runtimeConfig.validateRuntimeConfig({ version: 1, mode: 'off' });

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /unsupported mode/);
});

test('enterprise mode raises local mode to org overlay minimum', () => {
  const root = tmpProject();
  const overlayPath = path.join(root, 'org.yieldos-overlay.json');
  fs.writeFileSync(overlayPath, `${JSON.stringify({
    version: 1,
    kind: 'yieldos.org-overlay',
    minimumMode: 'enterprise',
  }, null, 2)}\n`);
  writeConfig(root, { version: 1, mode: 'standard', orgOverlay: 'org.yieldos-overlay.json' });

  const resolved = runtimeConfig.resolveRuntimeConfig(root, { env: {} });

  assert.equal(resolved.config.mode, 'enterprise');
  assert.equal(resolved.config.orgOverlay.path, 'org.yieldos-overlay.json');
  assert.equal(resolved.config.orgOverlay.minimumMode, 'enterprise');
});

test('org overlay rejects malformed restrict-only fields instead of silently ignoring them', () => {
  const root = tmpProject();
  const overlayPath = path.join(root, 'org.yieldos-overlay.json');
  fs.writeFileSync(overlayPath, `${JSON.stringify({
    version: 1,
    kind: 'yieldos.org-overlay',
    minimumMode: 'enterprise',
    requireOracles: ['agent-pack-lock', 42],
    disableSkills: 'skill:dependency-gate',
    denyRules: { match: 'src/legacy/**' },
  }, null, 2)}\n`);

  const result = runtimeConfig.validateRuntimeConfig({
    version: 1,
    mode: 'enterprise',
    orgOverlay: 'org.yieldos-overlay.json',
  }, { projectRoot: root });

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /orgOverlay requireOracles must contain only strings/);
  assert.match(result.errors.join('\n'), /orgOverlay disableSkills must be an array/);
  assert.match(result.errors.join('\n'), /orgOverlay denyRules must be an array/);
});

test('org overlay path rejects symlink traversal outside the project', () => {
  if (process.platform === 'win32') return;
  const root = tmpProject();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'yieldos-runtime-config-outside-'));
  fs.writeFileSync(path.join(outside, 'overlay.json'), `${JSON.stringify({
    version: 1,
    kind: 'yieldos.org-overlay',
    minimumMode: 'enterprise',
  }, null, 2)}\n`);
  fs.symlinkSync(path.join(outside, 'overlay.json'), path.join(root, 'overlay-link.json'));

  const result = runtimeConfig.validateRuntimeConfig({
    version: 1,
    mode: 'enterprise',
    orgOverlay: 'overlay-link.json',
  }, { projectRoot: root });

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /orgOverlay path must not traverse a symlink/);
});
