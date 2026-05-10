#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const HOOK_MARKER = 'yieldOS managed git hook';
const DEFAULT_HOOKS = ['pre-commit', 'pre-push'];

function parseArgs(argv = []) {
  const parsed = {
    command: argv[0] || 'help',
    repo: null,
    force: false,
    hooks: [...DEFAULT_HOOKS],
    help: false,
  };

  if (parsed.command === '-h' || parsed.command === '--help') {
    parsed.command = 'help';
    parsed.help = true;
    return parsed;
  }

  const args = [...argv];
  if (args.length > 0) args.shift();
  if (parsed.command === 'run') {
    parsed.hookName = requireHookName(args.shift());
    parsed.hooks = [parsed.hookName];
  }
  while (args.length > 0) {
    const arg = args.shift();
    if (arg === '--repo') {
      parsed.repo = requireValue(arg, args.shift());
    } else if (arg === '--force') {
      parsed.force = true;
    } else if (arg === '--hook') {
      parsed.hooks = [requireHookName(requireValue(arg, args.shift()))];
    } else if (arg === '-h' || arg === '--help') {
      parsed.help = true;
    } else if (parsed.command === 'run' && !arg.startsWith('-')) {
      // Git passes hook-specific positional args, e.g. pre-push remote name/url.
      continue;
    } else {
      throw new Error(`unknown git-hooks option: ${arg}`);
    }
  }

  return parsed;
}

function requireValue(flag, value) {
  if (!value || value.startsWith('--')) throw new Error(`${flag} needs a value`);
  return value;
}

function requireHookName(value) {
  if (value !== 'pre-commit' && value !== 'pre-push') {
    throw new Error('--hook must be pre-commit or pre-push');
  }
  return value;
}

function runGitHooksCommand(projectRoot = process.cwd(), argv = process.argv.slice(2), options = {}) {
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (err) {
    return { exitCode: 2, message: `yieldOS git-hooks error: ${err.message}` };
  }

  if (parsed.help || parsed.command === 'help') return { exitCode: 0, message: usage() };
  const repo = path.resolve(parsed.repo || projectRoot);
  const pluginRoot = options.pluginRoot || path.resolve(__dirname, '..');

  try {
    if (parsed.command === 'install') return installHooks(repo, parsed, pluginRoot);
    if (parsed.command === 'run') return runHook(repo, parsed.hookName, pluginRoot, options);
    return { exitCode: 2, message: `yieldOS git-hooks error: unknown command: ${parsed.command}` };
  } catch (err) {
    return { exitCode: 2, message: `yieldOS git-hooks error: ${err.message}` };
  }
}

function installHooks(repo, parsed, pluginRoot) {
  const root = resolveRepoRoot(repo);
  const hooksDir = resolveHooksDir(root);
  fs.mkdirSync(hooksDir, { recursive: true });

  const written = [];
  for (const hookName of parsed.hooks) {
    const hookPath = path.join(hooksDir, hookName);
    writeHook(hookPath, hookName, pluginRoot, parsed.force);
    written.push(path.relative(root, hookPath));
  }

  return {
    exitCode: 0,
    message: [
      'yieldOS git hooks installed:',
      ...written.map((item) => `- ${item}`),
      'Codex, shells, and other agents now hit yieldOS at git commit/push time for this repo.',
    ].join('\n'),
  };
}

function runHook(repo, hookName, pluginRoot, options = {}) {
  const root = resolveRepoRoot(repo);
  const script = path.join(pluginRoot, 'scripts', 'pre-install-gate.js');
  const command = hookName === 'pre-push' ? 'git push' : 'git commit';
  const runner = options.spawnSync || spawnSync;
  const result = runner(process.execPath, [script], {
    cwd: root,
    input: `${JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command },
      cwd: root,
    })}\n`,
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: root, ...(options.env || {}) },
  });

  return {
    exitCode: typeof result.status === 'number' ? result.status : 2,
    stdout: options.forwardStdout ? result.stdout || '' : '',
    stderr: result.stderr || '',
    message: '',
  };
}

function resolveRepoRoot(repo) {
  return git(repo, ['rev-parse', '--show-toplevel']);
}

function resolveHooksDir(repoRoot) {
  const raw = git(repoRoot, ['rev-parse', '--git-path', 'hooks']);
  return path.isAbsolute(raw) ? raw : path.resolve(repoRoot, raw);
}

function writeHook(hookPath, hookName, pluginRoot, force) {
  if (fs.existsSync(hookPath)) {
    const existing = fs.readFileSync(hookPath, 'utf8');
    if (!existing.includes(HOOK_MARKER) && !force) {
      throw new Error(`refused to overwrite existing unmanaged hook: ${hookPath}. Rerun with --force after reviewing it.`);
    }
  }

  fs.writeFileSync(hookPath, renderHook(hookName, pluginRoot));
  if (process.platform !== 'win32') fs.chmodSync(hookPath, 0o755);
}

function renderHook(hookName, pluginRoot) {
  return [
    '#!/bin/sh',
    `# ${HOOK_MARKER}`,
    `PLUGIN_ROOT=${shellQuote(pluginRoot)}`,
    'NODE_BIN="${YIELDOS_NODE:-node}"',
    `exec "$NODE_BIN" "$PLUGIN_ROOT/scripts/git-hooks-command.js" run ${hookName} "$@"`,
    '',
  ].join('\n');
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function usage() {
  return [
    'Usage:',
    '  yieldos-git-hooks install [--repo <path>] [--hook pre-commit|pre-push] [--force]',
    '  yieldos-git-hooks run pre-commit|pre-push',
    '',
    'Installs native Git hooks so Codex, shells, and other non-Claude hosts hit yieldOS before commit/push.',
  ].join('\n');
}

function main() {
  const result = runGitHooksCommand(process.cwd());
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.message) {
    const stream = result.exitCode === 0 ? process.stdout : process.stderr;
    stream.write(`${result.message}\n`);
  }
  process.exit(result.exitCode);
}

if (require.main === module) main();

module.exports = {
  HOOK_MARKER,
  parseArgs,
  renderHook,
  runGitHooksCommand,
  runHook,
  usage,
};
