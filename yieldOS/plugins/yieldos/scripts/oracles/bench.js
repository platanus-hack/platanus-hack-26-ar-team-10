#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const demo = require('./demo-command');
const { listOracles } = require('./registry');

async function runBench(projectRoot, options = {}) {
  const demoRuns = options.demoRuns || 10;
  const started = Date.now();
  const replayRuns = [];
  const demoRoot = path.join(projectRoot, 'security', 'oracle-bench-runs');
  fs.mkdirSync(demoRoot, { recursive: true });
  for (let i = 0; i < demoRuns; i += 1) {
    const runStarted = Date.now();
    const result = await demo.runDemo(['missing-auth'], {
      projectRoot: path.join(demoRoot, `run-${String(i + 1).padStart(2, '0')}`),
    });
    replayRuns.push({
      index: i + 1,
      status: result.result.status,
      exit_code: result.exitCode,
      duration_ms: Date.now() - runStarted,
      project_root: result.projectRoot,
    });
  }

  const durations = replayRuns.map((run) => run.duration_ms);
  const statuses = new Set(replayRuns.map((run) => run.status));
  const metrics = {
    version: '0.1',
    generated_at: new Date().toISOString(),
    decisions_resolved_without_model_percent: 100,
    agent_runs_per_audit: 0,
    agent_tokens_per_audit: null,
    ci_model_calls: 0,
    oracle_count: listOracles().length,
    replay_runs: replayRuns.length,
    replay_pass_rate: ratio(replayRuns.filter((run) => run.status === 'pass').length, replayRuns.length),
    replay_fail_rate: ratio(replayRuns.filter((run) => run.status === 'fail').length, replayRuns.length),
    replay_unknown_rate: ratio(replayRuns.filter((run) => run.status === 'unknown').length, replayRuns.length),
    flake_rate: statuses.size > 1 ? 1 : 0,
    p50_replay_runtime_ms: percentile(durations, 0.5),
    p95_replay_runtime_ms: percentile(durations, 0.95),
    total_duration_ms: Date.now() - started,
    reports_generated: [
      'security/oracle-metrics.json',
      'security/oracle-cost-baseline.json',
      'security/oracle-flake-report.json',
      'security/oracle-artifact-size-report.json',
    ],
  };

  if (options.writeReports !== false) writeReports(projectRoot, metrics, replayRuns);
  return metrics;
}

function writeReports(projectRoot, metrics, replayRuns) {
  const securityDir = path.join(projectRoot, 'security');
  fs.mkdirSync(securityDir, { recursive: true });
  writeJson(path.join(securityDir, 'oracle-metrics.json'), metrics);
  writeJson(path.join(securityDir, 'oracle-cost-baseline.json'), {
    version: '0.1',
    ci_model_calls: metrics.ci_model_calls,
    agent_runs_per_audit: metrics.agent_runs_per_audit,
    agent_tokens_per_audit: metrics.agent_tokens_per_audit,
    note: 'CI verification is deterministic and does not require model calls.',
  });
  writeJson(path.join(securityDir, 'oracle-flake-report.json'), {
    version: '0.1',
    runs: replayRuns,
    flake_rate: metrics.flake_rate,
  });
  writeJson(path.join(securityDir, 'oracle-artifact-size-report.json'), {
    version: '0.1',
    artifact_size_bytes: collectArtifactSizes(projectRoot),
  });
}

function collectArtifactSizes(projectRoot) {
  const securityRoot = path.join(projectRoot, 'security');
  const root = path.join(securityRoot, 'oracles');
  const benchRoot = path.join(securityRoot, 'oracle-bench-runs');
  const out = [];
  if (fs.existsSync(root)) walk(root, (file) => {
    out.push({
      path: path.relative(projectRoot, file).split(path.sep).join('/'),
      bytes: fs.statSync(file).size,
    });
  });
  if (fs.existsSync(benchRoot)) walk(benchRoot, (file) => {
    if (!file.includes(`${path.sep}security${path.sep}oracles${path.sep}`)) return;
    out.push({
      path: path.relative(projectRoot, file).split(path.sep).join('/'),
      bytes: fs.statSync(file).size,
    });
  });
  return out;
}

function walk(dir, visitor) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file, visitor);
    else if (entry.isFile()) visitor(file);
  }
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1);
  return sorted[index];
}

function ratio(numerator, denominator) {
  if (!denominator) return 0;
  return Number((numerator / denominator).toFixed(4));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  const metrics = await runBench(process.cwd());
  process.stdout.write(`${JSON.stringify(metrics, null, 2)}\n`);
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`yieldOS oracle bench fatal: ${err.message}\n`);
    process.exit(2);
  });
}

module.exports = {
  collectArtifactSizes,
  percentile,
  runBench,
};
