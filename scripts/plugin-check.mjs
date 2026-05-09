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

const policyFiles = [
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
  '.github/workflows/plugin.yml',
  '.github/workflows/release.yml',
  'policy/README.md',
  'yieldOS/plugins/yieldos/hooks/hooks.json',
  'yieldOS/plugins/yieldos/commands/audit.md',
  'yieldOS/plugins/yieldos/commands/init.md',
  'yieldOS/plugins/yieldos/commands/pack.md',
  'yieldOS/plugins/yieldos/commands/pentest.md',
  'yieldOS/plugins/yieldos/commands/update.md',
  'yieldOS/plugins/yieldos/bin/yieldos-audit',
  'yieldOS/plugins/yieldos/bin/yieldos-init',
  'yieldOS/plugins/yieldos/bin/yieldos-pack',
  'yieldOS/plugins/yieldos/bin/yieldos-pentest',
  'yieldOS/plugins/yieldos/bin/yieldos-update',
  'yieldOS/plugins/yieldos/CHANGELOG.md',
  'yieldOS/plugins/yieldos/scripts/audit-command.js',
  'yieldOS/plugins/yieldos/scripts/agent-pack-command.js',
  'yieldOS/plugins/yieldos/scripts/agent-pack-yaml.js',
  'yieldOS/plugins/yieldos/scripts/init-command.js',
  'yieldOS/plugins/yieldos/scripts/init-profiles.js',
  'yieldOS/plugins/yieldos/scripts/pre-install-gate.js',
  'yieldOS/plugins/yieldos/scripts/post-install-audit.js',
  'yieldOS/plugins/yieldos/scripts/on-session-start.js',
  'yieldOS/plugins/yieldos/scripts/on-prompt-submit.js',
  'yieldOS/plugins/yieldos/scripts/credentials-scanner.js',
  'yieldOS/plugins/yieldos/scripts/env-helper.js',
  'yieldOS/plugins/yieldos/scripts/terminal-art.js',
  'yieldOS/plugins/yieldos/scripts/ui.js',
  'yieldOS/plugins/yieldos/scripts/code-audit/index.js',
  'yieldOS/plugins/yieldos/scripts/code-audit/ci-verify.js',
  'yieldOS/plugins/yieldos/scripts/code-audit/pentest-loop/auto-launcher.js',
  'yieldOS/plugins/yieldos/scripts/code-audit/pentest-loop/event-reader.js',
  'yieldOS/plugins/yieldos/scripts/code-audit/pentest-loop/orchestrator.js',
  'yieldOS/plugins/yieldos/scripts/yieldos-pentest.js',
  'yieldOS/plugins/yieldos/dashboard/launcher.js',
  'yieldOS/plugins/yieldos/dashboard/server.js',
  'yieldOS/plugins/yieldos/dashboard/public/app.js',
  'yieldOS/plugins/yieldos/dashboard/public/index.html',
  'yieldOS/plugins/yieldos/dashboard/public/sounds.js',
  'yieldOS/plugins/yieldos/dashboard/public/styles.css',
  'yieldOS/plugins/yieldos/security/.gitignore',
  'yieldOS/plugins/yieldos/scripts/classifiers/manifests.js',
  'yieldOS/plugins/yieldos/skills/dependency-gate/SKILL.md',
  'yieldOS/packs/yieldos-internal-security/yield.agent-pack.yaml',
  'landing/package.json',
  'landing/src/app/agent-packs/page.tsx',
  'landing/src/app/page.tsx',
  'landing/src/components/agent-pack-builder.tsx',
]) {
  assertFile(relativePath);
}

for (const file of policyFiles) {
  const relativePath = `policy/${file}`;
  assertFile(relativePath);
  readJson(relativePath);
}

assertExecutable('install.sh');
assertExecutable('yieldOS/plugins/yieldos/bin/yieldos-audit');
assertExecutable('yieldOS/plugins/yieldos/bin/yieldos-init');
assertExecutable('yieldOS/plugins/yieldos/bin/yieldos-pack');
assertExecutable('yieldOS/plugins/yieldos/bin/yieldos-pentest');
assertExecutable('yieldOS/plugins/yieldos/bin/yieldos-update');

console.log('plugin structure OK');
