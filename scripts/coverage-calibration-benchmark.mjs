#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  commandOutputEvidence,
  ratio,
  readJson,
  safeReportPath,
  safeText,
  summarizeCounts,
  writeJson,
} from './benchmark-utils.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOOK_PATH = path.join(REPO_ROOT, 'yieldOS', 'plugins', 'yieldos', 'scripts', 'pre-install-gate.js');

const CALIBRATION_TASKS = [
  task('admin-route-no-auth', 'immediate-prevent', 'Sensitive admin route without auth middleware.', 'server.js', [
    'function register(app, users) {',
    "  app.get('/admin/users', (req, res) => res.json(users));",
    '}',
    'module.exports = { register };',
  ]),
  task('sql-string-concat', 'immediate-prevent', 'Request-controlled SQL interpolation.', 'db.js', [
    'function findUser(db, req) { return db.query("SELECT * FROM users WHERE id = " + req.query.id); }',
    'module.exports = { findUser };',
  ]),
  task('shell-ref-helper', 'immediate-prevent', 'Request-controlled shell command.', 'tasks.js', [
    "const { exec } = require('node:child_process');",
    'function showRef(req) { exec("git log " + req.query.ref); }',
    'module.exports = { showRef };',
  ]),
  task('server-side-url-fetch', 'immediate-prevent', 'Request-controlled server-side fetch.', 'importer.js', [
    'async function importUrl(req) { return fetch(req.query.url).then((r) => r.text()); }',
    'module.exports = { importUrl };',
  ]),
  task('upload-path-join', 'immediate-prevent', 'Request-controlled filesystem path.', 'files.js', [
    "const path = require('node:path');",
    'function preview(req) { return path.join(process.cwd(), "uploads", req.query.name); }',
    'module.exports = { preview };',
  ]),
  task('secret-console-log', 'immediate-prevent', 'Sensitive value written to logs.', 'debug.js', [
    'function debugToken() { console.log(process.env.SECRET_TOKEN); }',
    'module.exports = { debugToken };',
  ]),
  task('query-redirect', 'immediate-prevent', 'User-controlled redirect target.', 'redirect.js', [
    'function afterLogin(req, res) { res.redirect(req.query.next); }',
    'module.exports = { afterLogin };',
  ]),
  task('public-profile-read', 'safe-control', 'Benign public read-only helper.', 'profile.js', [
    'function publicProfile(profile) { return { name: profile.name, title: profile.title }; }',
    'module.exports = { publicProfile };',
  ]),
  task('parameterized-sql', 'safe-control', 'Parameterized query control.', 'safe-db.js', [
    'function findUser(db, req) { return db.query("SELECT * FROM users WHERE id = ?", [req.query.id]); }',
    'module.exports = { findUser };',
  ]),
  task('mapped-redirect', 'safe-control', 'Server-side redirect map control.', 'safe-redirect.js', [
    "const destinations = { dashboard: '/dashboard', settings: '/settings' };",
    'function afterLogin(req, res) {',
    "  const target = destinations[req.query.next] || '/';",
    '  res.redirect(target);',
    '}',
    'module.exports = { afterLogin };',
  ]),
  task('mounted-admin-router', 'coverage-candidate', 'Admin router is mounted separately from the sensitive handler.', 'mounted-admin.js', [
    "const express = require('express');",
    'const adminRouter = express.Router();',
    "adminRouter.get('/users', (req, res) => res.json(users));",
    "function register(app, users) { app.use('/admin', adminRouter); }",
    'module.exports = { register };',
  ]),
  task('prisma-raw-unsafe', 'coverage-candidate', 'Prisma raw SQL helper interpolates request input.', 'prisma.js', [
    'async function findUser(prisma, req) {',
    '  return prisma.$queryRawUnsafe(`SELECT * FROM users WHERE id = ${req.query.id}`);',
    '}',
    'module.exports = { findUser };',
  ]),
];

function task(id, track, description, file, lines) {
  return { id, track, description, file: `yieldos-calibration-${file}`, code: `${lines.join('\n')}\n` };
}

function parseArgs(argv = process.argv.slice(2)) {
  const parsed = {
    outFile: path.join(REPO_ROOT, 'benchmarks', `coverage-calibration-benchmark-${new Date().toISOString().replace(/[:.]/g, '-')}.json`),
    tempRoot: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out') parsed.outFile = path.resolve(requireValue(arg, argv[++i]));
    else if (arg === '--tmp') parsed.tempRoot = path.resolve(requireValue(arg, argv[++i]));
    else if (arg === '--help' || arg === '-h') parsed.help = true;
    else throw new Error(`unknown option: ${arg}`);
  }
  return parsed;
}

function requireValue(flag, value) {
  if (!value || value.startsWith('--')) throw new Error(`${flag} needs a value`);
  return value;
}

function runCoverageCalibration(options = {}) {
  const tempRoot = options.tempRoot || fs.mkdtempSync(path.join(os.tmpdir(), 'yieldos-coverage-calibration-'));
  fs.mkdirSync(tempRoot, { recursive: true });
  const report = {
    version: 1,
    generated_at: new Date().toISOString(),
    benchmark: {
      id: 'coverage-calibration',
      hook: path.relative(REPO_ROOT, HOOK_PATH),
      note: 'Measures immediate deterministic coverage against a balanced calibration set. Coverage-candidate cases are tracked as future oracle work, not as current product promises.',
    },
    tasks: CALIBRATION_TASKS.map(({ id, track, description }) => ({ id, track, description })),
    results: CALIBRATION_TASKS.map((item) => runTask(item, tempRoot)),
    aggregate: null,
  };
  report.aggregate = summarizeCalibration(report.results);
  if (options.outFile) writeJson(options.outFile, report);
  return report;
}

function runTask(item, tempRoot) {
  const root = path.join(tempRoot, item.id);
  initRepo(root);
  fs.mkdirSync(path.dirname(path.join(root, item.file)), { recursive: true });
  fs.writeFileSync(path.join(root, item.file), item.code);
  runGit(root, ['add', item.file]);
  const started = Date.now();
  const hook = spawnSync(process.execPath, [HOOK_PATH], {
    cwd: root,
    env: deterministicHookEnv(),
    input: JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: `git commit -m "coverage calibration ${item.id}"` },
      cwd: root,
    }),
    encoding: 'utf8',
    timeout: 20000,
  });
  const auditState = readAuditState(root);
  const verdict = parseVerdict(hook.stderr) || auditState?.verdict || null;
  const prevented = hook.status !== 0 && ['code-audit-blocked', 'code-audit-fix-applied', 'code-audit-verification-failed'].includes(verdict);
  return {
    task_id: item.id,
    track: item.track,
    description: item.description,
    outcome: classifyOutcome(item.track, prevented, hook.status),
    yieldos: {
      hook_exit_code: hook.status,
      prevented,
      verdict,
      action: auditState?.action || null,
      findings: summarizeFindings(auditState?.findings || []),
      duration_ms: Date.now() - started,
      output: commandOutputEvidence(hook),
    },
  };
}

function classifyOutcome(track, prevented, hookExitCode) {
  if (track === 'immediate-prevent' && prevented) return 'immediately-prevented';
  if (track === 'safe-control' && hookExitCode === 0) return 'accepted-safe-control';
  if (track === 'coverage-candidate' && hookExitCode === 0) return 'not-instantly-detected';
  return 'unexpected';
}

function summarizeCalibration(results) {
  const outcomes = summarizeCounts(results.map((result) => result.outcome));
  const tracks = summarizeCounts(results.map((result) => result.track));
  const immediateCorrect = (outcomes['immediately-prevented'] || 0) + (outcomes['accepted-safe-control'] || 0);
  const coverageCandidates = outcomes['not-instantly-detected'] || 0;
  return {
    total_cases: results.length,
    tracks,
    outcomes,
    immediate_correct_decisions: immediateCorrect,
    immediate_correct_decision_rate: ratio(immediateCorrect, results.length),
    not_instantly_detected: coverageCandidates,
    not_instantly_detected_rate: ratio(coverageCandidates, results.length),
    unexpected: outcomes.unexpected || 0,
  };
}

function initRepo(root) {
  fs.mkdirSync(root, { recursive: true });
  runGit(root, ['init', '-b', 'main']);
  runGit(root, ['config', 'user.email', 'yieldos-benchmark@example.com']);
  runGit(root, ['config', 'user.name', 'yieldOS Benchmark']);
  fs.writeFileSync(path.join(root, 'README.md'), '# coverage calibration fixture\n');
  runGit(root, ['add', 'README.md']);
  runGit(root, ['commit', '-m', 'initial']);
}

function runGit(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 30000 });
  if (result.error) return { status: 1, stdout: '', stderr: result.error.message };
  return { status: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
}

function deterministicHookEnv() {
  return {
    ...process.env,
    YIELDOS_AGENT_CHILD: '',
    YIELDOS_CODE_AUDIT_MODE: 'deterministic',
    YIELDOS_CODE_AUDIT_AGENT: 'none',
  };
}

function readAuditState(repoRoot) {
  try {
    return readJson(path.join(repoRoot, 'security', 'code-audit-state.json'));
  } catch (_) {
    return null;
  }
}

function parseVerdict(stderr) {
  const match = /\[yieldOS:verdict\]\s+([^\s]+)/.exec(stderr || '');
  return match ? match[1] : null;
}

function summarizeFindings(findings) {
  return findings.map((finding) => ({
    rule_id: safeText(finding.rule_id || finding.id || 'unknown', 80),
    severity: safeText(finding.severity || 'unknown', 30),
    file: safeReportPath(finding.file || ''),
    title: safeText(finding.title || finding.message || 'Untitled finding', 160),
    status: safeText(finding.status || 'unknown', 40),
  }));
}

function usage() {
  return [
    'Usage: node scripts/coverage-calibration-benchmark.mjs --out benchmarks/<file>.json',
    '',
    'Runs a balanced deterministic coverage calibration set through the yieldOS commit hook.',
  ].join('\n');
}

async function main() {
  try {
    const args = parseArgs();
    if (args.help) {
      process.stdout.write(`${usage()}\n`);
      return;
    }
    const report = runCoverageCalibration({ outFile: args.outFile, tempRoot: args.tempRoot });
    process.stdout.write(`${JSON.stringify({ outFile: args.outFile, aggregate: report.aggregate }, null, 2)}\n`);
  } catch (err) {
    process.stderr.write(`coverage-calibration-benchmark: ${err.message}\n`);
    process.exit(2);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}

export {
  CALIBRATION_TASKS,
  parseArgs,
  runCoverageCalibration,
  summarizeCalibration,
};
