'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const BENCHMARK_SCRIPT = pathToFileURL(path.resolve(__dirname, '..', '..', '..', '..', 'scripts', 'real-repo-benchmark.mjs')).href;

function sh(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function tmpRepo(name, root = fs.mkdtempSync(path.join(os.tmpdir(), `yieldos-real-bench-${name}-`))) {
  fs.mkdirSync(root, { recursive: true });
  sh(root, ['init', '-b', 'main']);
  sh(root, ['config', 'user.email', 'test@example.com']);
  sh(root, ['config', 'user.name', 'Test User']);
  fs.writeFileSync(path.join(root, 'README.md'), `# ${name}\n`);
  fs.writeFileSync(path.join(root, 'app.js'), 'module.exports = { ok: true };\n');
  sh(root, ['add', 'README.md', 'app.js']);
  sh(root, ['commit', '-m', 'initial']);
  return root;
}

test('real repo benchmark compares control commits against yieldOS-gated commits', async () => {
  const { ATTACK_TASKS, runBenchmark } = await import(BENCHMARK_SCRIPT);
  const repoOne = tmpRepo('one');
  const repoTwo = tmpRepo('two');
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yieldos-real-bench-runs-'));
  const outFile = path.join(tempRoot, 'report.json');

  const report = await runBenchmark({
    repos: [repoOne, repoTwo],
    outFile,
    tempRoot,
    runs: 1,
    allowDirtyRunner: true,
  });

  assert.equal(fs.existsSync(outFile), true);
  const written = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  assert.equal(written.version, 2);
  assert.equal(written.repo_under_test, undefined);
  assert.equal(written.hook_path, undefined);
  assert.equal(written.temp_root, undefined);
  assert.equal(written.benchmark_runner.raw_logs_included, false);
  assert.equal(written.benchmark_runner.local_paths_included, false);
  assert.equal(report.repositories.length, 2);
  assert.equal(report.aggregate.total_tasks, ATTACK_TASKS.length * 2);
  assert.equal(report.aggregate.control_commit_success_rate, 1);
  assert.equal(report.aggregate.yieldos_prevention_rate, 1);

  for (const repo of report.repositories) {
    assert.equal(repo.path, undefined);
    assert.match(repo.id, /^repo-\d+$/);
    assert.equal(repo.source.commit.length, 40);
    assert.equal(repo.results.length, ATTACK_TASKS.length);
    for (const result of repo.results) {
      assert.equal(result.comparison.same_task, true);
      assert.equal(result.comparison.control_committed_unsafe_change, true);
      assert.equal(result.comparison.yieldos_prevented_unsafe_change, true);
      assert.equal(result.yieldos.findings.length > 0, true);
      assert.equal(result.control.stdout, undefined);
      assert.equal(result.control.stderr, undefined);
      assert.equal(result.yieldos.stdout, undefined);
      assert.equal(result.yieldos.stderr, undefined);
      assert.equal(result.yieldos.raw_logs, undefined);
      assert.equal(typeof result.yieldos.output.stderr_bytes, 'number');
      assert.equal(result.yieldos.output.stderr_sha256, undefined);
      assert.equal(result.yieldos.output.stdout_sha256, undefined);
      for (const finding of result.yieldos.findings) {
        assert.equal(path.isAbsolute(finding.file), false);
        assert.deepEqual(Object.keys(finding).sort(), ['file', 'rule_id', 'severity', 'status', 'title']);
      }
    }
  }
});

test('real repo benchmark resolves repo roots and keeps same-basename repos isolated', async () => {
  const { ATTACK_TASKS, runBenchmark } = await import(BENCHMARK_SCRIPT);
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'yieldos-real-bench-collide-'));
  const repoOne = tmpRepo('same-one', path.join(parent, 'a', 'same'));
  const repoTwo = tmpRepo('same-two', path.join(parent, 'b', 'same'));
  const subdir = path.join(repoOne, 'nested', 'package');
  fs.mkdirSync(subdir, { recursive: true });
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yieldos-real-bench-runs-'));

  const report = await runBenchmark({
    repos: [subdir, repoTwo],
    tempRoot,
    runs: 1,
    allowDirtyRunner: true,
  });

  assert.equal(report.repositories.length, 2);
  assert.equal(report.repositories[0].source.commit, sh(repoOne, ['rev-parse', 'HEAD']));
  assert.equal(report.repositories[0].name, 'same');
  assert.equal(report.repositories[1].name, 'same');
  assert.equal(report.aggregate.total_tasks, ATTACK_TASKS.length * 2);
  assert.equal(report.aggregate.yieldos_prevention_rate, 1);
});

test('real repo benchmark parser accepts repeated repo flags', async () => {
  const { parseArgs } = await import(BENCHMARK_SCRIPT);
  const parsed = parseArgs([
    '--repo',
    '/tmp/a',
    '--repo',
    '/tmp/b',
    '--runs',
    '2',
    '--out',
    '/tmp/out.json',
    '--repo-spec',
    '/tmp/repos.json',
    '--include-raw-logs',
    '--include-private-paths',
  ]);

  assert.deepEqual(parsed.repos, [path.resolve('/tmp/a'), path.resolve('/tmp/b')]);
  assert.deepEqual(parsed.repoSpecs, [path.resolve('/tmp/repos.json')]);
  assert.equal(parsed.runs, 2);
  assert.equal(parsed.outFile, path.resolve('/tmp/out.json'));
  assert.equal(parsed.includeRawLogs, true);
  assert.equal(parsed.includePrivatePaths, true);
});

test('real repo benchmark loads repo specs from JSON and clones pinned refs', async () => {
  const { ATTACK_TASKS, loadRepoSpecs, runBenchmark } = await import(BENCHMARK_SCRIPT);
  const source = tmpRepo('public-source');
  const commit = sh(source, ['rev-parse', 'HEAD']);
  const specFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'yieldos-spec-')), 'repos.json');
  fs.writeFileSync(specFile, `${JSON.stringify({
    version: 1,
    repos: [{
      id: 'local-public',
      name: 'local-public',
      git_url: source,
      commit,
      stack: ['node'],
      why: 'local fixture',
      benign_commits: [],
    }],
  })}\n`);

  const specs = loadRepoSpecs(specFile);
  assert.equal(specs.length, 1);
  assert.equal(specs[0].id, 'local-public');
  assert.equal(specs[0].commit, commit);

  const report = await runBenchmark({
    repoSpecs: specs,
    tempRoot: fs.mkdtempSync(path.join(os.tmpdir(), 'yieldos-public-bench-')),
    runs: 1,
    allowDirtyRunner: true,
  });

  assert.equal(report.repositories.length, 1);
  assert.equal(report.repositories[0].id, 'local-public');
  assert.equal(report.repositories[0].kind, 'public-spec');
  assert.equal(report.repositories[0].source.commit, commit);
  assert.equal(report.aggregate.total_tasks, ATTACK_TASKS.length);
  assert.equal(report.aggregate.yieldos_prevention_rate, 1);
});

test('real repo benchmark refuses committed reports from dirty runner by default', async () => {
  const { assertCleanRunnerSource } = await import(BENCHMARK_SCRIPT);

  assert.throws(
    () => assertCleanRunnerSource({ dirty: true }, { allowDirtyRunner: false, outFile: '/tmp/report.json' }),
    /dirty benchmark runner/,
  );
  assert.doesNotThrow(
    () => assertCleanRunnerSource({ dirty: true }, { allowDirtyRunner: true, outFile: '/tmp/report.json' }),
  );
});
