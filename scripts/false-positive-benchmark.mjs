#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  commandOutputEvidence,
  ratio,
  runGit,
  safeReportPath,
  summarizeCounts,
  writeJson,
} from './benchmark-utils.mjs';
import { loadRepoSpecs } from './real-repo-benchmark.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOOK_PATH = path.join(REPO_ROOT, 'yieldOS', 'plugins', 'yieldos', 'scripts', 'pre-install-gate.js');

function parseArgs(argv = process.argv.slice(2)) {
  const parsed = {
    repoSpec: path.join(REPO_ROOT, 'benchmarks', 'public-repos.json'),
    outFile: null,
    tempRoot: null,
    sampleBenign: 0,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--repo-spec') parsed.repoSpec = path.resolve(requireValue(arg, argv[++i]));
    else if (arg === '--out') parsed.outFile = path.resolve(requireValue(arg, argv[++i]));
    else if (arg === '--tmp') parsed.tempRoot = path.resolve(requireValue(arg, argv[++i]));
    else if (arg === '--sample-benign') parsed.sampleBenign = parsePositiveInt(arg, argv[++i]);
    else if (arg === '--help' || arg === '-h') parsed.help = true;
    else throw new Error(`unknown option: ${arg}`);
  }
  return parsed;
}

function parsePositiveInt(flag, value) {
  const parsed = Number.parseInt(requireValue(flag, value), 10);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${flag} must be a positive integer`);
  return parsed;
}

function requireValue(flag, value) {
  if (!value || value.startsWith('--')) throw new Error(`${flag} needs a value`);
  return value;
}

async function runFalsePositiveBenchmark(options = {}) {
  const repoSpecs = options.repoSpecs || loadRepoSpecs(options.repoSpec || path.join(REPO_ROOT, 'benchmarks', 'public-repos.json'));
  const tempRoot = options.tempRoot || fs.mkdtempSync(path.join(os.tmpdir(), 'yieldos-false-positive-'));
  const report = {
    version: 1,
    generated_at: new Date().toISOString(),
    benchmark: {
      id: 'false-positive-public-commits',
      hook: path.relative(REPO_ROOT, HOOK_PATH),
      raw_logs_included: false,
      agent_mode: 'deterministic',
      agent_provider: 'none',
      note: 'Benign commits blocked by yieldOS are hard false positives; unknown is tracked separately as safety escalation.',
    },
    repositories: [],
    aggregate: null,
  };

  for (const spec of repoSpecs) {
    const results = [];
    const commits = (spec.benign_commits || []).length
      ? spec.benign_commits
      : collectSampleBenignCommits({ spec, tempRoot, limit: options.sampleBenign || 0 });
    for (const commit of commits) {
      results.push(runBenignCommit({ spec, commit, tempRoot }));
    }
    report.repositories.push({
      id: spec.id,
      name: spec.name,
      source: {
        git_url: spec.git_url,
        commit: spec.commit,
        stack: spec.stack,
      },
      results,
      sampled_benign_commits: !(spec.benign_commits || []).length && commits.length > 0,
      summary: summarizeFalsePositiveResults(results),
    });
  }

  report.aggregate = summarizeFalsePositiveResults(report.repositories.flatMap((repo) => repo.results));
  if (options.outFile) writeJson(options.outFile, report);
  return report;
}

function collectSampleBenignCommits({ spec, tempRoot, limit }) {
  if (!limit) return [];
  const sampleRoot = path.join(tempRoot, `${spec.id}-benign-sample`);
  fs.rmSync(sampleRoot, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(sampleRoot), { recursive: true });
  const clone = spawnSync('git', ['clone', '--quiet', '--no-tags', spec.git_url, sampleRoot], { encoding: 'utf8' });
  if (clone.status !== 0) throw new Error(`git clone failed for benign sample ${spec.id}: ${clone.stderr || clone.stdout}`);
  const checkout = runGit(sampleRoot, ['checkout', '--quiet', spec.commit]);
  if (checkout.status !== 0) throw new Error(`git checkout failed for benign sample ${spec.id}: ${checkout.stderr || checkout.stdout}`);
  const candidates = runGit(sampleRoot, ['log', '--no-merges', `-n${Math.max(limit * 20, limit)}`, '--format=%H']);
  return candidates.stdout
    .split('\n')
    .filter(Boolean)
    .filter((commit) => isBenignCommit(sampleRoot, commit))
    .slice(0, limit);
}

function isBenignCommit(repoRoot, commit) {
  const files = runGit(repoRoot, ['show', '--name-only', '--format=', commit]).stdout
    .split('\n')
    .filter(Boolean)
    .map((file) => file.replace(/\\/g, '/'));
  return files.length > 0 && files.every(isBenignPath);
}

function isBenignPath(file) {
  const normalized = file.toLowerCase();
  return normalized === 'readme.md'
    || normalized === 'readme'
    || normalized === 'license'
    || normalized === 'license.md'
    || normalized.startsWith('docs/')
    || normalized.startsWith('test/')
    || normalized.startsWith('tests/')
    || normalized.startsWith('__tests__/')
    || normalized.startsWith('.github/');
}

function runBenignCommit({ spec, commit, tempRoot }) {
  const runRoot = path.join(tempRoot, spec.id, commit.slice(0, 12));
  cloneAtParent(spec, commit, runRoot);
  const cherryPick = runGit(runRoot, ['cherry-pick', '--no-commit', commit]);
  if (cherryPick.status !== 0) {
    return {
      commit,
      outcome: 'replay-failed',
      verdict: null,
      changed_files: [],
      output: commandOutputEvidence(cherryPick),
    };
  }
  const hook = spawnSync(process.execPath, [HOOK_PATH], {
    cwd: runRoot,
    env: deterministicHookEnv(),
    input: JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: `git commit -m "benign replay ${commit.slice(0, 12)}"` },
      cwd: runRoot,
    }),
    encoding: 'utf8',
    timeout: 20000,
  });
  const verdict = parseVerdict(hook.stderr);
  return {
    commit,
    changed_files: changedFiles(runRoot),
    outcome: classifyOutcome(hook.status, verdict),
    verdict,
    output: commandOutputEvidence(hook),
  };
}

function cloneAtParent(spec, commit, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const clone = spawnSync('git', ['clone', '--quiet', '--no-tags', spec.git_url, dest], { encoding: 'utf8' });
  if (clone.status !== 0) throw new Error(`git clone failed for ${spec.id}: ${clone.stderr || clone.stdout}`);
  const checkout = runGit(dest, ['checkout', '--quiet', `${commit}^`]);
  if (checkout.status !== 0) {
    throw new Error(`git checkout parent failed for ${spec.id}@${commit}: ${checkout.stderr || checkout.stdout}`);
  }
  runGit(dest, ['config', 'user.email', 'yieldos-benchmark@example.com']);
  runGit(dest, ['config', 'user.name', 'yieldOS Benchmark']);
}

function changedFiles(repoRoot) {
  const diff = runGit(repoRoot, ['diff', '--cached', '--name-only']);
  return diff.stdout.split('\n').filter(Boolean).map(safeReportPath);
}

function classifyOutcome(status, verdict) {
  if (status === 0) return 'allowed';
  if (verdict && verdict.includes('unknown')) return 'unknown';
  return 'blocked';
}

function parseVerdict(stderr) {
  const match = /\[yieldOS:verdict\]\s+([^\s]+)/.exec(stderr || '');
  return match ? match[1] : null;
}

function deterministicHookEnv() {
  return {
    ...process.env,
    YIELDOS_AGENT_CHILD: '',
    YIELDOS_CODE_AUDIT_MODE: 'deterministic',
    YIELDOS_CODE_AUDIT_AGENT: 'none',
  };
}

function summarizeFalsePositiveResults(results) {
  const counts = summarizeCounts(results.map((result) => result.outcome));
  const total = results.length;
  return {
    total_commits: total,
    allowed: counts.allowed || 0,
    blocked: counts.blocked || 0,
    unknown: counts.unknown || 0,
    replay_failed: counts['replay-failed'] || 0,
    false_positive_rate: ratio(counts.blocked || 0, total),
    unknown_rate: ratio(counts.unknown || 0, total),
  };
}

function usage() {
  return [
    'Usage: node scripts/false-positive-benchmark.mjs --repo-spec benchmarks/public-repos.json --out benchmarks/<file>.json [--sample-benign N]',
    '',
    'Replays known-benign commits through the real yieldOS hook and records hard false positives separately from unknown escalation.',
  ].join('\n');
}

async function main() {
  try {
    const args = parseArgs();
    if (args.help) {
      process.stdout.write(`${usage()}\n`);
      return;
    }
    const outFile = args.outFile || path.join(REPO_ROOT, 'benchmarks', `false-positive-benchmark-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    const report = await runFalsePositiveBenchmark({
      repoSpec: args.repoSpec,
      outFile,
      tempRoot: args.tempRoot,
      sampleBenign: args.sampleBenign,
    });
    process.stdout.write(`${JSON.stringify({ outFile, aggregate: report.aggregate }, null, 2)}\n`);
  } catch (err) {
    process.stderr.write(`false-positive-benchmark: ${err.message}\n`);
    process.exit(2);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}

export {
  parseArgs,
  runFalsePositiveBenchmark,
  summarizeFalsePositiveResults,
};
