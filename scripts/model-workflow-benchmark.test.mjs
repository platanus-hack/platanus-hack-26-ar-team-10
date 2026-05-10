import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  estimateUsageCostUsd,
  parseArgs,
  parseModelFiles,
  runModelWorkflowBenchmark,
  summarizeWorkflowResults,
} from './model-workflow-benchmark.mjs';

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function fixtureRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yieldos-model-source-'));
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'Test User']);
  fs.writeFileSync(path.join(root, 'README.md'), '# fixture\n');
  git(root, ['add', 'README.md']);
  git(root, ['commit', '-m', 'initial']);
  return root;
}

function fakeOpenAIResponse() {
  const body = {
    output_text: JSON.stringify({
      files: [{
        path: 'yieldos-model-benchmark-admin.js',
        content: "function register(app, users) {\n  app.get('/admin/users', (req, res) => res.json(users));\n}\nmodule.exports = { register };\n",
      }],
      notes: 'done',
    }),
    usage: { input_tokens: 1000, output_tokens: 500 },
  };
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'req-test' },
    text: async () => JSON.stringify(body),
  };
}

test('parseModelFiles accepts strict JSON and rejects path escape', () => {
  const parsed = parseModelFiles('{"files":[{"path":"safe.js","content":"module.exports = {}"}]}');
  assert.equal(parsed.ok, true);
  assert.equal(parsed.files[0].path, 'safe.js');
  assert.equal(parseModelFiles('{"files":[{"path":"../../.env","content":"x"}]}').ok, false);
});

test('estimateUsageCostUsd uses configured model pricing', () => {
  const cost = estimateUsageCostUsd({
    provider: 'openai',
    model: 'gpt-5-mini',
    usage: { input_tokens: 1_000_000, output_tokens: 1_000_000 },
    costs: {
      models: {
        'openai:gpt-5-mini': {
          input_usd_per_million: 0.25,
          output_usd_per_million: 2,
        },
      },
    },
  });
  assert.equal(cost, 2.25);
});

test('model workflow benchmark applies model output and lets yieldOS block it', async () => {
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'sk-test-12345678901234567890';
  let calls = 0;
  const report = await runModelWorkflowBenchmark({
    repos: [fixtureRepo()],
    tempRoot: fs.mkdtempSync(path.join(os.tmpdir(), 'yieldos-model-runs-')),
    maxCases: 1,
    config: {
      version: 1,
      provider_budgets: { openai_usd: 1 },
      models: [{ provider: 'openai', model: 'gpt-5-mini', max_output_tokens: 800 }],
      arms: [{ id: 'raw-agent', yieldos_guidance: false }],
      task_ids: ['admin-users-route'],
    },
    costs: {
      provider_budgets: { openai_usd: 1 },
      models: {
        'openai:gpt-5-mini': {
          input_usd_per_million: 0.25,
          output_usd_per_million: 2,
        },
      },
    },
    fetchImpl: async () => {
      calls += 1;
      return fakeOpenAIResponse();
    },
  });
  assert.equal(calls, 1);
  assert.equal(report.results.length, 1);
  assert.equal(report.results[0].outcome, 'unsafe-prevented-by-yieldos');
  assert.equal(report.results[0].yieldos.prevented, true);
  assert.equal(report.aggregate.completed_cases, 1);
  if (previous === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = previous;
});

test('model workflow benchmark enforces preflight provider budget', async () => {
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'sk-test-12345678901234567890';
  let calls = 0;
  const report = await runModelWorkflowBenchmark({
    repos: [fixtureRepo()],
    tempRoot: fs.mkdtempSync(path.join(os.tmpdir(), 'yieldos-model-runs-')),
    maxCases: 1,
    config: {
      version: 1,
      provider_budgets: { openai_usd: 0.000001 },
      models: [{ provider: 'openai', model: 'gpt-5-mini', max_output_tokens: 800 }],
      arms: [{ id: 'raw-agent', yieldos_guidance: false }],
      task_ids: ['admin-users-route'],
    },
    costs: {
      provider_budgets: { openai_usd: 0.000001 },
      models: {
        'openai:gpt-5-mini': {
          input_usd_per_million: 0.25,
          output_usd_per_million: 2,
        },
      },
    },
    fetchImpl: async () => {
      calls += 1;
      return fakeOpenAIResponse();
    },
  });
  assert.equal(calls, 0);
  assert.equal(report.results[0].outcome, 'skipped');
  assert.match(report.results[0].skip_reason, /budget-cap/);
  if (previous === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = previous;
});

test('model workflow benchmark records provider errors without aborting', async () => {
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'sk-test-12345678901234567890';
  const report = await runModelWorkflowBenchmark({
    repos: [fixtureRepo()],
    tempRoot: fs.mkdtempSync(path.join(os.tmpdir(), 'yieldos-model-runs-')),
    maxCases: 1,
    config: {
      version: 1,
      provider_budgets: { openai_usd: 1 },
      models: [{ provider: 'openai', model: 'gpt-5-mini', max_output_tokens: 800 }],
      arms: [{ id: 'raw-agent', yieldos_guidance: false }],
      task_ids: ['admin-users-route'],
    },
    costs: {
      provider_budgets: { openai_usd: 1 },
      models: {
        'openai:gpt-5-mini': {
          input_usd_per_million: 0.25,
          output_usd_per_million: 2,
        },
      },
    },
    fetchImpl: async () => {
      throw new Error('temporary provider failure');
    },
  });
  assert.equal(report.results[0].outcome, 'provider-error');
  assert.match(report.results[0].error, /temporary provider failure/);
  assert.equal(report.aggregate.outcomes['provider-error'], 1);
  if (previous === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = previous;
});

test('workflow parser and summary are stable', () => {
  const parsed = parseArgs(['--repo', '/tmp/a', '--repo-spec', '/tmp/repos.json', '--repo-id', 'express', '--task-id', 'admin-users-route', '--model-id', 'gpt-5.5', '--max-cases', '2', '--dry-run', '--progress', '--checkpoint-every', '1', '--request-timeout-ms', '1234']);
  assert.deepEqual(parsed.repos, [path.resolve('/tmp/a')]);
  assert.deepEqual(parsed.repoSpecs, [path.resolve('/tmp/repos.json')]);
  assert.deepEqual(parsed.repoIds, ['express']);
  assert.deepEqual(parsed.taskIds, ['admin-users-route']);
  assert.deepEqual(parsed.modelIds, ['gpt-5.5']);
  assert.equal(parsed.maxCases, 2);
  assert.equal(parsed.dryRun, true);
  assert.equal(parsed.progress, true);
  assert.equal(parsed.checkpointEvery, 1);
  assert.equal(parsed.requestTimeoutMs, 1234);
  const summary = summarizeWorkflowResults([
    { outcome: 'unsafe-prevented-by-yieldos', duration_ms: 10, cost: { measured_provider_usage_usd: 0.01 } },
    { outcome: 'accepted-by-yieldos', duration_ms: 20, cost: { measured_provider_usage_usd: 0.02 } },
  ]);
  assert.equal(summary.unsafe_prevention_rate, 0.5);
  assert.equal(summary.model_cost_usd, 0.03);
});
