'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const gitHooks = require('../scripts/git-hooks-command');

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const COMMAND_PATH = path.join(PLUGIN_ROOT, 'scripts', 'git-hooks-command.js');
const BIN_PATH = path.join(PLUGIN_ROOT, 'bin', 'yieldos-git-hooks');

function sh(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function tmpRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yieldos-git-hooks-'));
  sh(root, ['init', '-b', 'main']);
  sh(root, ['config', 'user.email', 'test@example.com']);
  sh(root, ['config', 'user.name', 'Test User']);
  fs.writeFileSync(path.join(root, 'app.js'), 'module.exports = {};\n');
  sh(root, ['add', 'app.js']);
  sh(root, ['commit', '-m', 'initial']);
  return root;
}

test('install writes repo-local pre-commit and pre-push hooks', () => {
  const root = tmpRepo();
  const result = gitHooks.runGitHooksCommand(root, ['install'], { pluginRoot: PLUGIN_ROOT });

  assert.equal(result.exitCode, 0);
  for (const hookName of ['pre-commit', 'pre-push']) {
    const hookPath = path.join(root, '.git', 'hooks', hookName);
    const content = fs.readFileSync(hookPath, 'utf8');
    assert.equal(content.includes('yieldOS managed git hook'), true);
    assert.equal(content.includes(PLUGIN_ROOT), true);
    assert.equal(content.includes('scripts/git-hooks-command.js'), true);
    if (process.platform !== 'win32') {
      assert.equal((fs.statSync(hookPath).mode & 0o111) !== 0, true);
    }
  }
});

test('repo-local pre-commit hook applies deterministic fix and blocks original commit', () => {
  const root = tmpRepo();
  gitHooks.runGitHooksCommand(root, ['install'], { pluginRoot: PLUGIN_ROOT });

  fs.writeFileSync(path.join(root, 'app.js'), [
    'function boot() {',
    '  console.log("secret token", process.env.SECRET_TOKEN);',
    '}',
    'module.exports = { boot };',
    '',
  ].join('\n'));
  sh(root, ['add', 'app.js']);

  const blocked = spawnSync('git', ['commit', '-m', 'leak secret'], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.notEqual(blocked.status, 0);
  assert.equal(blocked.stdout.includes('hookSpecificOutput'), false);
  assert.equal(blocked.stderr.includes('[yieldOS:verdict] code-audit-fix-applied'), true);
  assert.equal(fs.readFileSync(path.join(root, 'app.js'), 'utf8').includes('SECRET_TOKEN'), false);
  assert.equal(sh(root, ['diff', '--cached', '--', 'app.js']).includes('SECRET_TOKEN'), false);
  assert.equal(fs.existsSync(path.join(root, 'security', 'code-audit-state.json')), true);

  const allowed = spawnSync('git', ['commit', '-m', 'safe logging'], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.equal(allowed.status, 0, allowed.stderr);
  assert.equal(sh(root, ['show', 'HEAD:app.js']).includes('SECRET_TOKEN'), false);
});

test('install refuses to overwrite unmanaged hooks without force', () => {
  const root = tmpRepo();
  const hookPath = path.join(root, '.git', 'hooks', 'pre-commit');
  fs.mkdirSync(path.dirname(hookPath), { recursive: true });
  fs.writeFileSync(hookPath, '#!/bin/sh\necho existing\n');

  const rejected = gitHooks.runGitHooksCommand(root, ['install'], { pluginRoot: PLUGIN_ROOT });
  const forced = gitHooks.runGitHooksCommand(root, ['install', '--force'], { pluginRoot: PLUGIN_ROOT });

  assert.equal(rejected.exitCode, 2);
  assert.equal(rejected.message.includes('refused to overwrite'), true);
  assert.equal(forced.exitCode, 0);
  assert.equal(fs.readFileSync(hookPath, 'utf8').includes('yieldOS managed git hook'), true);
});

test('pre-push run accepts Git hook remote arguments', () => {
  const root = tmpRepo();
  const calls = [];
  const result = gitHooks.runGitHooksCommand(root, [
    'run',
    'pre-push',
    'origin',
    'https://github.com/example/repo.git',
  ], {
    pluginRoot: PLUGIN_ROOT,
    spawnSync: (...args) => {
      calls.push(args);
      return { status: 0, stdout: '', stderr: '' };
    },
  });

  assert.equal(result.exitCode, 0);
  assert.equal(calls.length, 1);
});

test('git-hooks executable is registered', () => {
  const mode = fs.statSync(BIN_PATH).mode;
  if (process.platform !== 'win32') {
    assert.equal((mode & 0o111) !== 0, true);
  }
});

test('top-level help is accepted', () => {
  const result = gitHooks.runGitHooksCommand(process.cwd(), ['--help'], { pluginRoot: PLUGIN_ROOT });

  assert.equal(result.exitCode, 0);
  assert.equal(result.message.includes('yieldos-git-hooks install'), true);
});
