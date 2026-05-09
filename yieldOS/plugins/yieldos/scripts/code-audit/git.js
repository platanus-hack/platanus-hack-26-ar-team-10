'use strict';

const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const AUDIT_PATHS = [
  'security/code-audit-events.md',
  'security/code-audit-state.json',
];

function git(projectRoot, args, opts = {}) {
  const out = execFileSync('git', args, {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: opts.stdio || ['ignore', 'pipe', 'pipe'],
  });
  return typeof out === 'string' ? out.trim() : '';
}

function collectStagedDiff(projectRoot) {
  const pathspec = auditPathspec();
  const files = listFiles(projectRoot, ['diff', '--cached', '--name-only', '--', ...pathspec]);
  const diff = git(projectRoot, ['diff', '--cached', '--unified=80', '--', ...pathspec]);
  return withHash({ mode: 'commit', diffSource: 'staged', files, diff, range: '--cached' });
}

function collectPushDiff(projectRoot) {
  const upstream = git(projectRoot, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  const base = git(projectRoot, ['merge-base', 'HEAD', upstream]);
  return collectRangeDiff(projectRoot, `${base}..HEAD`, 'push', upstream);
}

function collectBaseDiff(projectRoot, baseRef, mode = 'pr') {
  const base = git(projectRoot, ['merge-base', 'HEAD', baseRef]);
  return collectRangeDiff(projectRoot, `${base}..HEAD`, mode, baseRef);
}

function collectRangeDiff(projectRoot, range, mode, upstream) {
  const pathspec = auditPathspec();
  const files = listFiles(projectRoot, ['diff', '--name-only', range, '--', ...pathspec]);
  const diff = git(projectRoot, ['diff', '--unified=80', range, '--', ...pathspec]);
  return withHash({ mode, diffSource: 'merge-base', files, diff, range, upstream });
}

function listFiles(projectRoot, args) {
  const out = git(projectRoot, args);
  return out ? out.split(/\r?\n/).filter(Boolean) : [];
}

function restageFiles(projectRoot, files) {
  if (!files || files.length === 0) return;
  git(projectRoot, ['add', '--', ...files], { stdio: ['ignore', 'ignore', 'pipe'] });
}

function auditPathspec() {
  return ['.', ...AUDIT_PATHS.map((file) => `:(exclude)${file}`)];
}

function withHash(input) {
  return { ...input, diffHash: hashDiff(input.diff) };
}

function hashDiff(diff) {
  return `sha256:${crypto.createHash('sha256').update(diff || '', 'utf8').digest('hex')}`;
}

module.exports = {
  git,
  collectStagedDiff,
  collectPushDiff,
  collectBaseDiff,
  collectRangeDiff,
  restageFiles,
  hashDiff,
  AUDIT_PATHS,
};
