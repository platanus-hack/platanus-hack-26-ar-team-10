'use strict';

function bumpType(prevVersion, nextVersion) {
  if (!prevVersion || !nextVersion) return 'unknown';
  const p = parse(prevVersion);
  const n = parse(nextVersion);
  if (!p || !n) return 'unknown';
  if (n.major > p.major) return 'major';
  if (n.major === p.major && n.minor > p.minor) return 'minor';
  if (n.major === p.major && n.minor === p.minor && n.patch > p.patch) return 'patch';
  if (n.major < p.major || (n.major === p.major && n.minor < p.minor) || (n.major === p.major && n.minor === p.minor && n.patch < p.patch)) {
    return 'downgrade';
  }
  return 'same';
}

function parse(v) {
  if (typeof v !== 'string') return null;
  const cleaned = v.trim().replace(/^[~^v=]+/, '');
  const m = cleaned.match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

function compareTrees(prevTree, nextTree) {
  const removed = [];
  const added = [];
  const modified = [];
  const prevSet = new Set(prevTree || []);
  const nextSet = new Set(nextTree || []);
  for (const f of nextSet) if (!prevSet.has(f)) added.push(f);
  for (const f of prevSet) if (!nextSet.has(f)) removed.push(f);
  return { added, removed, modified };
}

function tierForVersionDelta(delta) {
  if (delta === 'downgrade') return 'tier1';
  if (delta === 'major') return 'tier3';
  return 'clean';
}

module.exports = { bumpType, compareTrees, tierForVersionDelta, parse };
