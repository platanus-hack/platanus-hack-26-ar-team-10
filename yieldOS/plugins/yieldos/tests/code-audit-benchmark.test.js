'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const BENCHMARK_SCRIPT = pathToFileURL(path.resolve(__dirname, '..', '..', '..', '..', 'scripts', 'code-audit-benchmark.mjs')).href;

test('code-audit benchmark exercises blocked, fixed, and allowed outcomes', async () => {
  const { CODE_AUDIT_CASES, runBenchmark } = await import(BENCHMARK_SCRIPT);
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yieldos-code-audit-benchmark-test-'));
  const outFile = path.join(tempRoot, 'report.json');

  const report = await runBenchmark({ outFile, tempRoot });
  const written = JSON.parse(fs.readFileSync(outFile, 'utf8'));

  assert.equal(written.version, 1);
  assert.equal(written.benchmark.raw_logs_included, false);
  assert.equal(report.cases.length, CODE_AUDIT_CASES.length);
  assert.equal(report.aggregate.failed_cases, 0);
  assert.equal(report.aggregate.expected_outcome_rate, 1);
  assert.equal(report.aggregate.expected.blocked >= 9, true);
  assert.equal(report.aggregate.expected.fixed >= 2, true);
  assert.equal(report.aggregate.expected.allowed >= 4, true);
  assert.deepEqual(report.aggregate.expected, report.aggregate.observed);

  for (const item of report.cases) {
    assert.equal(item.control.committed, true, item.id);
    assert.equal(item.passed, true, item.id);
    assert.equal(item.yieldos.raw_logs, undefined);
    assert.equal(item.control.raw_logs, undefined);
    assert.equal(typeof item.yieldos.output.stderr_bytes, 'number');
    assert.equal(item.yieldos.output.stderr_sha256, undefined);
    assert.equal(item.yieldos.output.stdout_sha256, undefined);
    assert.equal(item.yieldos.verification.outcome_verified, true, item.id);
    if (item.expected === 'fixed') {
      assert.equal(item.yieldos.verification.file_changed, true, item.id);
      assert.equal(item.yieldos.verification.patch_recorded, true, item.id);
      assert.equal(item.yieldos.verification.unsafe_pattern_removed, true, item.id);
      assert.equal(item.yieldos.patch.fixed, true, item.id);
      assert.equal(item.yieldos.patch.applied_findings.includes(item.id), true, item.id);
    }
    for (const finding of item.yieldos.findings) {
      assert.equal(path.isAbsolute(finding.file), false);
    }
  }
});

test('code-audit benchmark parser supports sanitized and debug modes', async () => {
  const { parseArgs } = await import(BENCHMARK_SCRIPT);
  const parsed = parseArgs(['--out', '/tmp/report.json', '--tmp', '/tmp/run-root', '--include-raw-logs']);

  assert.equal(parsed.outFile, '/tmp/report.json');
  assert.equal(parsed.tempRoot, '/tmp/run-root');
  assert.equal(parsed.includeRawLogs, true);
});
