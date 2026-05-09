'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const init = require('../scripts/init-command');

const PLUGIN_ROOT = path.resolve(__dirname, '..');

function tmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'yieldos-init-'));
}

test('renderInstructionFiles creates shared AGENTS.md plus Claude import for both agents', () => {
  const files = init.renderInstructionFiles({
    agent: 'both',
    scope: 'project',
    profiles: ['read-only', 'db-safe', 'production-safe'],
  });

  assert.deepEqual(files.map((file) => file.path), ['AGENTS.md', 'CLAUDE.md']);
  assert.equal(files[1].content.startsWith('@AGENTS.md'), true);
  assert.equal(files[0].content.includes('Read-only posture'), true);
  assert.equal(files[0].content.includes('Database safety'), true);
  assert.equal(files[0].content.includes('Production safety'), true);
  assert.equal(files[0].content.includes('yieldOS'), true);
});

test('runInit previews by default and does not write files', () => {
  const root = tmpProject();
  const result = init.runInit(root, ['--agent', 'both', '--profile', 'read-only,db-safe']);

  assert.equal(result.exitCode, 0);
  assert.equal(result.message.includes('yieldOS init preview'), true);
  assert.equal(fs.existsSync(path.join(root, 'AGENTS.md')), false);
  assert.equal(fs.existsSync(path.join(root, 'CLAUDE.md')), false);
});

test('runInit writes project files only with --write and refuses overwrite without --force', () => {
  const root = tmpProject();
  const first = init.runInit(root, ['--agent', 'both', '--profile', 'read-only', '--write']);

  assert.equal(first.exitCode, 0);
  assert.equal(fs.existsSync(path.join(root, 'AGENTS.md')), true);
  assert.equal(fs.existsSync(path.join(root, 'CLAUDE.md')), true);

  const second = init.runInit(root, ['--agent', 'both', '--profile', 'db-safe', '--write']);
  assert.equal(second.exitCode, 2);
  assert.equal(second.message.includes('already exists'), true);
});

test('runInit writes personal scope to both agent homes without relative imports', () => {
  const root = tmpProject();
  const home = tmpProject();
  const result = init.runInit(root, ['--scope', 'personal', '--agent', 'both', '--write'], { home });

  const codexInstructions = path.join(home, '.codex', 'AGENTS.md');
  const claudeInstructions = path.join(home, '.claude', 'CLAUDE.md');
  assert.equal(result.exitCode, 0);
  assert.equal(fs.existsSync(codexInstructions), true);
  assert.equal(fs.existsSync(claudeInstructions), true);
  assert.equal(fs.readFileSync(claudeInstructions, 'utf8').startsWith('@AGENTS.md'), false);
});

test('runInit keeps organization scope export-only', () => {
  const root = tmpProject();
  const result = init.runInit(root, ['--scope', 'org', '--write']);

  assert.equal(result.exitCode, 2);
  assert.equal(result.message.includes('export-only'), true);
});

test('runInit keeps local scope Claude-only and previews the local target', () => {
  const root = tmpProject();
  const rejected = init.runInit(root, ['--scope', 'local']);
  const preview = init.runInit(root, ['--scope', 'local', '--agent', 'claude']);

  assert.equal(rejected.exitCode, 2);
  assert.equal(rejected.message.includes('--agent claude'), true);
  assert.equal(preview.exitCode, 0);
  assert.equal(preview.message.includes('--- CLAUDE.local.md ---'), true);
});

test('init command markdown and executable are registered', () => {
  const command = fs.readFileSync(path.join(PLUGIN_ROOT, 'commands', 'init.md'), 'utf8');
  const mode = fs.statSync(path.join(PLUGIN_ROOT, 'bin', 'yieldos-init')).mode;

  assert.equal(command.includes('allowed-tools: Bash(yieldos-init:*)'), true);
  assert.equal(command.includes('yieldos-init $ARGUMENTS'), true);
  assert.equal((mode & 0o111) !== 0, true);
});
