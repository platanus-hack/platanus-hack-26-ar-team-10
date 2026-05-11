'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const configCommand = require('../scripts/config-command');

const PLUGIN_ROOT = path.resolve(__dirname, '..');

function tmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'yieldos-config-'));
}

function writeConfig(root, value) {
  fs.mkdirSync(path.join(root, '.yieldos'), { recursive: true });
  fs.writeFileSync(path.join(root, '.yieldos', 'config.json'), `${JSON.stringify(value, null, 2)}\n`);
}

test('show resolves the default standard runtime config', () => {
  const root = tmpProject();
  const result = configCommand.runConfigCommand(root, ['show'], { env: {} });

  assert.equal(result.exitCode, 0);
  assert.match(result.message, /effective mode: standard/);
  assert.match(result.message, /source: default/);
});

test('init writes .yieldos/config.json only when requested', () => {
  const root = tmpProject();
  const preview = configCommand.runConfigCommand(root, ['init']);
  const written = configCommand.runConfigCommand(root, ['init', '--write']);
  const rejected = configCommand.runConfigCommand(root, ['init', '--write']);

  assert.equal(preview.exitCode, 0);
  assert.match(preview.message, /yieldOS config preview/);
  assert.equal(fs.existsSync(path.join(root, '.yieldos', 'config.json')), true);
  assert.equal(written.exitCode, 0);
  assert.match(written.message, /yieldOS config wrote/);
  assert.equal(rejected.exitCode, 2);
  assert.match(rejected.message, /refused to overwrite/);
});

test('validate fails closed for invalid repo config', () => {
  const root = tmpProject();
  writeConfig(root, { version: 99, mode: 'off' });

  const result = configCommand.runConfigCommand(root, ['validate']);

  assert.equal(result.exitCode, 2);
  assert.match(result.message, /unsupported config version/);
  assert.match(result.message, /unsupported mode/);
});

test('yieldos-config writes human validation errors to stderr', () => {
  const root = tmpProject();
  writeConfig(root, { version: 1, mode: 'off' });

  const result = spawnSync(path.join(PLUGIN_ROOT, 'bin', 'yieldos-config'), ['validate'], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /yieldOS config error/);
});

test('config command markdown and executable are registered', () => {
  const command = fs.readFileSync(path.join(PLUGIN_ROOT, 'commands', 'config.md'), 'utf8');
  const mode = fs.statSync(path.join(PLUGIN_ROOT, 'bin', 'yieldos-config')).mode;

  assert.equal(command.includes('allowed-tools: Bash(yieldos-config:*)'), true);
  assert.equal(command.includes('yieldos-config $ARGUMENTS'), true);
  if (process.platform !== 'win32') {
    assert.equal((mode & 0o111) !== 0, true);
  }
});
