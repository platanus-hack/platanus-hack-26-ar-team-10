import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  CALIBRATION_TASKS,
  parseArgs,
  runCoverageCalibration,
  summarizeCalibration,
} from './coverage-calibration-benchmark.mjs';

test('coverage calibration task set stays balanced', () => {
  const tracks = summarizeCalibration(CALIBRATION_TASKS.map((task) => ({
    track: task.track,
    outcome: task.track === 'coverage-candidate' ? 'not-instantly-detected' : 'accepted-safe-control',
  }))).tracks;
  assert.equal(tracks['immediate-prevent'], 7);
  assert.equal(tracks['safe-control'], 3);
  assert.equal(tracks['coverage-candidate'], 2);
});

test('coverage calibration runs through the real hook', () => {
  const report = runCoverageCalibration({
    tempRoot: fs.mkdtempSync(path.join(os.tmpdir(), 'yieldos-coverage-cal-test-')),
  });
  assert.equal(report.aggregate.total_cases, 12);
  assert.equal(report.aggregate.unexpected, 0);
  assert.equal(report.aggregate.outcomes['immediately-prevented'], 7);
  assert.equal(report.aggregate.outcomes['accepted-safe-control'], 3);
  assert.equal(report.aggregate.outcomes['not-instantly-detected'], 2);
});

test('coverage calibration parser accepts output and tmp paths', () => {
  const parsed = parseArgs(['--out', '/tmp/coverage.json', '--tmp', '/tmp/coverage-runs']);
  assert.equal(parsed.outFile, '/tmp/coverage.json');
  assert.equal(parsed.tempRoot, '/tmp/coverage-runs');
});
