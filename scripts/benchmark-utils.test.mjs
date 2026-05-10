import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  commandOutputEvidence,
  estimateHumanCostUsd,
  estimateModelCostUsd,
  loadDotEnv,
  ratio,
  safeReportPath,
  sanitizeSecretLike,
  summarizeCounts,
} from './benchmark-utils.mjs';

test('safeReportPath strips absolute paths and traversal', () => {
  assert.equal(safeReportPath('/Users/alice/repo/src/app.js'), 'app.js');
  assert.equal(safeReportPath('../secret/.env'), 'secret/.env');
  assert.equal(safeReportPath('src\\routes\\admin.js'), 'src/routes/admin.js');
});

test('commandOutputEvidence stores bounded counts without raw logs', () => {
  const evidence = commandOutputEvidence({ stdout: 'a\nb\n', stderr: 'err\n' });
  assert.deepEqual(evidence, {
    stdout_bytes: 4,
    stderr_bytes: 4,
    stdout_lines: 2,
    stderr_lines: 1,
  });
});

test('ratio and summarizeCounts are stable for empty and non-empty inputs', () => {
  assert.equal(ratio(0, 0), 0);
  assert.equal(ratio(98, 100), 0.98);
  assert.deepEqual(summarizeCounts(['pass', 'pass', 'unknown']), { pass: 2, unknown: 1 });
});

test('cost helpers use per-million token pricing and hourly human rates', () => {
  assert.equal(
    estimateModelCostUsd({
      input_tokens: 150000,
      output_tokens: 10000,
      input_usd_per_million: 3,
      output_usd_per_million: 15,
    }),
    0.6,
  );
  assert.equal(estimateHumanCostUsd(15, 120), 30);
});

test('loadDotEnv loads keys without exposing values', () => {
  const envFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'yieldos-env-')), '.env');
  fs.writeFileSync(envFile, 'OPENAI_API_KEY="sk-test-12345678901234567890"\nOTHER=value\n');
  const previous = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  const loaded = loadDotEnv(envFile);
  assert.deepEqual(loaded, ['OPENAI_API_KEY', 'OTHER']);
  assert.equal(process.env.OPENAI_API_KEY.startsWith('sk-test-'), true);
  if (previous === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = previous;
  delete process.env.OTHER;
});

test('sanitizeSecretLike redacts provider-looking secrets', () => {
  const redacted = sanitizeSecretLike('api_key = sk-test-123456789012345678901234');
  assert.equal(redacted.includes('sk-test-123456789012345678901234'), false);
  assert.equal(redacted.includes('[redacted'), true);
});
