#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const agentPack = require('./agent-pack-command');
const policyFetcher = require('./policy-fetcher');
const runtimeConfig = require('./runtime-config');
const gitHooks = require('./git-hooks-command');

const PLUGIN_ROOT = path.resolve(__dirname, '..');

function runDoctor(projectRoot = process.cwd(), argv = process.argv.slice(2), options = {}) {
  if (argv.includes('-h') || argv.includes('--help')) return { exitCode: 0, message: usage() };
  if (argv.length > 0) return { exitCode: 2, message: `yieldOS doctor error: unknown option: ${argv[0]}` };

  const root = path.resolve(projectRoot);
  const pluginRoot = options.pluginRoot || PLUGIN_ROOT;
  const resolved = runtimeConfig.resolveRuntimeConfig(root, { env: options.env || process.env });
  const policy = policyStatus();
  const hooks = hookStatus(root);
  const pack = packLockStatus(root, options);
  const overlay = resolved.config.orgOverlay;

  const lines = [
    'yieldOS doctor',
    `plugin version: ${pluginVersion(pluginRoot)}`,
    `global policy version: ${policy.version}`,
    `global policy source: ${policy.source}`,
    `effective mode: ${resolved.config.mode}`,
    `config source: ${resolved.source}`,
    `org overlay: ${overlay?.sha256 || 'none'}`,
    `git hooks: ${hooks}`,
    `pack lock: ${pack}`,
  ];
  for (const warning of resolved.warnings) lines.push(`warning: ${warning}`);
  return { exitCode: 0, message: lines.join('\n') };
}

function pluginVersion(pluginRoot) {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(pluginRoot, '.claude-plugin', 'plugin.json'), 'utf8'));
    return manifest.version || 'unknown';
  } catch (_) {
    return 'unknown';
  }
}

function policyStatus() {
  const shipped = policyFetcher.loadFromShippedCache();
  const version = shipped?.['version.json']?.version || shipped?.['skills.json']?.version || 'unknown';
  return { version, source: shipped ? 'policy-cache' : 'unavailable' };
}

function hookStatus(projectRoot) {
  let hooksDir;
  try {
    const raw = git(projectRoot, ['rev-parse', '--git-path', 'hooks']);
    hooksDir = path.isAbsolute(raw) ? raw : path.join(projectRoot, raw);
  } catch (_) {
    return 'not a git repo';
  }

  const missing = [];
  const unmanaged = [];
  for (const hook of ['pre-commit', 'pre-push']) {
    const hookPath = path.join(hooksDir, hook);
    if (!fs.existsSync(hookPath)) {
      missing.push(hook);
      continue;
    }
    const content = fs.readFileSync(hookPath, 'utf8');
    if (!content.includes(gitHooks.HOOK_MARKER)) unmanaged.push(hook);
  }
  if (unmanaged.length > 0) return `unmanaged ${unmanaged.join(', ')}`;
  if (missing.length > 0) return `missing ${missing.join(', ')}`;
  return 'installed';
}

function packLockStatus(projectRoot, options = {}) {
  const lockPath = path.join(projectRoot, 'yield.agent-pack.lock.json');
  const packPath = path.join(projectRoot, 'yield.agent-pack.yaml');
  if (!fs.existsSync(lockPath)) return 'absent';
  if (!fs.existsSync(packPath)) return 'stale or invalid: yield.agent-pack.yaml missing';

  const result = agentPack.runPack(projectRoot, ['verify', '--pack', 'yield.agent-pack.yaml'], options);
  if (result.exitCode !== 0) return `stale or invalid: ${singleLine(result.message)}`;
  if (result.verification?.checked) return `verified (${result.verification.generatedFileCount} files)`;
  return 'present but not checked';
}

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function singleLine(value) {
  return String(value || '').split(/\r?\n/)[0];
}

function usage() {
  return [
    'Usage: yieldos-doctor',
    '',
    'Reports plugin version, global policy version, org overlay hash, pack lock status, git hook status, and effective mode.',
  ].join('\n');
}

function main() {
  const result = runDoctor(process.cwd());
  const stream = result.exitCode === 0 ? process.stdout : process.stderr;
  stream.write(`${result.message}\n`);
  process.exit(result.exitCode);
}

if (require.main === module) main();

module.exports = {
  runDoctor,
  usage,
};
