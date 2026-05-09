'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const watcher = require('../scripts/instruction-watcher');

function tmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yieldos-iw-'));
  return dir;
}

test('first-seen on initial scan', () => {
  const root = tmpProject();
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# rules');
  const r = watcher.checkAll(root);
  const claudeEntry = r.find((x) => x.file.endsWith('CLAUDE.md'));
  assert.equal(claudeEntry.status, 'first-seen');
});

test('unchanged on second scan', () => {
  const root = tmpProject();
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# rules');
  watcher.checkAll(root);
  const r = watcher.checkAll(root);
  const claudeEntry = r.find((x) => x.file.endsWith('CLAUDE.md'));
  assert.equal(claudeEntry.status, 'unchanged');
});

test('changed when content modified', () => {
  const root = tmpProject();
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# original');
  watcher.checkAll(root);
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# modified content');
  const r = watcher.checkAll(root);
  const entry = r.find((x) => x.file.endsWith('AGENTS.md'));
  assert.equal(entry.status, 'changed');
  assert.notEqual(entry.previousHash, entry.newHash);
});

test('hash is deterministic', () => {
  const a = watcher.hashContent('hello');
  const b = watcher.hashContent('hello');
  assert.equal(a, b);
});

test('hash differs for different content', () => {
  const a = watcher.hashContent('hello');
  const b = watcher.hashContent('world');
  assert.notEqual(a, b);
});

test('listInstructionFiles returns existing files', () => {
  const root = tmpProject();
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# rules');
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# agents');
  const list = watcher.listInstructionFiles(root);
  assert.equal(list.length >= 2, true);
});
