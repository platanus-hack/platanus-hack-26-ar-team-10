'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');

const INSTRUCTION_FILES = ['CLAUDE.md', 'AGENTS.md', '.cursorrules'];

function stateFile(projectRoot) {
  return path.join(projectRoot, 'security', '.yieldos-instruction-hashes.json');
}

function hashContent(content) {
  return crypto.createHash('sha256').update(content || '').digest('hex');
}

function readState(projectRoot) {
  const fp = stateFile(projectRoot);
  if (!fs.existsSync(fp)) return { entries: {} };
  try { return JSON.parse(fs.readFileSync(fp, 'utf8')); }
  catch (_) { return { entries: {} }; }
}

function writeState(projectRoot, state) {
  const fp = stateFile(projectRoot);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, JSON.stringify(state, null, 2));
}

function listInstructionFiles(projectRoot) {
  const found = [];
  for (const name of INSTRUCTION_FILES) {
    const fp = path.join(projectRoot, name);
    if (fs.existsSync(fp)) found.push({ name, path: fp });
  }
  const globalClaude = path.join(os.homedir(), '.claude', 'CLAUDE.md');
  if (fs.existsSync(globalClaude)) found.push({ name: 'CLAUDE.md (global)', path: globalClaude });
  return found;
}

function checkAll(projectRoot) {
  const state = readState(projectRoot);
  if (!state.entries) state.entries = {};
  const results = [];
  for (const file of listInstructionFiles(projectRoot)) {
    const content = fs.readFileSync(file.path, 'utf8');
    const newHash = hashContent(content);
    const prev = state.entries[file.path];
    if (!prev) {
      state.entries[file.path] = { hash: newHash, accepted_at: new Date().toISOString() };
      results.push({ file: file.path, status: 'first-seen', hash: newHash });
      continue;
    }
    if (prev.hash === newHash) {
      results.push({ file: file.path, status: 'unchanged', hash: newHash });
      continue;
    }
    results.push({
      file: file.path,
      status: 'changed',
      previousHash: prev.hash,
      newHash,
      content,
    });
  }
  writeState(projectRoot, state);
  return results;
}

function acceptChange(projectRoot, filepath, newHash) {
  const state = readState(projectRoot);
  if (!state.entries) state.entries = {};
  state.entries[filepath] = { hash: newHash, accepted_at: new Date().toISOString() };
  writeState(projectRoot, state);
}

module.exports = { checkAll, acceptChange, listInstructionFiles, hashContent, INSTRUCTION_FILES };
