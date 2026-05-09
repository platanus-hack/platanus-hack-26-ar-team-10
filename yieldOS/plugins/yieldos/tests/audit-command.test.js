'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const audit = require('../scripts/audit-command');

const PLUGIN_ROOT = path.resolve(__dirname, '..');

function tmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'yieldos-audit-'));
}

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function tmpGitProject() {
  const root = tmpProject();
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'Test User']);
  fs.writeFileSync(path.join(root, 'app.js'), 'module.exports = {};\n');
  git(root, ['add', 'app.js']);
  git(root, ['commit', '-m', 'initial']);
  return root;
}

function fakeRunner(status) {
  const calls = [];
  return {
    calls,
    spawnSync(command, args, options) {
      calls.push({ command, args, options });
      return { status, stdout: '', stderr: '' };
    },
  };
}

test('parseArgs defaults to changed-code diff against origin/main', () => {
  const parsed = audit.parseArgs([]);

  assert.equal(parsed.command, 'run');
  assert.equal(parsed.mode, 'diff');
  assert.equal(parsed.base, 'origin/main');
  assert.deepEqual(audit.buildDeepsecSteps(parsed, '/tmp/comment.md'), [
    { args: ['process', '--diff', 'origin/main', '--comment-out', '/tmp/comment.md'] },
  ]);
});

test('parseArgs supports base, staged, working, full, and agent options', () => {
  assert.deepEqual(audit.buildDeepsecSteps(audit.parseArgs(['--base', 'dev']), '/tmp/comment.md')[0].args, [
    'process', '--diff', 'dev', '--comment-out', '/tmp/comment.md',
  ]);
  assert.deepEqual(audit.buildDeepsecSteps(audit.parseArgs(['--staged']), '/tmp/comment.md')[0].args, [
    'process', '--diff-staged', '--comment-out', '/tmp/comment.md',
  ]);
  assert.deepEqual(audit.buildDeepsecSteps(audit.parseArgs(['--working']), '/tmp/comment.md')[0].args, [
    'process', '--diff-working', '--comment-out', '/tmp/comment.md',
  ]);
  assert.deepEqual(audit.buildDeepsecSteps(audit.parseArgs(['--full', '--agent', 'claude']), '/tmp/comment.md'), [
    { args: ['scan'] },
    { args: ['process', '--agent', 'claude', '--comment-out', '/tmp/comment.md'] },
  ]);
});

test('parseArgs rejects conflicting audit scopes', () => {
  assert.throws(() => audit.parseArgs(['--staged', '--working']), /cannot be combined/);
  assert.throws(() => audit.parseArgs(['--base', 'dev', '--full']), /cannot be combined/);
});

test('parseArgs maps setup and status commands', () => {
  assert.equal(audit.parseArgs(['setup']).command, 'setup');
  assert.equal(audit.parseArgs(['status']).command, 'status');
});

test('runAudit reports clean, findings, and runtime errors from deepsec exit codes', () => {
  const root = tmpProject();
  for (const [status, verdict, code] of [
    [0, 'clean', 0],
    [1, 'findings', 1],
    [2, 'error', 2],
  ]) {
    const runner = fakeRunner(status);
    const result = audit.runAudit(root, [], {
      deepsec: { command: 'deepsec', argsPrefix: [], cwd: root },
      spawnSync: runner.spawnSync,
      env: {},
    });

    assert.equal(result.verdict, verdict);
    assert.equal(result.exitCode, code);
    assert.equal(runner.calls[0].args.includes('process'), true);
  }
});

test('runAudit prints setup guidance when deepsec is missing', () => {
  const root = tmpProject();
  const result = audit.runAudit(root, [], { env: { PATH: '' } });

  assert.equal(result.verdict, 'setup-required');
  assert.equal(result.exitCode, 2);
  assert.equal(result.message.includes('yieldOS audit needs Deepsec setup'), true);
  assert.equal(result.message.includes('npx deepsec init'), true);
});

test('findDeepsec ignores repo-local Deepsec unless explicitly trusted', () => {
  const root = tmpProject();
  const localBin = path.join(root, '.deepsec', 'node_modules', '.bin', 'deepsec');
  fs.mkdirSync(path.dirname(localBin), { recursive: true });
  fs.writeFileSync(localBin, '#!/bin/sh\nexit 0\n');

  const untrusted = audit.findDeepsec(root, { PATH: '' });
  const trusted = audit.findDeepsec(root, { PATH: '', YIELDOS_TRUST_PROJECT_DEEPSEC: '1' });

  assert.equal(untrusted, null);
  assert.equal(trusted.source, '.deepsec');
  assert.equal(trusted.command, localBin);
});

test('runAudit emits full-scan notice before running deepsec', () => {
  const root = tmpProject();
  const events = [];
  const result = audit.runAudit(root, ['--full'], {
    deepsec: { command: 'deepsec', argsPrefix: [], cwd: root },
    spawnSync(_command, args) {
      events.push(`run:${args[0]}`);
      return { status: 0, stdout: '', stderr: '' };
    },
    env: {},
    onNotice(message) {
      events.push(message);
    },
  });

  assert.equal(result.verdict, 'clean');
  assert.equal(events[0], 'yieldOS audit full scan requested; this can be expensive.');
  assert.deepEqual(events.slice(1), ['run:scan', 'run:process']);
});

test('runAudit summarizes deterministic code-review findings without patching', () => {
  const root = tmpGitProject();
  fs.writeFileSync(path.join(root, 'app.js'), 'console.log(process.env.SECRET_TOKEN);\n');
  git(root, ['add', 'app.js']);

  const result = audit.runAudit(root, ['--staged'], {
    deepsec: { command: 'deepsec', argsPrefix: [], cwd: root },
    spawnSync() {
      return { status: 0, stdout: '', stderr: '' };
    },
    env: {},
  });

  assert.equal(result.verdict, 'findings');
  assert.equal(result.exitCode, 1);
  assert.equal(result.message.includes('yieldOS code-review high/critical'), true);
  assert.equal(result.message.includes('sensitive-logging'), true);
  assert.equal(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), 'console.log(process.env.SECRET_TOKEN);\n');
});

test('runAudit appends a sanitized summary log', () => {
  const root = tmpProject();
  const runner = fakeRunner(1);

  audit.runAudit(root, ['--base', 'dev'], {
    deepsec: { command: 'deepsec', argsPrefix: ['--token', 'sk-123456789012345678901234'], cwd: root },
    spawnSync: runner.spawnSync,
    env: {},
  });

  const log = fs.readFileSync(path.join(root, 'security', 'audit-events.md'), 'utf8');
  assert.equal(log.includes('Audit Command'), true);
  assert.equal(log.includes('dev'), true);
  assert.equal(log.includes('sk-123456789012345678901234'), false);
  assert.equal(log.includes('[REDACTED]'), true);
});

test('audit command markdown and executable are registered', () => {
  const command = fs.readFileSync(path.join(PLUGIN_ROOT, 'commands', 'audit.md'), 'utf8');
  const update = fs.readFileSync(path.join(PLUGIN_ROOT, 'commands', 'update.md'), 'utf8');
  const mode = fs.statSync(path.join(PLUGIN_ROOT, 'bin', 'yieldos-audit')).mode;

  assert.equal(command.includes('allowed-tools: Bash(yieldos-audit:*)'), true);
  assert.equal(command.includes('yieldos-audit $ARGUMENTS'), true);
  assert.equal(update.includes('yieldos-update $ARGUMENTS'), true);
  if (process.platform !== 'win32') {
    assert.equal((mode & 0o111) !== 0, true);
  }
});
