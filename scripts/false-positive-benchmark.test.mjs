import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseArgs, runFalsePositiveBenchmark, summarizeFalsePositiveResults } from './false-positive-benchmark.mjs';

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function fixtureRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yieldos-fp-source-'));
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'Test User']);
  fs.writeFileSync(path.join(root, 'README.md'), '# fixture\n');
  git(root, ['add', 'README.md']);
  git(root, ['commit', '-m', 'initial']);
  fs.writeFileSync(path.join(root, 'README.md'), '# fixture\n\nSafe docs update.\n');
  git(root, ['add', 'README.md']);
  git(root, ['commit', '-m', 'docs update']);
  return { root, benignCommit: git(root, ['rev-parse', 'HEAD']) };
}

test('summarizeFalsePositiveResults reports hard false positives separately from unknown', () => {
  assert.deepEqual(summarizeFalsePositiveResults([
    { outcome: 'allowed' },
    { outcome: 'blocked' },
    { outcome: 'unknown' },
    { outcome: 'replay-failed' },
  ]), {
    total_commits: 4,
    allowed: 1,
    blocked: 1,
    unknown: 1,
    replay_failed: 1,
    false_positive_rate: 0.25,
    unknown_rate: 0.25,
  });
});

test('false positive benchmark replays benign commits through yieldOS hook', async () => {
  const { root, benignCommit } = fixtureRepo();
  const report = await runFalsePositiveBenchmark({
    repoSpecs: [{
      id: 'fixture',
      name: 'fixture',
      git_url: root,
      commit: benignCommit,
      benign_commits: [benignCommit],
      stack: ['node'],
    }],
    tempRoot: fs.mkdtempSync(path.join(os.tmpdir(), 'yieldos-fp-runs-')),
  });

  assert.equal(report.version, 1);
  assert.equal(report.aggregate.total_commits, 1);
  assert.equal(report.aggregate.false_positive_rate, 0);
  assert.equal(report.repositories[0].results[0].outcome, 'allowed');
});

test('false positive parser accepts repo spec and output paths', () => {
  const parsed = parseArgs(['--repo-spec', '/tmp/repos.json', '--out', '/tmp/out.json', '--tmp', '/tmp/run', '--sample-benign', '5']);
  assert.equal(parsed.repoSpec, path.resolve('/tmp/repos.json'));
  assert.equal(parsed.outFile, path.resolve('/tmp/out.json'));
  assert.equal(parsed.tempRoot, path.resolve('/tmp/run'));
  assert.equal(parsed.sampleBenign, 5);
});
