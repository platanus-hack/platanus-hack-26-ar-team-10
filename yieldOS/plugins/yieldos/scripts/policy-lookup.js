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
  // Match logic (strict):
  //   - Exact <name>@<version>  → always matches.
  //   - Name-only entry         → matches ONLY if candidate has no pinned version.
  //   - Name-prefix             → matches ONLY if candidate has no pinned version.
  // Goal: a candidate that pins a fake version like "999.999.999" or "0.0.0" cannot
  // hide behind a name-only allowlist entry; it must go through the analyzer which
  // will detect metadata-unavailable and block.
  const namePrefix = nk + (ecosystemFor(candidate) === 'python' ? '==' : '@');
  const noVersion = !candidate.version || candidate.version === 'latest' || candidate.version === 'unspecified';
  return allowlist.entries.some((e) => {
    if (e.key === fk) return true;
    if (noVersion && (e.key === nk || (typeof e.key === 'string' && e.key.startsWith(namePrefix)))) return true;
    return false;
  });
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

module.exports = { ecosystemFor, fullKey, nameKey, isAllowlisted, isDenylisted, nativeEquivalent, isBuildScriptApproved };
