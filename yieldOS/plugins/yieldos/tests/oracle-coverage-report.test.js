'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const COVERAGE_SCRIPT = path.resolve(__dirname, '..', '..', '..', '..', 'scripts', 'oracle-coverage-report.mjs');

test('oracle coverage report labels benchmarked, active, and template-only cases', async () => {
  const { buildCoverageReport, coverageStatus } = await import(COVERAGE_SCRIPT);
  const report = buildCoverageReport();
  const byId = new Map(report.templates.map((item) => [item.id, item]));

  assert.equal(report.version, 1);
  assert.equal(report.summary.total_templates, report.templates.length);
  assert.equal(report.runnable_oracles.some((oracle) => oracle.id === 'code-audit-state'), true);
  assert.equal(byId.get('hardcoded-secret').status, 'benchmarked');
  assert.equal(byId.get('sensitive-logging').status, 'benchmarked');
  assert.equal(byId.get('dangerous-instruction-edit').status, 'benchmarked');
  assert.equal(byId.get('prompt-injection').status, 'active-adapter');
  assert.equal(byId.get('idor-bola').status, 'template-only');
  assert.equal(byId.get('persistent-memory-prompt-injection').status, 'template-only');
  assert.equal(coverageStatus('missing-authz'), 'benchmarked');
  assert.equal(report.limits.some((item) => item.includes('template-only')), true);
});

test('oracle coverage report parser accepts output path', async () => {
  const { parseArgs } = await import(COVERAGE_SCRIPT);
  const parsed = parseArgs(['--out', '/tmp/oracle-coverage.json']);

  assert.equal(parsed.outFile, '/tmp/oracle-coverage.json');
});
