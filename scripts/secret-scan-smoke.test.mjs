import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findSecretSmokeFindings,
  isApprovedFixtureSecretMatch,
  isApprovedSecretFixturePath,
} from './secret-scan-smoke.mjs';

test('secret smoke scan flags obvious provider tokens', () => {
  const token = `${'sk-live_'}1234567890abcdefghijklmnop`;
  const findings = findSecretSmokeFindings([{
    path: 'src/config.js',
    text: `const apiKey = "${token}";\n`,
  }]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule_id, 'provider-token');
  assert.equal(findings[0].path, 'src/config.js');
});

test('secret smoke scan ignores approved fixture and benchmark paths', () => {
  assert.equal(isApprovedSecretFixturePath('yieldOS/plugins/yieldos/tests/code-audit.test.js'), true);
  assert.equal(isApprovedSecretFixturePath('scripts/code-audit-benchmark.mjs'), true);
  assert.equal(isApprovedFixtureSecretMatch('const token = "sk-test_1234567890abcdefghijklmnop"'), true);
  const findings = findSecretSmokeFindings([{
    path: 'yieldOS/plugins/yieldos/tests/code-audit.test.js',
    text: 'const token = "sk-test_1234567890abcdefghijklmnop";\n',
  }]);
  assert.deepEqual(findings, []);
});

test('secret smoke scan does not blanket-skip approved fixture paths', () => {
  const token = `${'sk-live_'}qwertyuiopasdfghjklzxcvbnm`;
  const findings = findSecretSmokeFindings([{
    path: 'benchmarks/report.json',
    text: `OPENAI_API_KEY="${token}"\n`,
  }]);
  assert.equal(findings.some((finding) => finding.rule_id === 'provider-token'), true);
});

test('secret smoke scan does not treat fixture variable names as fake values', () => {
  const token = `${'sk-live_'}qwertyuiopasdfghjklzxcvbnm`;
  const findings = findSecretSmokeFindings([{
    path: 'benchmarks/report.json',
    text: `SECRET_TOKEN="${token}"\n`,
  }]);
  assert.equal(findings.some((finding) => finding.rule_id === 'provider-token'), true);
});

test('secret smoke scan flags long secret-like assignments outside fixtures', () => {
  const value = `${'abcdef1234567890'}abcdef1234567890`;
  const findings = findSecretSmokeFindings([{
    path: 'server/env.js',
    text: `DATABASE_SECRET="${value}"\n`,
  }]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule_id, 'secret-assignment');
});

test('secret smoke scan ignores non-secret token metrics', () => {
  const findings = findSecretSmokeFindings([{
    path: 'yieldOS/plugins/yieldos/scripts/oracles/bench.js',
    text: 'agent_tokens_per_audit: metrics.agent_tokens_per_audit,\n',
  }]);
  assert.deepEqual(findings, []);
});
