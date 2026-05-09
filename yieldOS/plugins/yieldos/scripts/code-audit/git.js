'use strict';

const { execFileSync } = require('node:child_process');

function git(projectRoot, args, opts = {}) {
  const out = execFileSync('git', args, {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: opts.stdio || ['ignore', 'pipe', 'pipe'],
  });
  return typeof out === 'string' ? out.trim() : '';
}

function collectStagedDiff(projectRoot) {
  const files = listFiles(projectRoot, ['diff', '--cached', '--name-only']);
  const diff = git(projectRoot, ['diff', '--cached', '--unified=80']);
  return { mode: 'commit', files, diff, range: '--cached' };
}

function collectPushDiff(projectRoot) {
  const upstream = git(projectRoot, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  const base = git(projectRoot, ['merge-base', 'HEAD', upstream]);
  const files = listFiles(projectRoot, ['diff', '--name-only', `${base}..HEAD`]);
  const diff = git(projectRoot, ['diff', '--unified=80', `${base}..HEAD`]);
  return { mode: 'push', files, diff, range: `${base}..HEAD`, upstream };
}

function listFiles(projectRoot, args) {
  const out = git(projectRoot, args);
  return out ? out.split(/\r?\n/).filter(Boolean) : [];
}

function restageFiles(projectRoot, files) {
  if (!files || files.length === 0) return;
  git(projectRoot, ['add', '--', ...files], { stdio: ['ignore', 'ignore', 'pipe'] });
}

module.exports = { git, collectStagedDiff, collectPushDiff, restageFiles };
