'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const codeAudit = require('../scripts/code-audit');
const missingAuth = require('../scripts/oracles/cdsc/missing-auth-contract');
const replayRunner = require('../scripts/oracles/cdsc/replay-runner');
const proof = require('../scripts/oracles/cdsc/proof');
const oracleCommand = require('../scripts/oracle-command');
const { hashObject } = require('../scripts/oracles/result');
const demoCommand = require('../scripts/oracles/demo-command');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const FIXTURE_ROOT = path.join(REPO_ROOT, 'yieldOS', 'fixtures', 'oracle-demo');

function tmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'yieldos-cdsc-'));
}

function sh(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function tmpRepo() {
  const root = tmpProject();
  sh(root, ['init', '-b', 'main']);
  sh(root, ['config', 'user.email', 'test@example.com']);
  sh(root, ['config', 'user.name', 'Test User']);
  fs.writeFileSync(path.join(root, 'server.js'), 'module.exports = {};\n');
  sh(root, ['add', 'server.js']);
  sh(root, ['commit', '-m', 'initial']);
  return root;
}

function groundedSource(root) {
  fs.cpSync(FIXTURE_ROOT, path.join(root, 'fixture'), { recursive: true });
  const sourceFile = path.join(root, 'fixture', 'server-source.js');
  const sourceText = fs.readFileSync(sourceFile, 'utf8');
  return {
    rule_id: 'missing-authz',
    source: 'deterministic',
    file: 'fixture/server-source.js',
    file_hash: hashObject({ text: sourceText }),
    diff_hash: 'sha256:test-diff',
    line: "app.get('/admin/users', (req, res) => res.json(users));",
  };
}

function writeProofInputs(root, options = {}) {
  fs.mkdirSync(path.join(root, 'security/oracles/demo'), { recursive: true });
  const source = options.source === undefined ? groundedSource(root) : options.source;
  fs.writeFileSync(path.join(root, 'security/oracles/demo/contract.json'), JSON.stringify({
    version: '0.1',
    id: 'demo',
    ...(source ? { source } : {}),
    subject: { type: 'http-route', method: 'GET', path: '/admin/users' },
    expect: { status: [401, 403] },
  }, null, 2));
  fs.writeFileSync(path.join(root, 'security/oracles/demo/replay.json'), JSON.stringify({
    version: '0.1',
    type: 'http',
    request: { method: 'GET', path: '/admin/users', headers: {} },
    expect: { status: [401, 403] },
  }, null, 2));
  if (!fs.existsSync(path.join(root, 'fixture'))) {
    fs.cpSync(FIXTURE_ROOT, path.join(root, 'fixture'), { recursive: true });
  }
  const runtime = JSON.parse(fs.readFileSync(path.join(FIXTURE_ROOT, 'yieldos.oracle-runtime.json'), 'utf8'));
  runtime.baseline.cwd = 'fixture';
  runtime.fixed.cwd = 'fixture';
  fs.writeFileSync(path.join(root, 'yieldos.oracle-runtime.json'), JSON.stringify(runtime, null, 2));
}

test('missing-auth contract grounds only current deterministic findings', () => {
  const root = tmpProject();
  fs.copyFileSync(path.join(FIXTURE_ROOT, 'server-source.js'), path.join(root, 'server.js'));
  const finding = {
    ruleId: 'missing-authz',
    severity: 'high',
    file: 'server.js',
    line: "app.get('/admin/users', (req, res) => res.json(users));",
    source: 'deterministic',
  };

  const grounded = missingAuth.groundMissingAuthFinding(root, finding, { diffHash: 'sha256:demo' });
  const stale = missingAuth.groundMissingAuthFinding(root, { ...finding, line: "app.get('/admin/users', requireAuth, handler);" });

  assert.equal(grounded.ok, true);
  assert.equal(grounded.contract.subject.method, 'GET');
  assert.equal(grounded.contract.subject.path, '/admin/users');
  assert.deepEqual(grounded.replay.expect.status, [401, 403]);
  assert.equal(stale.ok, false);
});

test('cdsc replay maps vulnerable baseline to fail and fixed runtime to pass', async () => {
  const root = REPO_ROOT;
  const contract = {
    version: '0.1',
    id: 'express-admin-route-requires-auth',
    subject: { type: 'http-route', method: 'GET', path: '/admin/users' },
    expect: { status: [401, 403] },
  };
  const replay = {
    version: '0.1',
    type: 'http',
    request: { method: 'GET', path: '/admin/users', headers: {} },
    expect: { status: [401, 403] },
  };
  const runtime = JSON.parse(fs.readFileSync(path.join(FIXTURE_ROOT, 'yieldos.oracle-runtime.json'), 'utf8'));

  const baseline = await replayRunner.runReplay(root, contract, replay, replayRunner.runtimeForMode(runtime, 'baseline'));
  const fixed = await replayRunner.runReplay(root, contract, replay, replayRunner.runtimeForMode(runtime, 'fixed'));

  assert.equal(baseline.status, 'fail');
  assert.equal(baseline.evidence.find((item) => item.type === 'observed').value.status, 200);
  assert.equal(fixed.status, 'pass');
  assert.equal(fixed.evidence.find((item) => item.type === 'observed').value.status, 401);
});

test('cdsc replay rejects shell commands, absolute replay URLs, and missing health checks as unknown', async () => {
  const root = tmpProject();
  fs.writeFileSync(path.join(root, 'no-health.js'), [
    "'use strict';",
    "const http = require('node:http');",
    "const server = http.createServer((req, res) => {",
    "  if (req.url === '/admin/users') { res.writeHead(401); res.end('secret-body'); return; }",
    "  res.writeHead(404); res.end('missing');",
    "});",
    "server.listen(Number(process.env.PORT), '127.0.0.1');",
    '',
  ].join('\n'));
  const contract = {
    version: '0.1',
    id: 'demo',
    subject: { type: 'http-route', method: 'GET', path: '/admin/users' },
    expect: { status: [401, 403] },
  };
  const replay = {
    version: '0.1',
    type: 'http',
    request: { method: 'GET', path: '/admin/users', headers: {} },
    expect: { status: [401, 403] },
  };
  const noHealth = await replayRunner.runReplay(root, contract, replay, {
    command: '${NODE}',
    args: ['no-health.js'],
    health_url: 'http://127.0.0.1:${PORT}/healthz',
    base_url: 'http://127.0.0.1:${PORT}',
    ready_timeout_ms: 250,
  });
  const shellCommand = await replayRunner.runReplay(root, contract, replay, {
    command: '/bin/sh',
    args: ['-c', 'echo unsafe'],
    health_url: 'http://127.0.0.1:${PORT}/healthz',
    base_url: 'http://127.0.0.1:${PORT}',
    ready_timeout_ms: 250,
  });
  const absoluteUrl = await replayRunner.runReplay(root, contract, {
    ...replay,
    request: { method: 'GET', path: 'http://127.0.0.1:1/admin/users', headers: {} },
  }, {
    command: '${NODE}',
    args: ['no-health.js'],
    health_url: 'http://127.0.0.1:${PORT}/healthz',
    base_url: 'http://127.0.0.1:${PORT}',
    ready_timeout_ms: 250,
  });

  assert.equal(noHealth.status, 'unknown');
  assert.equal(shellCommand.status, 'unknown');
  assert.equal(absoluteUrl.status, 'unknown');
  assert.equal(JSON.stringify(noHealth.evidence).includes('secret-body'), false);
});

test('cdsc replay caps observed response bodies while preserving status evidence', async () => {
  const root = tmpProject();
  fs.writeFileSync(path.join(root, 'large-body.js'), [
    "'use strict';",
    "const http = require('node:http');",
    "const server = http.createServer((req, res) => {",
    "  if (req.url === '/healthz') { res.writeHead(200); res.end('ok'); return; }",
    "  if (req.url === '/admin/users') { res.writeHead(200); res.end('x'.repeat(512 * 1024)); return; }",
    "  res.writeHead(404); res.end('missing');",
    "});",
    "server.listen(Number(process.env.PORT), '127.0.0.1');",
    '',
  ].join('\n'));
  const contract = {
    version: '0.1',
    id: 'large-body',
    subject: { type: 'http-route', method: 'GET', path: '/admin/users' },
    expect: { status: [401, 403] },
  };
  const replay = {
    version: '0.1',
    type: 'http',
    request: { method: 'GET', path: '/admin/users', headers: {} },
    expect: { status: [401, 403] },
  };

  const result = await replayRunner.runReplay(root, contract, replay, {
    command: '${NODE}',
    args: ['large-body.js'],
    health_url: 'http://127.0.0.1:${PORT}/healthz',
    base_url: 'http://127.0.0.1:${PORT}',
    ready_timeout_ms: 1000,
    response_body_limit_bytes: 4096,
  });
  const observed = result.evidence.find((item) => item.type === 'observed').value;

  assert.equal(result.status, 'fail');
  assert.equal(observed.status, 200);
  assert.equal(observed.body_bytes, 4096);
  assert.equal(observed.body_truncated, true);
});

test('cdsc replay caps manifest and replay supplied runtime limits', () => {
  const runtime = replayRunner.resolveRuntime({
    command: '${NODE}',
    args: ['vulnerable-server.js'],
    health_url: 'http://127.0.0.1:${PORT}/healthz',
    base_url: 'http://127.0.0.1:${PORT}',
    ready_timeout_ms: 999999,
    request_timeout_ms: 999999,
    response_body_limit_bytes: 999999999,
  }, 49152, FIXTURE_ROOT);

  assert.equal(runtime.ready_timeout_ms, 30000);
  assert.equal(runtime.request_timeout_ms, 10000);
  assert.equal(runtime.response_body_limit_bytes, 64 * 1024);
});

test('cdsc runtime manifest rejects legacy start_command shape', () => {
  assert.throws(
    () => replayRunner.runtimeForMode({
      start_command: 'node server.js',
      health_url: 'http://127.0.0.1:${PORT}/healthz',
      base_url: 'http://127.0.0.1:${PORT}',
    }),
    /baseline\/fixed/,
  );
});

test('cdsc proof requires baseline fail plus fixed pass and writes proof manifest', async () => {
  const root = tmpProject();
  writeProofInputs(root);

  const result = await proof.run(root, {
    contract: 'security/oracles/demo/contract.json',
    runtime: 'yieldos.oracle-runtime.json',
  });
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'security/oracles/demo/proof-manifest.json'), 'utf8'));

  assert.equal(result.status, 'pass');
  assert.equal(manifest.proof_status, 'pass');
  assert.equal(manifest.runtime_hash.startsWith('sha256:'), true);
  assert.equal(manifest.baseline.status, 'fail');
  assert.equal(manifest.fixed.status, 'pass');
  assert.equal(fs.existsSync(path.join(root, 'security/oracles/demo/baseline-result.json')), true);
  assert.equal(fs.existsSync(path.join(root, 'security/oracles/demo/fixed-result.json')), true);
});

test('cdsc proof requires grounded source metadata but tolerates fixed source drift', async () => {
  const missingSourceRoot = tmpProject();
  writeProofInputs(missingSourceRoot, { source: null });
  const missingSource = await proof.run(missingSourceRoot, {
    contract: 'security/oracles/demo/contract.json',
    runtime: 'yieldos.oracle-runtime.json',
  });

  const fixedRoot = tmpProject();
  writeProofInputs(fixedRoot);
  fs.writeFileSync(
    path.join(fixedRoot, 'fixture', 'server-source.js'),
    "app.get('/admin/users', requireAuth, (req, res) => res.json(users));\n",
  );
  const fixedSource = await proof.run(fixedRoot, {
    contract: 'security/oracles/demo/contract.json',
    runtime: 'yieldos.oracle-runtime.json',
  });

  assert.equal(missingSource.status, 'unknown');
  assert.equal(missingSource.blocking_reason, 'cdsc-proof-runtime-error');
  assert.equal(JSON.stringify(missingSource.evidence).includes('missing source'), true);
  assert.equal(fixedSource.status, 'pass');
});

test('cdsc proof rejects source metadata that does not match the replay subject', async () => {
  const root = tmpProject();
  const source = groundedSource(root);
  writeProofInputs(root, {
    source: {
      ...source,
      line: "app.get('/billing', (req, res) => res.json(users));",
    },
  });

  const result = await proof.run(root, {
    contract: 'security/oracles/demo/contract.json',
    runtime: 'yieldos.oracle-runtime.json',
  });

  assert.equal(result.status, 'unknown');
  assert.equal(JSON.stringify(result.evidence).includes('source line route does not match'), true);
});

test('code-audit attaches missing-auth CDSC artifacts only for blocking commit findings', () => {
  const root = tmpRepo();
  fs.writeFileSync(path.join(root, 'server.js'), "const users = [];\napp.get('/admin/users', (req, res) => res.json(users));\n");
  sh(root, ['add', 'server.js']);

  const audit = codeAudit.auditGitCommand(root, 'git commit -m add-admin-route');
  const artifactPaths = audit.oracleArtifacts.map((artifact) => artifact.path);

  assert.equal(audit.action, 'block');
  assert.equal(audit.findings.some((finding) => finding.ruleId === 'missing-authz'), true);
  assert.equal(artifactPaths.some((item) => item.endsWith('/contract.json')), true);
  assert.equal(artifactPaths.some((item) => item.endsWith('/replay.json')), true);
  assert.equal(fs.existsSync(path.join(root, artifactPaths.find((item) => item.endsWith('/contract.json')))), true);
});

test('yieldos-oracle run cdsc-proof executes through command adapter', async () => {
  const root = tmpProject();
  writeProofInputs(root);

  const result = await oracleCommand.runOracleCommand(root, [
    'run',
    'cdsc-proof',
    '--contract',
    'security/oracles/demo/contract.json',
    '--runtime',
    'yieldos.oracle-runtime.json',
    '--allow-runtime',
  ]);

  assert.equal(result.exitCode, 0, result.message);
  assert.equal(result.message.includes('cdsc-proof: pass'), true);
});

test('yieldos-oracle runtime oracles require explicit approval', async () => {
  const root = tmpProject();
  const result = await oracleCommand.runOracleCommand(root, [
    'run',
    'cdsc-proof',
    '--contract',
    'security/oracles/demo/contract.json',
    '--runtime',
    'yieldos.oracle-runtime.json',
  ]);

  assert.equal(result.exitCode, 2);
  assert.equal(result.result.status, 'unknown');
  assert.equal(result.result.blocking_reason, 'runtime-oracle-requires-explicit-approval');
});

test('oracle demo render preserves structured unknown when proof manifest is absent', () => {
  const root = tmpProject();
  fs.mkdirSync(path.join(root, 'security/oracles/missing-auth-demo'), { recursive: true });

  const message = demoCommand.renderDemo(root, {
    status: 'unknown',
    summary: 'CDSC proof could not run.',
    blocking_reason: 'cdsc-proof-runtime-error',
  });

  assert.equal(message.includes('UNKNOWN proof incomplete'), true);
  assert.equal(message.includes('cdsc-proof-runtime-error'), true);
});
