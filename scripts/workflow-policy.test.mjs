import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

function workflow(name) {
  return fs.readFileSync(new URL(`../.github/workflows/${name}`, import.meta.url), 'utf8');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function jobBlock(source, jobName) {
  const match = source.match(new RegExp(`\\n  ${escapeRegExp(jobName)}:\\n([\\s\\S]*?)(?=\\n  [A-Za-z0-9_-]+:\\n|\\n\\S|$)`));
  assert.ok(match, `expected ${jobName} job to exist`);
  return match[1];
}

function namedStepBlock(source, stepName) {
  const match = source.match(new RegExp(`\\n      - name: ${escapeRegExp(stepName)}\\n([\\s\\S]*?)(?=\\n      - name: |\\n      - uses: |\\n  [A-Za-z0-9_-]+:\\n|$)`));
  assert.ok(match, `expected ${stepName} step to exist`);
  return match[1];
}

test('pull request yieldOS test matrix stays lean', () => {
  const source = workflow('yieldos-tests.yml');
  const job = jobBlock(source, 'unit-tests-pr');
  const combos = Array.from(job.matchAll(/-\s+os:\s+([^\s]+)\s*\n\s+node:\s+['"]?(\d+)['"]?/g))
    .map((match) => `${match[1]}/node${match[2]}`);

  assert.match(job, /if:\s*\$\{\{\s*github\.event_name == 'pull_request'\s*\}\}/);
  assert.deepEqual(combos, ['ubuntu-latest/node22', 'windows-latest/node22']);
});

test('full yieldOS compatibility matrix runs outside pull requests', () => {
  const source = workflow('yieldos-full-matrix.yml');
  const job = jobBlock(source, 'unit-tests-full');

  assert.doesNotMatch(source, /pull_request:/);
  assert.match(source, /push:/);
  assert.match(source, /workflow_dispatch:/);
  assert.match(source, /schedule:/);
  assert.match(job, /os:\s+\[ubuntu-latest,\s+macos-latest,\s+windows-latest\]/);
  assert.match(job, /node:\s+\['18',\s+'20',\s+'22'\]/);
});

test('plugin workflow avoids duplicated plugin tests and gates landing work', () => {
  const source = workflow('plugin.yml');
  const landingSteps = [
    'Install landing dependencies',
    'Run landing tests',
    'Lint landing',
    'Build landing',
  ];

  assert.doesNotMatch(source, /name:\s+Run plugin tests/);
  assert.match(source, /id:\s+changes/);
  assert.match(source, /github\.event\.before/);
  for (const stepName of landingSteps) {
    assert.match(namedStepBlock(source, stepName), /if:\s*\$\{\{\s*steps\.changes\.outputs\.landing == 'true'\s*\}\}/);
  }
});
