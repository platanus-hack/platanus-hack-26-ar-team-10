'use strict';

const GIT_CLONE_RE = /(?:^|\s)git\s+clone\s+(\S+)/;
const COPY_PATTERNS = [
  /(?:^|\s)cp\s+-r\s+\S+\s+\S+/,
  /(?:^|\s)rsync\s+-\S+\s+\S+\s+\S+/,
];

function extractRepoName(url) {
  if (!url) return 'unknown';
  const stripped = url.replace(/\.git$/, '');
  const parts = stripped.split('/');
  if (parts.length < 2) return stripped;
  return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
}

function match(cmd) {
  const out = [];
  const m = cmd.match(GIT_CLONE_RE);
  if (m) {
    out.push({
      type: 'vendored-code',
      name: extractRepoName(m[1]),
      version: 'HEAD',
      source: m[1],
      manager: 'git',
      exotic: true,
    });
  }
  return out;
}

module.exports = { match, extractRepoName };
