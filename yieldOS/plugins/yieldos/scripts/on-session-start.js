#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const policyFetcher = require('./policy-fetcher');
const instructionWatcher = require('./instruction-watcher');
const settingsValidator = require('./analyzers/settings-validator');
const injectionScanner = require('./injection-scanner');
const logger = require('./logger');
const ui = require('./ui');

function readStdinSync() {
  try { return fs.readFileSync(0, 'utf8'); }
  catch (_) { return ''; }
}

function parseInput(raw) {
  if (!raw) return {};
  try { return JSON.parse(raw); }
  catch (_) { return {}; }
}

function projectCwd(input) {
  return input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

function detectManagers(projectRoot) {
  const list = [];
  const checks = [
    ['package-lock.json', 'npm'],
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['bun.lockb', 'bun'],
    ['requirements.txt', 'pip'],
    ['poetry.lock', 'poetry'],
    ['uv.lock', 'uv'],
  ];
  for (const [file, mgr] of checks) {
    if (fs.existsSync(path.join(projectRoot, file))) list.push(mgr);
  }
  if (list.length === 0 && fs.existsSync(path.join(projectRoot, 'package.json'))) list.push('npm');
  return list;
}

async function main() {
  const raw = readStdinSync();
  const input = parseInput(raw);
  const projectRoot = projectCwd(input);

  let policyResult = { source: 'unavailable', policy: null };
  try {
    policyResult = await policyFetcher.getPolicy({ forceRefresh: true });
  } catch (err) {
    ui.writeMessage(`policy refresh failed: ${err.message}`);
  }
  ui.writeMessage(`policy source: ${policyResult.source}`);
  const policy = policyResult.policy || {};

  if (policy['required-settings.json']) {
    const managers = detectManagers(projectRoot);
    for (const mgr of managers) {
      try {
        const r = settingsValidator.validateAndFix(projectRoot, mgr, policy['required-settings.json']);
        if (r.applied && r.applied.length > 0) {
          logger.appendEntry(projectRoot, 'Required Settings Applied', {
            Manager: mgr,
            File: r.file,
            Applied: r.applied,
          });
        }
      } catch (_) { /* ignore */ }
    }
  }

  const changes = instructionWatcher.checkAll(projectRoot);
  for (const c of changes) {
    if (c.status === 'changed') {
      const findings = policy['injection-patterns.json']
        ? injectionScanner.scan(c.content, policy['injection-patterns.json'].patterns)
        : [];
      logger.logInstructionChange(projectRoot, c.file, {
        previousHash: c.previousHash,
        newHash: c.newHash,
        diff: findings.length > 0 ? `${findings.length} injection signals detected` : 'content changed',
        action: findings.length > 0 ? 'flagged for review' : 'auto-accepted',
      });
      if (findings.length > 0) {
        ui.writeMessage(`AGENTS/CLAUDE.md cambió y contiene patrones sospechosos: ${c.file}`, { action: 'block' });
      }
    }
  }

  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`[yieldOS:fatal] ${err.message}\n`);
  process.exit(0);
});
