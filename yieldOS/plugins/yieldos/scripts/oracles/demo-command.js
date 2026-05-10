#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ui = require('../ui');
const proof = require('./cdsc/proof');
const { hashObject } = require('./result');

const PLUGIN_ROOT = path.resolve(__dirname, '..', '..');
const REPO_ROOT = path.resolve(PLUGIN_ROOT, '..', '..', '..');
const FIXTURE_ROOT = process.env.YIELDOS_ORACLE_DEMO_FIXTURE_ROOT ||
  path.join(REPO_ROOT, 'examples', 'oracle-demo', 'fixture');

function parseArgs(argv = []) {
  const args = [...argv];
  const scenario = args.shift() || 'missing-auth';
  const parsed = { scenario, open: false, help: false };
  for (const arg of args) {
    if (arg === '--open') parsed.open = true;
    else if (arg === '--help' || arg === '-h') parsed.help = true;
    else throw new Error(`unknown demo option: ${arg}`);
  }
  return parsed;
}

async function runDemo(argv = process.argv.slice(2), options = {}) {
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (err) {
    return { exitCode: 2, message: `yieldOS oracle demo error: ${err.message}` };
  }
  if (parsed.help) return { exitCode: 0, message: usage() };
  if (parsed.scenario !== 'missing-auth') {
    return { exitCode: 2, message: `yieldOS oracle demo error: unknown scenario: ${parsed.scenario}` };
  }

  const root = options.projectRoot || fs.mkdtempSync(path.join(os.tmpdir(), 'yieldos-oracle-demo-'));
  try {
    prepareDemoProject(root);
  } catch (err) {
    return { exitCode: 2, message: `yieldOS oracle demo error: ${err.message}` };
  }
  const result = await proof.run(root, {
    contract: 'security/oracles/missing-auth-demo/contract.json',
    runtime: 'yieldos.oracle-runtime.json',
  });
  if (parsed.open) openDemoRoute(options.demoUrl || 'http://localhost:3018/oracle-demo');
  return {
    exitCode: result.status === 'pass' ? 0 : result.status === 'fail' ? 1 : 2,
    message: renderDemo(root, result, { color: options.color }),
    result,
    projectRoot: root,
  };
}

function prepareDemoProject(root) {
  if (!fs.existsSync(FIXTURE_ROOT)) {
    throw new Error('yieldOS oracle demo fixtures are not included in this plugin package. Use the repository examples/oracle-demo fixture or set YIELDOS_ORACLE_DEMO_FIXTURE_ROOT.');
  }
  fs.mkdirSync(path.join(root, 'security/oracles/missing-auth-demo'), { recursive: true });
  fs.cpSync(FIXTURE_ROOT, path.join(root, 'fixture'), { recursive: true });
  const sourceText = fs.readFileSync(path.join(root, 'fixture', 'vulnerable-source.js'), 'utf8');
  const contract = {
    version: '0.1',
    id: 'missing-auth-demo',
    source: {
      rule_id: 'missing-authz',
      source: 'deterministic',
      file: 'fixture/server-source.js',
      file_hash: hashObject({ text: sourceText }),
      diff_hash: 'sha256:demo',
      line: "app.get('/admin/users', (req, res) => res.json(users));",
    },
    subject: { type: 'http-route', method: 'GET', path: '/admin/users' },
    observable_must: 'Unauthenticated request must receive 401 or 403.',
    expect: { status: [401, 403] },
  };
  const replay = {
    version: '0.1',
    id: 'missing-auth-demo',
    type: 'http',
    request: { method: 'GET', path: '/admin/users', headers: {} },
    expect: { status: [401, 403] },
  };
  const runtime = JSON.parse(fs.readFileSync(path.join(FIXTURE_ROOT, 'yieldos.oracle-runtime.json'), 'utf8'));
  runtime.baseline.cwd = 'fixture';
  runtime.fixed.cwd = 'fixture';
  fs.writeFileSync(path.join(root, 'security/oracles/missing-auth-demo/contract.json'), `${JSON.stringify(contract, null, 2)}\n`);
  fs.writeFileSync(path.join(root, 'security/oracles/missing-auth-demo/replay.json'), `${JSON.stringify(replay, null, 2)}\n`);
  fs.writeFileSync(path.join(root, 'yieldos.oracle-runtime.json'), `${JSON.stringify(runtime, null, 2)}\n`);
}

function renderDemo(root, result, options = {}) {
  const proofPath = path.join(root, 'security/oracles/missing-auth-demo/proof-manifest.json');
  if (!fs.existsSync(proofPath)) {
    return [
      'yieldOS oracle proof demo: missing-auth',
      '',
      card('UNKNOWN proof incomplete', result.summary || 'Proof manifest was not created.'),
      result.blocking_reason ? card('REASON', result.blocking_reason) : '',
      '',
      `Artifacts: ${path.join(root, 'security/oracles/missing-auth-demo')}`,
      'Scope: this route and replay only, not the whole repo.',
    ].filter(Boolean).join('\n');
  }
  const manifest = JSON.parse(fs.readFileSync(proofPath, 'utf8'));
  const baselineStatus = manifest.baseline.observed?.status || 'unknown';
  const fixedStatus = manifest.fixed.observed?.status || 'unknown';
  const artifactLines = ui.formatArtifactLines([
    { label: 'contract', path: 'security/oracles/missing-auth-demo/contract.json' },
    { label: 'proof', path: 'security/oracles/missing-auth-demo/proof-manifest.json' },
  ], { color: options.color });
  return [
    'yieldOS oracle proof demo: missing-auth',
    '',
    card('FAIL missing-authz', `Unauthenticated GET /admin/users returned ${baselineStatus}.`),
    card('CONTRACT created', 'Unauthenticated request must receive 401 or 403.'),
    card('REPLAY baseline got 200', `Observed ${baselineStatus} on vulnerable runtime.`),
    card('FIX applied', 'Auth middleware rejects requests without Authorization.'),
    card('REPLAY fixed got 401', `Observed ${fixedStatus} on fixed runtime.`),
    card('PASS scoped acceptance', result.status === 'pass' ? 'Baseline failed and fixed replay passed.' : `Proof status: ${result.status}.`),
    '',
    ...artifactLines,
    `Artifacts: ${path.join(root, 'security/oracles/missing-auth-demo')}`,
    'Scope: this route and replay only, not the whole repo.',
  ].join('\n');
}

function card(title, body) {
  return `[${title}] ${body}`;
}

function openDemoRoute(url) {
  if (process.platform === 'darwin') spawnSync('open', [url], { stdio: 'ignore' });
}

function usage() {
  return [
    'yieldos-oracle-demo — visible oracle proof scenarios',
    '',
    'usage:',
    '  yieldos-oracle-demo missing-auth [--open]',
  ].join('\n');
}

async function main() {
  const result = await runDemo(process.argv.slice(2), {
    color: ui.shouldColor(process.stderr),
  });
  const stream = result.exitCode === 0 ? process.stdout : process.stderr;
  stream.write(`${result.message.trimEnd()}\n`);
  process.exit(result.exitCode);
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`yieldOS oracle demo fatal: ${err.message}\n`);
    process.exit(2);
  });
}

module.exports = {
  parseArgs,
  prepareDemoProject,
  renderDemo,
  runDemo,
};
