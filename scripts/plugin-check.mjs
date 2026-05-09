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

function assertNoUnknownMarketplaceKeys(marketplace, relativePath) {
  const allowed = new Set(['name', 'metadata', 'owner', 'plugins']);
  for (const key of Object.keys(marketplace)) {
    assert(allowed.has(key), `${relativePath} has unsupported marketplace key: ${key}`);
  }
}

function validateMarketplace(relativePath, expectedSource, sourceBase = '.') {
  const marketplace = readJson(relativePath);
  assertNoUnknownMarketplaceKeys(marketplace, relativePath);
  assert(marketplace.name === 'yieldos', `${relativePath} must be named yieldos`);
  assert(marketplace.owner?.name === 'platanus-hack-26-ar-team-10', `${relativePath} has wrong owner`);
  assert(Array.isArray(marketplace.plugins), `${relativePath} must declare plugins`);

  const entry = marketplace.plugins.find((plugin) => plugin.name === 'yieldos');
  assert(entry, `${relativePath} must declare the yieldos plugin`);
  assert(entry.version === '0.2.2', `${relativePath} must point at yieldos 0.2.2`);
  assert(entry.source === expectedSource, `${relativePath} has wrong source: ${entry.source}`);
  assert(entry.author?.name === 'platanus-hack-26-ar-team-10', `${relativePath} has wrong author`);
  assert(entry.category === 'security', `${relativePath} should classify yieldos as security`);
  assertFile(path.join(sourceBase, expectedSource, '.claude-plugin/plugin.json'));
}

validateMarketplace('.claude-plugin/marketplace.json', './yieldOS/plugins/yieldos');
validateMarketplace('yieldOS/.claude-plugin/marketplace.json', './plugins/yieldos', 'yieldOS');

const plugin = readJson('yieldOS/plugins/yieldos/.claude-plugin/plugin.json');
assert(plugin.name === 'yieldos', 'plugin manifest must be named yieldos');
assert(plugin.version === '0.2.2', 'plugin manifest must be version 0.2.2');
assert(plugin.author?.name === 'platanus-hack-26-ar-team-10', 'plugin manifest has wrong author');

for (const relativePath of [
  'yieldOS/plugins/yieldos/hooks/hooks.json',
  'yieldOS/plugins/yieldos/scripts/pre-install-gate.js',
  'yieldOS/plugins/yieldos/scripts/post-install-audit.js',
  'yieldOS/plugins/yieldos/scripts/on-session-start.js',
  'yieldOS/plugins/yieldos/scripts/on-prompt-submit.js',
  'yieldOS/plugins/yieldos/skills/dependency-gate/SKILL.md',
]) {
  assertFile(relativePath);
}

console.log('plugin structure OK');
