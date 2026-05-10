import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs, runScannerComparison } from './scanner-comparison-benchmark.mjs';

test('scanner comparison records unavailable tools without failing', () => {
  const report = runScannerComparison({
    repoRoot: fs.mkdtempSync(path.join(os.tmpdir(), 'yieldos-scanner-empty-')),
    scanners: [{ id: 'missing-tool', command: 'definitely-not-installed-yieldos-test' }],
  });
  assert.equal(report.scanners[0].status, 'not_installed');
});

test('scanner comparison captures installed scanner exit code and output evidence', () => {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yieldos-fake-scanner-bin-'));
  const fake = path.join(binDir, 'fake-scanner');
  fs.writeFileSync(fake, '#!/bin/sh\necho version\nif [ "$1" = "--version" ]; then exit 0; fi\necho finding\nexit 1\n');
  fs.chmodSync(fake, 0o755);
  const report = runScannerComparison({
    repoRoot: fs.mkdtempSync(path.join(os.tmpdir(), 'yieldos-scanner-repo-')),
    env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
    scanners: [{ id: 'fake', command: 'fake-scanner', args: [] }],
  });
  assert.equal(report.scanners[0].status, 'ran');
  assert.equal(report.scanners[0].exit_code, 1);
  assert.equal(report.scanners[0].output.stdout_lines, 2);
});

test('scanner parser accepts output path', () => {
  const parsed = parseArgs(['--out', '/tmp/scanners.json']);
  assert.equal(parsed.outFile, path.resolve('/tmp/scanners.json'));
});
