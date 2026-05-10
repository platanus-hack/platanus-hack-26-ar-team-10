#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_HOOK = path.join(REPO_ROOT, 'yieldOS', 'plugins', 'yieldos', 'scripts', 'pre-install-gate.js');

function parseArgs(argv) {
  const args = { runs: 20, hook: DEFAULT_HOOK, outFile: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--runs') args.runs = Number(argv[++i]);
    else if (arg === '--hook') args.hook = path.resolve(argv[++i]);
    else if (arg === '--out') args.outFile = path.resolve(argv[++i]);
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!Number.isInteger(args.runs) || args.runs < 1 || args.runs > 500) {
    throw new Error('--runs must be an integer between 1 and 500');
  }
  return args;
}

function usage() {
  return [
    'Usage: node scripts/hook-latency-benchmark.mjs [--runs 20] [--out tmp/hook-latency.json]',
    '',
    'Measures real pre-install hook latency for:',
    '- non-install Bash',
    '- normal Read',
    '- blocked .env Read',
    '- allowlisted npm install',
    '- denylisted npm install',
  ].join('\n');
}

function makeFixtureRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yieldos-hook-latency-'));
  fs.writeFileSync(path.join(root, 'README.md'), '# hook latency fixture\n');
  fs.writeFileSync(path.join(root, '.env'), 'SECRET_TOKEN=test-value\n');
  return root;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1);
  return sorted[index];
}

function summarize(samples) {
  const sorted = samples.map((item) => item.ms).sort((a, b) => a - b);
  return {
    runs: samples.length,
    min_ms: round(sorted[0]),
    median_ms: round(percentile(sorted, 0.5)),
    p95_ms: round(percentile(sorted, 0.95)),
    max_ms: round(sorted[sorted.length - 1]),
    exit_codes: Array.from(new Set(samples.map((item) => item.exitCode))).sort((a, b) => a - b),
  };
}

function round(value) {
  return Math.round(value * 10) / 10;
}

function runHook(hook, input) {
  const started = process.hrtime.bigint();
  const result = spawnSync(process.execPath, [hook], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    timeout: 10000,
  });
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  return {
    ms,
    exitCode: result.status,
    timedOut: result.error?.code === 'ETIMEDOUT',
  };
}

function buildCases(root) {
  return [
    {
      id: 'bash-non-install',
      label: 'Bash: ls -la',
      input: { tool_name: 'Bash', tool_input: { command: 'ls -la' }, cwd: root },
    },
    {
      id: 'read-normal',
      label: 'Read: README.md',
      input: { tool_name: 'Read', tool_input: { file_path: path.join(root, 'README.md') }, cwd: root },
    },
    {
      id: 'read-env-blocked',
      label: 'Read: .env blocked',
      input: { tool_name: 'Read', tool_input: { file_path: path.join(root, '.env') }, cwd: root },
    },
    {
      id: 'npm-allowlist',
      label: 'Bash: npm install react@18.3.1',
      input: { tool_name: 'Bash', tool_input: { command: 'npm install react@18.3.1' }, cwd: root },
    },
    {
      id: 'npm-denylist',
      label: 'Bash: npm install event-stream@3.3.6',
      input: { tool_name: 'Bash', tool_input: { command: 'npm install event-stream@3.3.6' }, cwd: root },
    },
  ];
}

export async function runBenchmark(options = {}) {
  const hook = options.hook || DEFAULT_HOOK;
  const runs = options.runs || 20;
  const root = makeFixtureRoot();
  const cases = buildCases(root);
  const results = [];

  for (const item of cases) {
    runHook(hook, item.input);
    const samples = [];
    for (let i = 0; i < runs; i += 1) {
      samples.push(runHook(hook, item.input));
    }
    results.push({
      id: item.id,
      label: item.label,
      ...summarize(samples),
    });
  }

  return {
    benchmark: 'yieldos-hook-latency',
    runs_per_case: runs,
    hook,
    generated_at: new Date().toISOString(),
    results,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const report = await runBenchmark(args);
  if (args.outFile) {
    fs.mkdirSync(path.dirname(args.outFile), { recursive: true });
    fs.writeFileSync(args.outFile, `${JSON.stringify(report, null, 2)}\n`);
  }

  for (const result of report.results) {
    console.log(`${result.id}: median=${result.median_ms}ms p95=${result.p95_ms}ms exits=${result.exit_codes.join(',')}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`hook-latency-benchmark: ${err.message}`);
    process.exit(1);
  });
}
