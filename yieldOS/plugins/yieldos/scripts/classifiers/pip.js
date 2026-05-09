'use strict';

const COMMAND_RE = /(?:^|\s)(?:pip|pip3|python\s+-m\s+pip)\s+install\b/;
const FLAG_RE = /^(--?[\w-]+)(?:=(.+))?$/;

function parsePypiSpec(spec) {
  // Examples: requests, requests==2.31.0, requests>=2.31, requests~=2,
  // git+https://..., ./local, /abs, ftp://, file:..., -e .
  if (!spec) return null;
  if (spec.startsWith('-e') || spec === '-e') return null;
  if (spec.startsWith('git+') || spec.startsWith('hg+') || spec.startsWith('svn+')) {
    return { name: spec, version: 'vcs', exotic: true };
  }
  if (spec.startsWith('./') || spec.startsWith('/') || spec.startsWith('file:')) {
    return { name: spec, version: 'local', exotic: true };
  }
  if (spec.startsWith('http://') || spec.startsWith('https://') || spec.startsWith('ftp://')) {
    return { name: spec, version: 'remote', exotic: true };
  }
  const m = spec.match(/^([A-Za-z0-9_.\-]+)(?:\[[^\]]+\])?\s*(==|>=|<=|~=|!=|>|<)\s*(.+)$/);
  if (m) return { name: m[1], version: m[3], exotic: false };
  return { name: spec.replace(/\[[^\]]+\]$/, ''), version: 'latest', exotic: false };
}

function match(cmd) {
  if (!COMMAND_RE.test(cmd)) return [];
  const tokens = cmd.trim().split(/\s+/);
  let installIdx = tokens.indexOf('install');
  if (installIdx === -1) return [];
  const positionals = tokens.slice(installIdx + 1).filter((t) => !t.startsWith('-'));
  // Filter out -r requirements.txt path, etc.
  const skipNext = new Set();
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === '-r' || tokens[i] === '-c' || tokens[i] === '--requirement' || tokens[i] === '--constraint') {
      skipNext.add(tokens[i + 1]);
    }
  }
  return positionals
    .filter((t) => !skipNext.has(t))
    .map(parsePypiSpec)
    .filter(Boolean)
    .map((p) => ({
      type: p.exotic ? 'vendored-code' : 'library',
      name: p.name,
      version: p.version,
      source: 'pypi',
      manager: 'pip',
      exotic: p.exotic === true,
    }));
}

module.exports = { match, parsePypiSpec };
