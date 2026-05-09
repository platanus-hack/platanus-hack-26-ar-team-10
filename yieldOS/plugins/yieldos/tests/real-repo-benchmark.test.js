'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const BENCHMARK_SCRIPT = path.resolve(__dirname, '..', '..', '..', '..', 'scripts', 'real-repo-benchmark.mjs');

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
      assert.equal(typeof result.yieldos.output.stderr_sha256, 'string');
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
    '--include-raw-logs',
    '--include-private-paths',
  ]);

  assert.deepEqual(parsed.repos, ['/tmp/a', '/tmp/b']);
  assert.equal(parsed.runs, 2);
  assert.equal(parsed.outFile, '/tmp/out.json');
  assert.equal(parsed.includeRawLogs, true);
  assert.equal(parsed.includePrivatePaths, true);
});
