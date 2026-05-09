'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const bench = require('../scripts/oracles/bench');

function tmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'yieldos-oracle-bench-'));
}

test('oracle bench runs real replay demos and writes metric reports', async () => {
  const root = tmpProject();
  const metrics = await bench.runBench(root, { demoRuns: 2, writeReports: true });

  assert.equal(metrics.decisions_resolved_without_model_percent, 100);
  assert.equal(metrics.ci_model_calls, 0);
  assert.equal(metrics.replay_runs, 2);
  assert.equal(metrics.replay_pass_rate, 1);
  assert.equal(metrics.flake_rate, 0);
  assert.equal(metrics.p50_replay_runtime_ms > 0, true);
  [
    'oracle-metrics.json',
    'oracle-cost-baseline.json',
    'oracle-flake-report.json',
    'oracle-artifact-size-report.json',
  ].forEach((file) => {
    assert.equal(fs.existsSync(path.join(root, 'security', file)), true, `expected ${file}`);
  });
  const artifactSizes = JSON.parse(fs.readFileSync(path.join(root, 'security', 'oracle-artifact-size-report.json'), 'utf8'));
  const flakeReport = JSON.parse(fs.readFileSync(path.join(root, 'security', 'oracle-flake-report.json'), 'utf8'));
  assert.equal(artifactSizes.artifact_size_bytes.some((item) => item.path.includes('proof-manifest.json')), true);
  assert.equal(flakeReport.runs.some((run) => path.isAbsolute(run.project_root || '')), false);
  assert.equal(flakeReport.runs.every((run) => typeof run.run_id === 'string'), true);
});

test('oracle bench defaults to ten replay runs for flake measurement', async () => {
  const root = tmpProject();
  const metrics = await bench.runBench(root, { writeReports: false });

  assert.equal(metrics.replay_runs, 10);
  assert.equal(metrics.replay_pass_rate, 1);
  assert.equal(metrics.flake_rate, 0);
});

test('percentile helper is stable for small samples', () => {
  assert.equal(bench.percentile([30, 10, 20], 0.5), 20);
  assert.equal(bench.percentile([30, 10, 20], 0.95), 30);
});
