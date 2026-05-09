'use strict';

function ecosystemFor(candidate) {
  if (['npm', 'pnpm', 'yarn', 'bun'].includes(candidate.manager)) return 'npm';
  if (['pip', 'poetry', 'uv'].includes(candidate.manager)) return 'python';
  if (candidate.manager === 'cargo') return 'cargo';
  if (candidate.manager === 'go') return 'go';
  if (candidate.manager === 'skills') return 'skill';
  if (candidate.manager === 'git') return 'repo';
  if (candidate.manager === 'curl-pipe-shell') return 'binary';
  return candidate.manager || 'unknown';
}

function versionDelim(ecosystem) {
  return ecosystem === 'python' ? '==' : '@';
}

function fullKey(candidate) {
  const eco = ecosystemFor(candidate);
  const delim = versionDelim(eco);
  return `${eco}:${candidate.name}${delim}${candidate.version}`;
}

function nameKey(candidate) {
  return `${ecosystemFor(candidate)}:${candidate.name}`;
}

function isAllowlisted(candidate, allowlist) {
  if (!allowlist || !Array.isArray(allowlist.entries)) return false;
  const fk = fullKey(candidate);
  const nk = nameKey(candidate);
  // Exact matches always pass. Name-only entries trust the package name, while
  // decide.js separately checks concrete pinned versions against the registry.
  const namePrefix = nk + (ecosystemFor(candidate) === 'python' ? '==' : '@');
  const noVersion = !candidate.version || candidate.version === 'latest' || candidate.version === 'unspecified';
  return allowlist.entries.some((e) => {
    if (e.key === fk || e.key === nk) return true;
    if (noVersion && typeof e.key === 'string' && e.key.startsWith(namePrefix)) return true;
    return false;
  });
}

function matchedByNameOnly(candidate, allowlist) {
  if (!allowlist || !Array.isArray(allowlist.entries)) return false;
  const fk = fullKey(candidate);
  const nk = nameKey(candidate);
  const exactMatch = allowlist.entries.some((e) => e.key === fk);
  if (exactMatch) return false;
  return allowlist.entries.some((e) => e.key === nk);
}

function isDenylisted(candidate, denylist) {
  if (!denylist || !Array.isArray(denylist.entries)) return null;
  const fk = fullKey(candidate);
  const nk = nameKey(candidate);
  const namePrefix = nk + (ecosystemFor(candidate) === 'python' ? '==' : '@');
  const noVersion = !candidate.version || candidate.version === 'latest' || candidate.version === 'unspecified';
  const entry = denylist.entries.find((e) => {
    if (e.key === fk || e.key === nk) return true;
    if (noVersion && typeof e.key === 'string' && e.key.startsWith(namePrefix)) return true;
    return false;
  });
  return entry || null;
}

function nativeEquivalent(candidate, natives) {
  if (!natives || !natives.entries) return null;
  return natives.entries[nameKey(candidate)] || null;
}

function isBuildScriptApproved(candidate, buildScriptsAllowed) {
  if (!buildScriptsAllowed || !Array.isArray(buildScriptsAllowed.entries)) return false;
  return buildScriptsAllowed.entries.some((e) => e.key === nameKey(candidate));
}

module.exports = { ecosystemFor, fullKey, nameKey, isAllowlisted, matchedByNameOnly, isDenylisted, nativeEquivalent, isBuildScriptApproved };
