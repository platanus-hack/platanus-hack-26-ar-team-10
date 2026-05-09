'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const PROTECTED_PATTERNS = [
  /(?:^|\/)\.claude\/plugins\/yieldos\//,
  /(?:^|\/)\.claude-plugin\/(?:plugin\.json|hooks\/|scripts\/|policy-cache\/|config\/)/,
  /(?:^|\/)security\/dependency-events\.md$/,
  /(?:^|\/)security\/code-audit-events\.md$/,
  /(?:^|\/)security\/code-audit-state\.json$/,
  /(?:^|\/)security\/yieldos-rewrites\.json$/,
  /(?:^|\/)security\/\.yieldos-instruction-hashes\.json$/,
];

function matchesProtectedPattern(filepath) {
  if (typeof filepath !== 'string') return false;
  // Normalize windows separators and resolve `..`/`.` segments before matching.
  const normalized = path.normalize(filepath).replace(/\\/g, '/');
  return PROTECTED_PATTERNS.some((re) => re.test(normalized));
}

function realpathSafe(filepath) {
  // Three layered strategies, each catching attacks the previous can't:
  //   (a) realpathSync — resolves symlinks and normalizes (best when target exists)
  //   (b) readlinkSync — reads the literal symlink target (catches DANGLING symlinks
  //       that point at a protected file the attacker plans to create)
  //   (c) walk up to closest existing ancestor and re-append the missing tail
  //       (catches symlinks higher up the tree, e.g. `proj-link → real-proj`)
  try {
    return fs.realpathSync.native(filepath);
  } catch (_) { /* fall through */ }

  try {
    const linkTarget = fs.readlinkSync(filepath);
    // Resolve the link target relative to the link's parent directory.
    return path.resolve(path.dirname(filepath), linkTarget);
  } catch (_) { /* not a symlink, fall through */ }

  let current = filepath;
  let suffix = '';
  while (current && current !== path.dirname(current)) {
    const parent = path.dirname(current);
    try {
      const resolved = fs.realpathSync.native(parent);
      return path.join(resolved, suffix ? path.join(path.basename(current), suffix) : path.basename(current));
    } catch (_) {
      suffix = suffix ? path.join(path.basename(current), suffix) : path.basename(current);
      current = parent;
    }
  }
  return path.resolve(filepath);
}

function isProtectedPath(filepath) {
  if (typeof filepath !== 'string') return false;
  // Two-pass check: (1) raw match catches obvious cases, (2) realpath match
  // catches symlinks and `../` traversal that would otherwise sneak past the
  // first regex. A path is protected if EITHER pass matches.
  if (matchesProtectedPattern(filepath)) return true;
  const real = realpathSafe(filepath);
  if (real !== filepath && matchesProtectedPattern(real)) return true;
  return false;
}

function isYieldosOwnRoot(filepath, pluginRoot) {
  if (typeof filepath !== 'string') return false;
  const norm = path.resolve(filepath);
  return norm.startsWith(path.resolve(pluginRoot));
}

function isYieldosPolicyAccessLegitimate(callerPath, targetPath) {
  // Only the plugin's own scripts may modify protected files. Identified by
  // the resolver path coming from inside the plugin tree.
  return typeof callerPath === 'string' && typeof targetPath === 'string' && callerPath.includes('/yieldos/');
}

module.exports = { isProtectedPath, isYieldosOwnRoot, isYieldosPolicyAccessLegitimate, PROTECTED_PATTERNS };
