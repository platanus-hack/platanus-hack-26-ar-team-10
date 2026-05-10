'use strict';

const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const AUDIT_PATHS = [
  'security/code-audit-events.md',
  'security/code-audit-state.json',
];
const AUDIT_PATH_PREFIXES = [
  'security/oracles/',
];
const GIT_MAX_BUFFER_BYTES = 64 * 1024 * 1024;

function git(projectRoot, args, opts = {}) {
  const out = execFileSync('git', args, {
    cwd: projectRoot,
    encoding: 'utf8',
    maxBuffer: opts.maxBuffer || GIT_MAX_BUFFER_BYTES,
    stdio: opts.stdio || ['ignore', 'pipe', 'pipe'],
  });
  return typeof out === 'string' ? out.trim() : '';
}

function collectStagedDiff(projectRoot) {
  const files = nonAuditFiles(listFiles(projectRoot, ['diff', '--cached', '--name-only']));
  const diff = files.length > 0 ? git(projectRoot, ['diff', '--cached', '--unified=80', '--', ...files]) : '';
  return withHash({ mode: 'commit', diffSource: 'staged', files, diff, range: '--cached' });
}

function collectPushDiff(projectRoot) {
  const upstream = resolvePushUpstream(projectRoot);
  const base = git(projectRoot, ['merge-base', 'HEAD', upstream]);
  return collectRangeDiff(projectRoot, `${base}..HEAD`, 'push', upstream);
}

function resolvePushUpstream(projectRoot) {
  try {
    return git(projectRoot, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  } catch (_) {
    return defaultPushBase(projectRoot);
  }
}

function defaultPushBase(projectRoot) {
  if (process.env.CODE_AUDIT_BASE_REF) return process.env.CODE_AUDIT_BASE_REF;
  try {
    const remoteHead = git(projectRoot, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']);
    if (remoteHead) return remoteHead;
  } catch (_) {
    // Some first-push repos have origin/main but no origin/HEAD symbolic ref.
  }

  const branches = remoteBranches(projectRoot);
  if (branches.includes('origin/main')) return 'origin/main';
  if (branches.includes('origin/master')) return 'origin/master';
  return branches[0] || 'origin/main';
}

function remoteBranches(projectRoot) {
  try {
    const out = git(projectRoot, ['for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin']);
    return out ? out.split(/\r?\n/).filter(Boolean).filter((branch) => branch !== 'origin/HEAD') : [];
  } catch (_) {
    return [];
  }
}

function collectBaseDiff(projectRoot, baseRef, mode = 'pr') {
  const base = git(projectRoot, ['merge-base', 'HEAD', baseRef]);
  return collectRangeDiff(projectRoot, `${base}..HEAD`, mode, baseRef);
}

function collectRangeDiff(projectRoot, range, mode, upstream) {
  const files = nonAuditFiles(listFiles(projectRoot, ['diff', '--name-only', range]));
  const diff = files.length > 0 ? git(projectRoot, ['diff', '--unified=80', range, '--', ...files]) : '';
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

function nonAuditFiles(files) {
  return (files || []).filter((file) => !isAuditPath(file));
}

function isAuditPath(file) {
  const normalized = normalizeGitPath(file);
  return AUDIT_PATHS.includes(normalized) || AUDIT_PATH_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function normalizeGitPath(file) {
  return String(file || '').replace(/\\/g, '/');
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
  resolvePushUpstream,
  collectBaseDiff,
  collectRangeDiff,
  restageFiles,
  hashDiff,
  AUDIT_PATHS,
  AUDIT_PATH_PREFIXES,
  isAuditPath,
  nonAuditFiles,
};
