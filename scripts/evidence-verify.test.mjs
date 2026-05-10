import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { classifyEvidenceFile } from './evidence-verify.mjs';

test('classifyEvidenceFile rejects local-review files for public proof', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yieldos-evidence-'));
  const file = join(dir, 'report-local-review-2026-05-10.json');
  await writeFile(file, JSON.stringify({ measurement_type: 'measured', checkout_dirty: false }));

  const result = await classifyEvidenceFile(file);

  assert.equal(result.public_proof, false);
  assert.equal(result.reason, 'local-review evidence is internal only');
});

test('classifyEvidenceFile rejects dirty checkout evidence', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yieldos-evidence-'));
  const file = join(dir, 'report-clean.json');
  await writeFile(file, JSON.stringify({
    measurement_type: 'measured',
    checkout_dirty: true,
    source_commit: '0123456789abcdef0123456789abcdef01234567',
  }));

  const result = await classifyEvidenceFile(file);

  assert.equal(result.public_proof, false);
  assert.equal(result.reason, 'dirty checkout evidence is internal only');
});

test('classifyEvidenceFile rejects assumption-based evidence for public proof', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yieldos-evidence-'));
  const file = join(dir, 'cost-report.json');
  await writeFile(file, JSON.stringify({
    measurement_type: 'assumption-based',
    checkout_dirty: false,
    source_commit: '0123456789abcdef0123456789abcdef01234567',
  }));

  const result = await classifyEvidenceFile(file);

  assert.equal(result.public_proof, false);
  assert.equal(result.reason, 'evidence is not measured');
});

test('classifyEvidenceFile rejects measured evidence without a deterministic command', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yieldos-evidence-'));
  const file = join(dir, 'report-clean.json');
  await writeFile(file, JSON.stringify({
    measurement_type: 'measured',
    checkout_dirty: false,
    raw_logs_included: false,
    local_paths_included: false,
    source_commit: '0123456789abcdef0123456789abcdef01234567',
  }));

  const result = await classifyEvidenceFile(file);

  assert.equal(result.public_proof, false);
  assert.equal(result.reason, 'missing deterministic command');
});

test('classifyEvidenceFile rejects raw logs and local path evidence', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yieldos-evidence-'));
  const file = join(dir, 'report-clean.json');
  await writeFile(file, JSON.stringify({
    measurement_type: 'measured',
    checkout_dirty: false,
    raw_logs_included: true,
    local_paths_included: false,
    deterministic_command: 'node scripts/example.mjs --out benchmarks/report.json',
    source_commit: '0123456789abcdef0123456789abcdef01234567',
    evidence: '/Users/example/project/raw.log',
  }));

  const result = await classifyEvidenceFile(file);

  assert.equal(result.public_proof, false);
  assert.equal(result.reason, 'raw logs included');
});

test('classifyEvidenceFile rejects raw log payload fields even when flags are false', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yieldos-evidence-'));
  const file = join(dir, 'report-clean.json');
  await writeFile(file, JSON.stringify({
    measurement_type: 'measured',
    checkout_dirty: false,
    raw_logs_included: false,
    local_paths_included: false,
    deterministic_command: 'node scripts/example.mjs --out benchmarks/report.json',
    source_commit: '0123456789abcdef0123456789abcdef01234567',
    result: { raw_stderr: 'full raw stderr transcript' },
  }));

  const result = await classifyEvidenceFile(file);

  assert.equal(result.public_proof, false);
  assert.equal(result.reason, 'raw logs included');
});

test('classifyEvidenceFile rejects local temporary paths even when flags are false', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yieldos-evidence-'));
  const file = join(dir, 'report-clean.json');
  await writeFile(file, JSON.stringify({
    measurement_type: 'measured',
    checkout_dirty: false,
    raw_logs_included: false,
    local_paths_included: false,
    deterministic_command: 'node scripts/example.mjs --out benchmarks/report.json',
    source_commit: '0123456789abcdef0123456789abcdef01234567',
    artifact: '/var/folders/example/yieldos.log',
  }));

  const result = await classifyEvidenceFile(file);

  assert.equal(result.public_proof, false);
  assert.equal(result.reason, 'local absolute paths included');
});

test('classifyEvidenceFile rejects unpinned repository evidence', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yieldos-evidence-'));
  const file = join(dir, 'report-clean.json');
  await writeFile(file, JSON.stringify({
    measurement_type: 'measured',
    checkout_dirty: false,
    raw_logs_included: false,
    local_paths_included: false,
    deterministic_command: 'node scripts/example.mjs --repo-spec benchmarks/public-repos.json',
    source_commit: '0123456789abcdef0123456789abcdef01234567',
    repositories: [{ id: 'example', source: { git_url: 'https://example.com/repo.git' } }],
  }));

  const result = await classifyEvidenceFile(file);

  assert.equal(result.public_proof, false);
  assert.equal(result.reason, 'repository evidence is not pinned');
});

test('classifyEvidenceFile accepts clean measured evidence', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yieldos-evidence-'));
  const file = join(dir, 'report-clean.json');
  await writeFile(file, JSON.stringify({
    measurement_type: 'measured',
    checkout_dirty: false,
    raw_logs_included: false,
    local_paths_included: false,
    deterministic_command: 'node scripts/example.mjs --out benchmarks/report.json',
    source_commit: '0123456789abcdef0123456789abcdef01234567',
    repositories: [{
      id: 'express',
      source: {
        git_url: 'https://github.com/expressjs/express.git',
        commit: 'abcdefabcdefabcdefabcdefabcdefabcdefabcd',
      },
    }],
  }));

  const result = await classifyEvidenceFile(file);

  assert.equal(result.public_proof, true);
  assert.equal(result.reason, 'measured clean evidence');
});
