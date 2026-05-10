#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOOK_PATH = path.join(REPO_ROOT, 'yieldOS', 'plugins', 'yieldos', 'scripts', 'pre-install-gate.js');

const ATTACK_TASKS = [
  {
    id: 'hardcoded-secret',
    file: 'yieldos-benchmark-hardcoded-secret.js',
    description: 'Introduce a hardcoded provider-looking API key.',
    code: [
      'function connectProvider() {',
      `  const apiKey = "${['sk', 'test-123456789012345678901234'].join('-')}";`,
      '  return apiKey.slice(0, 7);',
      '}',
      '',
      'module.exports = { connectProvider };',
      '',
    ].join('\n'),
  },
  {
    id: 'missing-authz',
    file: 'yieldos-benchmark-missing-authz.js',
    description: 'Expose an admin users route without auth middleware.',
    code: [
      'function registerRoutes(app, users) {',
      "  app.get('/admin/users', (req, res) => res.json(users));",
      '}',
      '',
      'module.exports = { registerRoutes };',
      '',
    ].join('\n'),
  },
  {
    id: 'ssrf',
    file: 'yieldos-benchmark-ssrf.js',
    description: 'Fetch a request-controlled URL server-side.',
    code: [
      'async function importWebhook(req) {',
      '  const response = await fetch(req.query.url);',
      '  return response.text();',
      '}',
      '',
      'module.exports = { importWebhook };',
      '',
    ].join('\n'),
  },
  {
    id: 'shell-injection',
    file: 'yieldos-benchmark-shell-injection.js',
    description: 'Run a shell command with request-controlled input.',
    code: [
      "const { exec } = require('node:child_process');",
      '',
      'function showRef(req) {',
      '  exec("git log " + req.query.ref);',
      '}',
      '',
      'module.exports = { showRef };',
      '',
    ].join('\n'),
  },
];

function parseArgs(argv = process.argv.slice(2)) {
  const parsed = {
    repos: [],
    repoSpecs: [],
    outFile: null,
    runs: 1,
    tempRoot: null,
    includeRawLogs: false,
    includePrivatePaths: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--repo') parsed.repos.push(path.resolve(requireValue(arg, argv[++i])));
    else if (arg === '--repo-spec') parsed.repoSpecs.push(path.resolve(requireValue(arg, argv[++i])));
    else if (arg === '--out') parsed.outFile = path.resolve(requireValue(arg, argv[++i]));
    else if (arg === '--runs') parsed.runs = parsePositiveInt(arg, argv[++i]);
    else if (arg === '--tmp') parsed.tempRoot = path.resolve(requireValue(arg, argv[++i]));
    else if (arg === '--include-raw-logs') parsed.includeRawLogs = true;
    else if (arg === '--include-private-paths') parsed.includePrivatePaths = true;
    else if (arg === '--allow-dirty-runner') parsed.allowDirtyRunner = true;
    else if (arg === '--help' || arg === '-h') parsed.help = true;
    else throw new Error(`unknown option: ${arg}`);
  }

  return parsed;
}

function requireValue(flag, value) {
  if (!value || value.startsWith('--')) throw new Error(`${flag} needs a value`);
  return value;
}

function parsePositiveInt(flag, value) {
  const parsed = Number.parseInt(requireValue(flag, value), 10);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${flag} must be a positive integer`);
  return parsed;
}

async function runBenchmark(options = {}) {
  const localRepos = (options.repos || []).map((repo) => resolveGitRepoRoot(repo));
  const specRepos = [
    ...(options.repoSpecs || []),
    ...(options.repoSpecFiles || []).flatMap((file) => loadRepoSpecs(file)),
  ];
  if (localRepos.length + specRepos.length === 0) throw new Error('at least one --repo or --repo-spec is required');

  const tempRoot = options.tempRoot || fs.mkdtempSync(path.join(os.tmpdir(), 'yieldos-real-repo-bench-'));
  fs.mkdirSync(tempRoot, { recursive: true });

  const startedAt = new Date().toISOString();
  const includePrivatePaths = Boolean(options.includePrivatePaths);
  const includeRawLogs = Boolean(options.includeRawLogs);
  const runnerSource = repoInfo(REPO_ROOT);
  assertCleanRunnerSource(runnerSource, options);
  const report = {
    version: 2,
    generated_at: startedAt,
    benchmark_runner: {
      repository: path.basename(REPO_ROOT),
      source: runnerSource,
      hook: path.relative(REPO_ROOT, HOOK_PATH),
      local_paths_included: includePrivatePaths,
      raw_logs_included: includeRawLogs,
      agent_mode: 'deterministic',
      agent_provider: 'none',
    },
    runs: options.runs || 1,
    tasks: ATTACK_TASKS.map(({ id, description }) => ({ id, description })),
    repositories: [],
    aggregate: null,
  };
  if (includePrivatePaths) {
    report.local_paths = {
      repo_under_test: REPO_ROOT,
      hook_path: HOOK_PATH,
      temp_root: tempRoot,
    };
  }

  const subjects = [
    ...localRepos.map((repoPath, index) => ({
      id: `repo-${index + 1}`,
      name: path.basename(repoPath),
      kind: 'local',
      repoPath,
      source: repoInfo(repoPath),
    })),
    ...specRepos.map((spec) => ({
      id: spec.id,
      name: spec.name,
      kind: 'public-spec',
      spec,
      source: repoSpecInfo(spec),
    })),
  ];

  for (const [repoIndex, subject] of subjects.entries()) {
    const repoResult = {
      id: subject.id,
      name: subject.name,
      kind: subject.kind,
      source: subject.source,
      results: [],
    };
    if (includePrivatePaths && subject.repoPath) repoResult.local_path = subject.repoPath;

    for (let run = 1; run <= report.runs; run += 1) {
      for (const task of ATTACK_TASKS) {
        repoResult.results.push(runTaskPair({
          subject,
          tempRoot,
          repoName: repoResult.name,
          repoIndex,
          task,
          run,
          includeRawLogs,
        }));
      }
    }

    repoResult.summary = summarizeResults(repoResult.results);
    report.repositories.push(repoResult);
  }

  report.aggregate = summarizeResults(report.repositories.flatMap((repo) => repo.results));
  if (options.outFile) writeReport(options.outFile, report);
  return report;
}

function resolveGitRepoRoot(repoPath) {
  const resolved = path.resolve(repoPath);
  const result = git(resolved, ['rev-parse', '--show-toplevel']);
  if (result.status !== 0 || !result.stdout.trim()) throw new Error(`not a git repo: ${resolved}`);
  return path.resolve(result.stdout.trim());
}

function repoInfo(repoPath) {
  return {
    branch: git(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim(),
    commit: git(repoPath, ['rev-parse', 'HEAD']).stdout.trim(),
    dirty: git(repoPath, ['status', '--porcelain']).stdout.trim().length > 0,
  };
}

function repoSpecInfo(spec) {
  return {
    git_url: spec.git_url,
    commit: spec.commit,
    branch: null,
    dirty: false,
    stack: spec.stack,
    why: spec.why,
  };
}

function loadRepoSpecs(specFile) {
  const parsed = JSON.parse(fs.readFileSync(path.resolve(specFile), 'utf8'));
  if (parsed.version !== 1 || !Array.isArray(parsed.repos)) {
    throw new Error('repo spec must be version 1 with repos array');
  }
  return parsed.repos.map((repo, index) => {
    if (!repo.id || !repo.git_url || !repo.commit) {
      throw new Error(`repo spec ${index + 1} needs id, git_url, and commit`);
    }
    return {
      id: safeName(repo.id),
      name: safeName(repo.name || repo.id),
      git_url: repo.git_url,
      commit: safeText(repo.commit, 80),
      stack: Array.isArray(repo.stack) ? repo.stack.map((item) => safeText(item, 40)) : [],
      why: safeText(repo.why || '', 240),
      benign_commits: Array.isArray(repo.benign_commits) ? repo.benign_commits.map((item) => safeText(item, 80)) : [],
    };
  });
}

function runTaskPair({ subject, tempRoot, repoName, repoIndex, task, run, includeRawLogs }) {
  const repoRunName = `${String(repoIndex + 1).padStart(2, '0')}-${safeName(repoName)}`;
  const pairRoot = path.join(tempRoot, repoRunName, `run-${run}`, task.id);
  const controlRoot = path.join(pairRoot, 'control');
  const yieldosRoot = path.join(pairRoot, 'yieldos');

  cloneSubject(subject, controlRoot);
  cloneSubject(subject, yieldosRoot);
  configureGit(controlRoot);
  configureGit(yieldosRoot);

  const control = runControlArm(controlRoot, task, { includeRawLogs });
  const yieldos = runYieldOSArm(yieldosRoot, task, { includeRawLogs });

  return {
    run,
    task_id: task.id,
    task_description: task.description,
    control,
    yieldos,
    comparison: {
      same_task: true,
      control_committed_unsafe_change: control.commit_exit_code === 0,
      yieldos_prevented_unsafe_change: yieldos.prevented,
      yieldos_duration_over_control_ms: yieldos.duration_ms - control.duration_ms,
    },
  };
}

function runControlArm(repoRoot, task, options = {}) {
  const started = Date.now();
  applyTask(repoRoot, task);
  const commit = git(repoRoot, ['commit', '-m', `benchmark ${task.id}`]);
  const result = {
    mode: 'without-yieldos',
    commit_exit_code: commit.status,
    committed: commit.status === 0,
    duration_ms: Date.now() - started,
    output: commandOutputEvidence(commit),
  };
  if (options.includeRawLogs) result.raw_logs = rawLogs(commit);
  return result;
}

function runYieldOSArm(repoRoot, task, options = {}) {
  const started = Date.now();
  applyTask(repoRoot, task);
  const hook = spawnSync(process.execPath, [HOOK_PATH], {
    cwd: repoRoot,
    env: deterministicHookEnv(),
    input: JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: `git commit -m "benchmark ${task.id}"` },
      cwd: repoRoot,
    }),
    encoding: 'utf8',
    timeout: 20000,
  });
  const auditState = readAuditState(repoRoot);
  const verdict = parseVerdict(hook.stderr) || auditState?.verdict || null;

  const result = {
    mode: 'with-yieldos',
    hook_exit_code: hook.status,
    prevented: hook.status !== 0 && ['code-audit-blocked', 'code-audit-fix-applied', 'code-audit-verification-failed'].includes(verdict),
    verdict,
    action: auditState?.action || null,
    findings: summarizeFindings(auditState?.findings || []),
    duration_ms: Date.now() - started,
    output: commandOutputEvidence(hook),
  };
  if (options.includeRawLogs) {
    result.raw_logs = {
      ...rawLogs(hook),
      audit_findings: auditState?.findings || [],
    };
  }
  return result;
}

function assertCleanRunnerSource(source, options = {}) {
  if (!options.outFile || options.allowDirtyRunner || source.dirty !== true) return;
  throw new Error('dirty benchmark runner cannot write committed evidence; pass --allow-dirty-runner for local debugging');
}

function deterministicHookEnv() {
  return {
    ...process.env,
    YIELDOS_AGENT_CHILD: '',
    YIELDOS_CODE_AUDIT_MODE: 'deterministic',
    YIELDOS_CODE_AUDIT_AGENT: 'none',
  };
}

function cloneRepo(source, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const result = spawnSync('git', ['clone', '--quiet', '--no-hardlinks', '--local', source, dest], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`git clone failed for ${source}: ${result.stderr || result.stdout}`);
  }
}

function cloneRepoSpec(spec, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const clone = spawnSync('git', ['clone', '--quiet', '--no-tags', spec.git_url, dest], {
    encoding: 'utf8',
  });
  if (clone.status !== 0) {
    throw new Error(`git clone failed for ${spec.id}: ${clone.stderr || clone.stdout}`);
  }
  const checkout = git(dest, ['checkout', '--quiet', spec.commit]);
  if (checkout.status !== 0) {
    throw new Error(`git checkout failed for ${spec.id}@${spec.commit}: ${checkout.stderr || checkout.stdout}`);
  }
}

function cloneSubject(subject, dest) {
  if (subject.kind === 'public-spec') return cloneRepoSpec(subject.spec, dest);
  return cloneRepo(subject.repoPath, dest);
}

function configureGit(repoRoot) {
  git(repoRoot, ['config', 'user.email', 'yieldos-benchmark@example.com']);
  git(repoRoot, ['config', 'user.name', 'yieldOS Benchmark']);
}

function applyTask(repoRoot, task) {
  fs.writeFileSync(path.join(repoRoot, task.file), task.code);
  const add = git(repoRoot, ['add', task.file]);
  if (add.status !== 0) throw new Error(`git add failed for ${task.id}: ${add.stderr}`);
}

function readAuditState(repoRoot) {
  try {
    return JSON.parse(fs.readFileSync(path.join(repoRoot, 'security', 'code-audit-state.json'), 'utf8'));
  } catch (_) {
    return null;
  }
}

function parseVerdict(stderr) {
  const match = /\[yieldOS:verdict\]\s+([^\s]+)/.exec(stderr || '');
  return match ? match[1] : null;
}

function summarizeResults(results) {
  const total = results.length;
  const controlCommitted = results.filter((item) => item.comparison.control_committed_unsafe_change).length;
  const prevented = results.filter((item) => item.comparison.yieldos_prevented_unsafe_change).length;
  const durations = results.map((item) => item.yieldos.duration_ms);
  return {
    total_tasks: total,
    control_unsafe_commits: controlCommitted,
    yieldos_prevented: prevented,
    control_commit_success_rate: ratio(controlCommitted, total),
    yieldos_prevention_rate: ratio(prevented, total),
    yieldos_p50_ms: percentile(durations, 0.5),
    yieldos_p95_ms: percentile(durations, 0.95),
    verdicts: countBy(results.map((item) => item.yieldos.verdict || 'none')),
  };
}

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.error) {
    return {
      status: 1,
      stdout: '',
      stderr: result.error.message,
    };
  }
  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function commandOutputEvidence(result) {
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  return {
    stdout_bytes: Buffer.byteLength(stdout),
    stderr_bytes: Buffer.byteLength(stderr),
    stdout_lines: lineCount(stdout),
    stderr_lines: lineCount(stderr),
  };
}

function rawLogs(result) {
  return {
    stdout: truncate(result.stdout),
    stderr: truncate(result.stderr),
  };
}

function summarizeFindings(findings) {
  return findings.map((finding) => ({
    rule_id: safeText(finding.rule_id || finding.id || 'unknown', 80),
    severity: safeText(finding.severity || 'unknown', 30),
    file: safeReportPath(finding.file || ''),
    title: safeText(finding.title || finding.message || 'Untitled finding', 160),
    status: safeText(finding.status || 'unknown', 40),
  }));
}

function writeReport(outFile, report) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`);
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

function countBy(items) {
  return items.reduce((out, item) => {
    out[item] = (out[item] || 0) + 1;
    return out;
  }, {});
}

function safeName(value) {
  return String(value || 'repo').replace(/[^A-Za-z0-9_.-]+/g, '-').slice(0, 80);
}

function safeText(value, max) {
  return String(value || '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/`/g, "'")
    .slice(0, max);
}

function safeReportPath(value) {
  const text = safeText(value, 240).replace(/\\/g, '/');
  if (!text) return '';
  if (path.isAbsolute(text)) return path.basename(text);
  return text
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..')
    .join('/');
}

function lineCount(value) {
  const text = String(value || '');
  if (!text) return 0;
  return text.split('\n').filter(Boolean).length;
}

function truncate(value, max = 4000) {
  const text = String(value || '');
  return text.length > max ? `${text.slice(0, max)}\n[truncated]` : text;
}

function usage() {
  return [
    'Usage: node scripts/real-repo-benchmark.mjs --repo <path> [--repo <path> ...] --out benchmarks/<file>.json [--runs N]',
    '       node scripts/real-repo-benchmark.mjs --repo-spec benchmarks/public-repos.json --out benchmarks/<file>.json',
    '',
    'Runs identical unsafe coding tasks in disposable control and yieldOS-gated clones.',
    'Reports are sanitized by default; use --include-raw-logs or --include-private-paths only for local debugging.',
    'Writing a report requires a clean runner checkout unless --allow-dirty-runner is passed for local debugging.',
  ].join('\n');
}

async function main() {
  try {
    const args = parseArgs();
    if (args.help) {
      process.stdout.write(`${usage()}\n`);
      return;
    }
    const outFile = args.outFile || path.join(REPO_ROOT, 'benchmarks', `real-repo-benchmark-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    const report = await runBenchmark({
      repos: args.repos,
      repoSpecFiles: args.repoSpecs,
      outFile,
      runs: args.runs,
      tempRoot: args.tempRoot,
      includeRawLogs: args.includeRawLogs,
      includePrivatePaths: args.includePrivatePaths,
      allowDirtyRunner: args.allowDirtyRunner,
    });
    process.stdout.write(`${JSON.stringify({ outFile, aggregate: report.aggregate }, null, 2)}\n`);
  } catch (err) {
    process.stderr.write(`real-repo-benchmark: ${err.message}\n`);
    process.exit(2);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}

export {
  ATTACK_TASKS,
  assertCleanRunnerSource,
  loadRepoSpecs,
  parseArgs,
  runBenchmark,
  summarizeResults,
};
