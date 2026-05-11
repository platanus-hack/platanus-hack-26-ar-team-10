'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const doctor = require('../scripts/doctor-command');

const PLUGIN_ROOT = path.resolve(__dirname, '..');

function tmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'yieldos-doctor-'));
}

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function tmpRepo() {
  const root = tmpProject();
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'Test User']);
  fs.writeFileSync(path.join(root, 'app.js'), 'module.exports = {};\n');
  git(root, ['add', 'app.js']);
  git(root, ['commit', '-m', 'initial']);
  return root;
}

test('doctor reports default mode, missing hooks, and absent pack lock', () => {
  const root = tmpRepo();
  const result = doctor.runDoctor(root, [], { pluginRoot: PLUGIN_ROOT, env: {} });

  assert.equal(result.exitCode, 0);
  assert.match(result.message, /plugin version: 0\.14\.0/);
  assert.match(result.message, /global policy version: 0\.5\.0/);
  assert.match(result.message, /effective mode: standard/);
  assert.match(result.message, /org overlay: none/);
  assert.match(result.message, /git hooks: missing pre-commit, pre-push/);
  assert.match(result.message, /pack lock: absent/);
});

test('doctor reports org overlay hash and enterprise effective mode', () => {
  const root = tmpRepo();
  fs.writeFileSync(path.join(root, 'org-overlay.json'), `${JSON.stringify({
    version: 1,
    kind: 'yieldos.org-overlay',
    minimumMode: 'enterprise',
  }, null, 2)}\n`);
  fs.mkdirSync(path.join(root, '.yieldos'), { recursive: true });
  fs.writeFileSync(path.join(root, '.yieldos', 'config.json'), `${JSON.stringify({
    version: 1,
    mode: 'standard',
    orgOverlay: 'org-overlay.json',
  }, null, 2)}\n`);

  const result = doctor.runDoctor(root, [], { pluginRoot: PLUGIN_ROOT, env: {} });

  assert.equal(result.exitCode, 0);
  assert.match(result.message, /effective mode: enterprise/);
  assert.match(result.message, /org overlay: sha256:/);
});

test('doctor command markdown and executable are registered', () => {
  const command = fs.readFileSync(path.join(PLUGIN_ROOT, 'commands', 'doctor.md'), 'utf8');
  const mode = fs.statSync(path.join(PLUGIN_ROOT, 'bin', 'yieldos-doctor')).mode;

  assert.equal(command.includes('allowed-tools: Bash(yieldos-doctor:*)'), true);
  assert.equal(command.includes('yieldos-doctor $ARGUMENTS'), true);
  if (process.platform !== 'win32') {
    assert.equal((mode & 0o111) !== 0, true);
  }
});
