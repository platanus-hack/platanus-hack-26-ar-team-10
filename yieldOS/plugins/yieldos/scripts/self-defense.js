'use strict';

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

function isProtectedPath(filepath) {
  if (typeof filepath !== 'string') return false;
  const normalized = path.normalize(filepath).replace(/\\/g, '/');
  return PROTECTED_PATTERNS.some((re) => re.test(normalized));
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
