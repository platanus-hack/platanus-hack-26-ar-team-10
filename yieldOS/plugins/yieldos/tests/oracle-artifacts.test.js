'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const artifacts = require('../scripts/oracles/artifacts');
const auditState = require('../scripts/code-audit/state');
const codeAudit = require('../scripts/code-audit');
const git = require('../scripts/code-audit/git');
const selfDefense = require('../scripts/self-defense');

function tmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'yieldos-oracle-artifacts-'));
}

function sh(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function tmpRepo() {
  const root = tmpProject();
  sh(root, ['init', '-b', 'main']);
  sh(root, ['config', 'user.email', 'test@example.com']);
  sh(root, ['config', 'user.name', 'Test User']);
  fs.writeFileSync(path.join(root, 'app.js'), 'module.exports = {};\n');
  sh(root, ['add', 'app.js']);
  sh(root, ['commit', '-m', 'initial']);
  return root;
}

test('writeArtifactSet writes redacted bounded artifacts with stable hashes', () => {
  const root = tmpProject();
  const out = artifacts.writeArtifactSet(root, {
    id: 'missing-auth-demo',
    manifest: { version: '0.1', token: 'sk-123456789012345678901234' },
    contract: { route: '/admin/users' },
    replay: { request: { method: 'GET', path: '/admin/users' } },
    baselineResult: { status: 'fail', stdout: 'a'.repeat(3000) },
    fixedResult: { status: 'pass' },
  });

  const manifest = fs.readFileSync(path.join(root, 'security/oracles/missing-auth-demo/manifest.json'), 'utf8');
  const baseline = fs.readFileSync(path.join(root, 'security/oracles/missing-auth-demo/baseline-result.json'), 'utf8');

  assert.equal(out.artifacts.length, 5);
  assert.equal(out.artifacts.every((item) => item.sha256.startsWith('sha256:')), true);
  assert.equal(manifest.includes('[REDACTED]'), true);
  assert.equal(baseline.includes('truncated by yieldOS oracle artifact cap'), true);
  assert.equal(JSON.parse(baseline).stdout.length <= 2048, true);
  assert.equal(artifacts.verifyArtifactReferences(root, out.artifacts).ok, true);
});

test('writeArtifactSet rejects traversal and symlink artifact directories', () => {
  const root = tmpProject();
  assert.throws(() => artifacts.writeArtifactSet(root, { id: '../escape', manifest: {} }), /artifact id/);

  if (process.platform !== 'win32') {
    const outside = tmpProject();
    fs.mkdirSync(path.join(root, 'security'), { recursive: true });
    fs.symlinkSync(outside, path.join(root, 'security', 'oracles'), 'dir');
    assert.throws(() => artifacts.writeArtifactSet(root, { id: 'safe-id', manifest: {} }), /realpath|symlink|inside/);
  }
});

test('code-audit diff ignores security/oracles artifacts for staged and push hashes', () => {
  const remote = tmpProject();
  sh(remote, ['init', '--bare']);
  const root = tmpRepo();
  sh(root, ['remote', 'add', 'origin', remote]);
  sh(root, ['push', '-u', 'origin', 'main']);

  fs.mkdirSync(path.join(root, 'security/oracles/demo'), { recursive: true });
  fs.writeFileSync(path.join(root, 'app.js'), 'const value = 1;\n');
  fs.writeFileSync(path.join(root, 'security/oracles/demo/manifest.json'), '{"ok":true}\n');
  sh(root, ['add', 'app.js', 'security/oracles/demo/manifest.json']);

  const staged = git.collectStagedDiff(root);
  assert.deepEqual(staged.files, ['app.js']);
  assert.equal(staged.diff.includes('security/oracles'), false);

  sh(root, ['commit', '-m', 'safe change with oracle evidence']);
  const pushed = git.collectPushDiff(root);
  assert.deepEqual(pushed.files, ['app.js']);
  assert.equal(pushed.diff.includes('security/oracles'), false);
});

test('audit state verifies referenced oracle artifacts and fails tampering', () => {
  const root = tmpRepo();
  fs.writeFileSync(path.join(root, 'app.js'), 'const value = 1;\n');
  sh(root, ['add', 'app.js']);
  const audit = codeAudit.auditGitCommand(root, 'git commit -m audit-test');
  const artifactSet = artifacts.writeArtifactSet(root, {
    id: 'state-proof',
    manifest: { version: '0.1' },
    contract: { route: '/admin/users' },
  });
  const state = auditState.buildAuditState({ ...audit, oracleArtifacts: artifactSet.artifacts });
  fs.mkdirSync(path.join(root, 'security'), { recursive: true });
  fs.writeFileSync(path.join(root, auditState.STATE_FILE), `${JSON.stringify(state, null, 2)}\n`);

  const ok = auditState.verifyAuditState(root, { mode: 'commit' });
  fs.writeFileSync(path.join(root, 'security/oracles/state-proof/contract.json'), '{"tampered":true}\n');
  const tampered = auditState.verifyAuditState(root, { mode: 'commit' });

  assert.equal(ok.ok, true);
  assert.equal(tampered.ok, false);
  assert.equal(tampered.reason, 'oracle-artifact-hash-mismatch');
});

test('artifact verification rejects working-tree symlink traversal', () => {
  if (process.platform === 'win32') return;
  const root = tmpRepo();
  const outside = tmpProject();
  const artifactSet = artifacts.writeArtifactSet(root, {
    id: 'symlink-proof',
    manifest: { version: '0.1' },
    contract: { route: '/admin/users' },
  });
  const contractRef = artifactSet.artifacts.find((artifact) => artifact.path.endsWith('/contract.json'));
  fs.writeFileSync(path.join(outside, 'contract.json'), fs.readFileSync(path.join(root, contractRef.path), 'utf8'));
  fs.unlinkSync(path.join(root, contractRef.path));
  fs.symlinkSync(path.join(outside, 'contract.json'), path.join(root, contractRef.path));

  const verification = artifacts.verifyArtifactReferences(root, artifactSet.artifacts);

  assert.equal(verification.ok, false);
  assert.equal(verification.failed.some((item) => item.reason === 'symlink-traversal'), true);
});

test('artifact verification rejects oversized working-tree artifacts before hashing', () => {
  const root = tmpRepo();
  fs.mkdirSync(path.join(root, 'security/oracles/huge-proof'), { recursive: true });
  fs.writeFileSync(path.join(root, 'security/oracles/huge-proof/manifest.json'), 'x'.repeat(256 * 1024));

  const verification = artifacts.verifyArtifactReferences(root, [{
    type: 'manifest',
    path: 'security/oracles/huge-proof/manifest.json',
    sha256: 'sha256:not-used',
    bytes: 256 * 1024,
  }]);

  assert.equal(verification.ok, false);
  assert.equal(verification.failed[0].reason, 'artifact-too-large');
});

test('artifact verification rejects oversized committed artifacts before reading object', () => {
  const remote = tmpProject();
  sh(remote, ['init', '--bare']);
  const root = tmpRepo();
  sh(root, ['remote', 'add', 'origin', remote]);
  sh(root, ['push', '-u', 'origin', 'main']);
  fs.mkdirSync(path.join(root, 'security/oracles/huge-proof'), { recursive: true });
  fs.writeFileSync(path.join(root, 'security/oracles/huge-proof/manifest.json'), 'x'.repeat(256 * 1024));
  sh(root, ['add', 'security/oracles/huge-proof/manifest.json']);
  sh(root, ['commit', '-m', 'add huge artifact']);

  const verification = artifacts.verifyArtifactReferences(root, [{
    type: 'manifest',
    path: 'security/oracles/huge-proof/manifest.json',
    sha256: 'sha256:not-used',
    bytes: 256 * 1024,
  }], { gitRef: 'HEAD' });

  assert.equal(verification.ok, false);
  assert.equal(verification.failed[0].reason, 'artifact-too-large');
});

test('artifact verification rejects committed symlink artifacts', () => {
  if (process.platform === 'win32') return;
  const root = tmpRepo();
  fs.mkdirSync(path.join(root, 'security/oracles/symlink-proof'), { recursive: true });
  fs.symlinkSync('target.json', path.join(root, 'security/oracles/symlink-proof/manifest.json'));
  sh(root, ['add', 'security/oracles/symlink-proof/manifest.json']);
  sh(root, ['commit', '-m', 'add symlink artifact']);

  const verification = artifacts.verifyArtifactReferences(root, [{
    type: 'manifest',
    path: 'security/oracles/symlink-proof/manifest.json',
    sha256: artifacts.sha256('target.json'),
    bytes: 'target.json'.length,
  }], { gitRef: 'HEAD' });

  assert.equal(verification.ok, false);
  assert.equal(verification.failed[0].reason, 'symlink-traversal');
});

test('push/pr audit state requires referenced oracle artifacts to be committed', () => {
  const remote = tmpProject();
  sh(remote, ['init', '--bare']);
  const root = tmpRepo();
  sh(root, ['remote', 'add', 'origin', remote]);
  sh(root, ['push', '-u', 'origin', 'main']);

  fs.writeFileSync(path.join(root, 'app.js'), 'const value = 1;\n');
  sh(root, ['add', 'app.js']);
  sh(root, ['commit', '-m', 'safe app change']);

  const audit = codeAudit.auditGitCommand(root, 'git push');
  const artifactSet = artifacts.writeArtifactSet(root, {
    id: 'push-proof',
    manifest: { version: '0.1' },
    contract: { route: '/admin/users' },
  });
  const state = auditState.buildAuditState({ ...audit, oracleArtifacts: artifactSet.artifacts });
  fs.mkdirSync(path.join(root, 'security'), { recursive: true });
  fs.writeFileSync(path.join(root, auditState.STATE_FILE), `${JSON.stringify(state, null, 2)}\n`);
  sh(root, ['add', auditState.STATE_FILE]);
  sh(root, ['commit', '-m', 'state without artifacts']);

  const missing = auditState.verifyAuditState(root, { mode: 'pr', baseRef: 'origin/main' });
  sh(root, ['add', 'security/oracles/push-proof/manifest.json', 'security/oracles/push-proof/contract.json']);
  sh(root, ['commit', '-m', 'add oracle artifacts']);
  const ok = auditState.verifyAuditState(root, { mode: 'pr', baseRef: 'origin/main' });

  assert.equal(missing.ok, false);
  assert.equal(missing.reason, 'oracle-artifact-not-committed');
  assert.equal(ok.ok, true);
});

test('writeAuditState stages oracle artifacts with audit state', () => {
  const root = tmpRepo();
  fs.writeFileSync(path.join(root, 'app.js'), 'const value = 1;\n');
  sh(root, ['add', 'app.js']);
  const audit = codeAudit.auditGitCommand(root, 'git commit -m audit-test');
  const artifactSet = artifacts.writeArtifactSet(root, {
    id: 'stage-proof',
    manifest: { version: '0.1' },
  });
  auditState.writeAuditState(root, { ...audit, oracleArtifacts: artifactSet.artifacts }, { stage: true });
  const staged = sh(root, ['diff', '--cached', '--name-only']);

  assert.equal(staged.includes('security/code-audit-state.json'), true);
  assert.equal(staged.includes('security/oracles/stage-proof/manifest.json'), true);
});

test('self-defense protects security/oracles artifacts', () => {
  assert.equal(selfDefense.isProtectedPath('/proj/security/oracles/demo/manifest.json'), true);
});
