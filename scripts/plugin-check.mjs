#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();

function readJson(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  try {
    return JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  } catch (error) {
    throw new Error(`invalid JSON at ${relativePath}: ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertFile(relativePath) {
  assert(fs.existsSync(path.join(repoRoot, relativePath)), `missing file: ${relativePath}`);
}

function assertExecutable(relativePath) {
  const mode = fs.statSync(path.join(repoRoot, relativePath)).mode;
  assert((mode & 0o111) !== 0, `${relativePath} must be executable`);
}

function assertSemver(value, label) {
  assert(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value), `${label} must be semver x.y.z`);
}

function assertNoUnknownMarketplaceKeys(marketplace, relativePath) {
  const allowed = new Set(['name', 'metadata', 'owner', 'plugins']);
  for (const key of Object.keys(marketplace)) {
    assert(allowed.has(key), `${relativePath} has unsupported marketplace key: ${key}`);
  }
}

function validateMarketplace(relativePath, expectedSource, expectedVersion, sourceBase = '.') {
  const marketplace = readJson(relativePath);
  assertNoUnknownMarketplaceKeys(marketplace, relativePath);
  assert(marketplace.name === 'yieldos', `${relativePath} must be named yieldos`);
  assert(marketplace.owner?.name === 'platanus-hack-26-ar-team-10', `${relativePath} has wrong owner`);
  assert(Array.isArray(marketplace.plugins), `${relativePath} must declare plugins`);

  const entry = marketplace.plugins.find((plugin) => plugin.name === 'yieldos');
  assert(entry, `${relativePath} must declare the yieldos plugin`);
  assert(entry.version === expectedVersion, `${relativePath} must point at yieldos ${expectedVersion}`);
  assert(entry.source === expectedSource, `${relativePath} has wrong source: ${entry.source}`);
  assert(entry.author?.name === 'platanus-hack-26-ar-team-10', `${relativePath} has wrong author`);
  assert(entry.category === 'security', `${relativePath} should classify yieldos as security`);
  assertFile(path.join(sourceBase, expectedSource, '.claude-plugin/plugin.json'));
}

const plugin = readJson('yieldOS/plugins/yieldos/.claude-plugin/plugin.json');
assert(plugin.name === 'yieldos', 'plugin manifest must be named yieldos');
assertSemver(plugin.version, 'plugin manifest version');
assert(plugin.author?.name === 'platanus-hack-26-ar-team-10', 'plugin manifest has wrong author');

validateMarketplace('.claude-plugin/marketplace.json', './yieldOS/plugins/yieldos', plugin.version);
validateMarketplace('yieldOS/.claude-plugin/marketplace.json', './plugins/yieldos', plugin.version, 'yieldOS');

for (const relativePath of [
  'install.sh',
  'CHANGELOG.md',
  'scripts/release.mjs',
  'scripts/release.test.mjs',
  'scripts/versioning.mjs',
  '.github/workflows/release.yml',
  'yieldOS/plugins/yieldos/hooks/hooks.json',
  'yieldOS/plugins/yieldos/commands/update.md',
  'yieldOS/plugins/yieldos/bin/yieldos-update',
  'yieldOS/plugins/yieldos/CHANGELOG.md',
  'yieldOS/plugins/yieldos/scripts/pre-install-gate.js',
  'yieldOS/plugins/yieldos/scripts/post-install-audit.js',
  'yieldOS/plugins/yieldos/scripts/on-session-start.js',
  'yieldOS/plugins/yieldos/scripts/on-prompt-submit.js',
  'yieldOS/plugins/yieldos/scripts/classifiers/manifests.js',
  'yieldOS/plugins/yieldos/skills/dependency-gate/SKILL.md',
]) {
  assertFile(relativePath);
}

assertExecutable('install.sh');
assertExecutable('yieldOS/plugins/yieldos/bin/yieldos-update');

console.log('plugin structure OK');
