'use strict';

const {
  codeShape,
  makeFinding,
  parseChangedLines,
} = require('./shared');

function missingAuthz(item) {
  if (item.sign !== '+') return null;
  const route = /^\s*(?:app|router)\s*\.\s*(?:get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/.exec(item.code);
  if (!route) return null;
  if (!/(admin|private|settings|billing|users|account|dashboard)/i.test(route[1])) return null;
  if (hasRouteAuthGuard(item.code)) return null;
  return makeFinding(item, 'missing-authz', 'high', 'Sensitive route without auth guard', {
    attackerControlledInput: 'Any unauthenticated HTTP client can request the new sensitive route.',
    vulnerableSink: 'Route handler for privileged application data or actions.',
    exploitPath: 'A direct request to the route reaches the handler without an auth or role middleware.',
    impact: 'Unauthorized access to administrative or private user data.',
    fixStrategy: 'manual',
  });
}

const AUTH_GUARD_RE = /\b(?:requireAuth|authorize|authMiddleware|isAdmin|requireRole|ensureAuth)\b/;

function hasRouteAuthGuard(line) {
  const args = routeCallArgs(line);
  if (!args || args.length < 2) return false;

  for (const arg of args.slice(1)) {
    if (isRouteHandler(arg)) return false;
    if (AUTH_GUARD_RE.test(arg)) return true;
  }
  return false;
}

function isRouteHandler(arg) {
  const text = String(arg || '').trim();
  return text.includes('=>') || /^async\s+function\b/.test(text) || /^function\b/.test(text);
}

function routeCallArgs(line) {
  const match = /\b(?:app|router)\s*\.\s*(?:get|post|put|patch|delete)\s*\(/i.exec(line || '');
  if (!match) return null;
  return splitTopLevelArgs(String(line).slice(match.index + match[0].length));
}

function splitTopLevelArgs(input) {
  const args = [];
  let current = '';
  let depth = 0;
  let quote = '';
  let escaped = false;

  for (const ch of input) {
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\' && quote) {
      current += ch;
      escaped = true;
      continue;
    }
    if (quote) {
      current += ch;
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') {
      depth += 1;
      current += ch;
      continue;
    }
    if (ch === ')' || ch === ']' || ch === '}') {
      if (depth === 0 && ch === ')') {
        if (current.trim()) args.push(current.trim());
        return args;
      }
      depth = Math.max(0, depth - 1);
      current += ch;
      continue;
    }
    if (ch === ',' && depth === 0) {
      args.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  return args;
}

function removedValidation(item, input) {
  if (item.sign !== '-') return null;
  const code = codeShape(item.code);
  const hasGuardToken = /(req\.user|requireAuth|authorize|isAdmin|requireRole|schema\.parse|z\.object|permission|role)/i.test(code)
    || /\bvalidate[A-Za-z0-9_]*\s*\(/.test(code);
  if (!hasGuardToken) return null;
  if (hasAddedGuardReplacement(item, input)) return null;
  if (!/(?:\bif\s*\(|\breturn\b|=>|[;{}()])/.test(code)) return null;
  return makeFinding(item, 'removed-security-guard', 'high', 'Security guard removed', {
    attackerControlledInput: 'External input may reach downstream code without validation.',
    vulnerableSink: 'Removed authentication, authorization, or validation guard.',
    exploitPath: 'A request that was previously rejected can now reach protected logic.',
    impact: 'Authorization, injection, or integrity checks can be bypassed.',
    fixStrategy: 'manual',
  });
}

function hasAddedGuardReplacement(item, input) {
  return parseChangedLines(input?.diff || '').some((candidate) => {
    if (candidate.file !== item.file || candidate.sign !== '+') return false;
    const code = codeShape(candidate.code);
    return /(req\.user|requireAuth|authorize|isAdmin|requireRole|schema\.parse|z\.object|permission|role)/i.test(code)
      || /\bvalidate[A-Za-z0-9_]*\s*\(/.test(code);
  });
}

module.exports = {
  hasRouteAuthGuard,
  missingAuthz,
  removedValidation,
};
