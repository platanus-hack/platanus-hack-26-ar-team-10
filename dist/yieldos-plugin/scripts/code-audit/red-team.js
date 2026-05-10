'use strict';

const { findDocsExampleSecret, isDocsExampleFile } = require('./doc-secrets');

const FINDERS = [
  docsExampleSecret,
  sensitiveLogging,
  hardcodedSecret,
  missingAuthz,
  sqlInjection,
  shellInjection,
  pathTraversal,
  unsafeFileMutation,
  ssrf,
  openRedirect,
  unsafeErrorResponse,
  unboundedBodyRead,
  removedValidation,
  dangerousInstructionEdit,
];

function redTeam(input) {
  const lines = parseChangedLines(input.diff || '');
  const findings = [];
  for (const item of lines) {
    if (isAuditExemptFile(item.file)) {
      const finding = docsExampleSecret(item);
      if (finding && hasExploitEvidence(finding)) findings.push(finding);
      continue;
    }
    for (const finder of FINDERS) {
      const finding = finder(item, input, lines);
      if (finding && hasExploitEvidence(finding)) findings.push(finding);
    }
  }
  return findings;
}

function parseAddedLines(diff) {
  return parseChangedLines(diff).filter((item) => item.sign === '+');
}

function parseChangedLines(diff) {
  const out = [];
  let file = null;
  for (const raw of diff.split(/\r?\n/)) {
    if (raw.startsWith('+++ b/')) {
      file = raw.slice(6);
      continue;
    }
    if ((!raw.startsWith('+') && !raw.startsWith('-')) || raw.startsWith('+++') || raw.startsWith('---')) continue;
    out.push({ file, code: raw.slice(1), sign: raw[0], raw });
  }
  return out;
}

function hasExploitEvidence(finding) {
  return Boolean(
    finding.attackerControlledInput &&
    finding.vulnerableSink &&
    finding.exploitPath &&
    finding.impact
  );
}

function makeFinding(item, ruleId, severity, title, details) {
  return {
    ruleId,
    severity,
    title,
    file: item.file || 'unknown',
    line: item.code.trim(),
    ...details,
  };
}

function docsExampleSecret(item) {
  if (item.sign !== '+') return null;
  if (!isDocsExampleFile(item.file)) return null;
  if (!findDocsExampleSecret(item.code)) return null;
  return makeFinding(item, 'docs-example-secret', 'high', 'Secret-like value in docs example', {
    attackerControlledInput: 'A real-looking credential is added to tracked documentation or example configuration.',
    vulnerableSink: 'Repository documentation or example configuration files.',
    exploitPath: 'A repository reader can copy the credential-looking value from docs or an agent can reuse it in future examples.',
    impact: 'Credential disclosure risk and unsafe secret-handling patterns copied into downstream work.',
    fixStrategy: 'redact-doc-secret',
  });
}

function sensitiveLogging(item) {
  if (item.sign !== '+') return null;
  if (!/\bconsole\.(?:log|debug|info|warn|error)\s*\(/.test(item.code)) return null;
  if (!/(process\.env|token|secret|password|passwd|api[_-]?key|authorization|bearer)/i.test(item.code)) return null;
  return makeFinding(item, 'sensitive-logging', 'high', 'Sensitive value logged', {
    attackerControlledInput: 'Runtime secrets or credentials can enter process.env or request context.',
    vulnerableSink: 'Application log output.',
    exploitPath: 'An attacker or insider with log access can recover secrets emitted by this statement.',
    impact: 'Credential disclosure and possible account or infrastructure compromise.',
    fixStrategy: 'remove-line',
  });
}

function hardcodedSecret(item) {
  if (item.sign !== '+') return null;
  const quotedSecret = /(?:api[_-]?key|secret|token|password|passwd)\s*[:=]\s*['"][^'"]{12,}['"]/i;
  const providerToken = /['"](?:sk|ghp|xox[abprs])-?[A-Za-z0-9_-]{16,}['"]/;
  if (!quotedSecret.test(item.code) && !providerToken.test(item.code)) return null;
  return makeFinding(item, 'hardcoded-secret', 'critical', 'Hardcoded secret introduced', {
    attackerControlledInput: 'The committed source tree is readable by anyone with repository access.',
    vulnerableSink: 'Secret literal in source code.',
    exploitPath: 'A repository reader can copy the credential directly from the commit.',
    impact: 'Credential compromise; the secret must be rotated.',
    fixStrategy: 'manual',
  });
}

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

function sqlInjection(item) {
  if (item.sign !== '+') return null;
  if (!/\b(?:query|execute|raw)\s*\(/i.test(item.code)) return null;
  if (!/(SELECT|INSERT|UPDATE|DELETE).*(\+|\$\{)/i.test(item.code)) return null;
  return makeFinding(item, 'sql-injection', 'high', 'Interpolated SQL query', {
    attackerControlledInput: 'Request or user-controlled values can be concatenated into SQL.',
    vulnerableSink: 'Database query execution.',
    exploitPath: 'A crafted input changes the query structure before it reaches the database.',
    impact: 'Data exposure, data modification, or authentication bypass.',
    fixStrategy: 'manual',
  });
}

function shellInjection(item) {
  if (item.sign !== '+') return null;
  const code = codeShape(item.code);
  if (!/(?:^|[^\w.])(?:exec|execSync)\s*\(/.test(code)) return null;
  if (!/(\+|\$\{|\breq\.|\bprocess\.argv\b)/.test(code)) return null;
  return makeFinding(item, 'shell-injection', 'high', 'Interpolated shell command', {
    attackerControlledInput: 'Request, argument, or variable data can reach a shell command.',
    vulnerableSink: 'child_process shell execution.',
    exploitPath: 'A crafted value injects shell metacharacters into the executed command.',
    impact: 'Remote command execution in the application environment.',
    fixStrategy: 'manual',
  });
}

function pathTraversal(item) {
  if (item.sign !== '+') return null;
  const code = codeShape(item.code);
  if (!/\bpath\.join\s*\(/.test(code)) return null;
  if (!/(req\.(?:params|query|body)|process\.argv)/.test(code)) return null;
  return makeFinding(item, 'path-traversal', 'high', 'User-controlled filesystem path', {
    attackerControlledInput: 'Route, query, body, or CLI input controls a path segment.',
    vulnerableSink: 'Filesystem path construction.',
    exploitPath: 'A ../ payload can escape the intended directory.',
    impact: 'Unauthorized file read, overwrite, or delete.',
    fixStrategy: 'manual',
  });
}

function unsafeFileMutation(item) {
  if (item.sign !== '+') return null;
  const code = codeShape(item.code);
  if (!/\bfs\.(?:writeFile|writeFileSync|rm|rmSync|unlink|unlinkSync)\s*\(/.test(code)) return null;
  if (!/(req\.(?:params|query|body)|process\.argv)/.test(code)) return null;
  return makeFinding(item, 'unsafe-file-mutation', 'high', 'User-controlled file mutation', {
    attackerControlledInput: 'Route, query, body, or CLI input controls the file target.',
    vulnerableSink: 'Filesystem write or delete operation.',
    exploitPath: 'A crafted path changes or deletes a file outside the intended boundary.',
    impact: 'Data loss, persistence tampering, or local privilege abuse.',
    fixStrategy: 'manual',
  });
}

function ssrf(item) {
  if (item.sign !== '+') return null;
  const code = codeShape(item.code);
  if (!/\bfetch\s*\(/.test(code)) return null;
  if (!/(req\.(?:params|query|body)|process\.argv)/.test(code)) return null;
  return makeFinding(item, 'ssrf', 'high', 'User-controlled outbound request', {
    attackerControlledInput: 'Request or argument data controls the outbound URL.',
    vulnerableSink: 'Server-side HTTP request.',
    exploitPath: 'A crafted URL makes the server call internal metadata or private services.',
    impact: 'Internal network exposure or credential theft.',
    fixStrategy: 'manual',
  });
}

function openRedirect(item) {
  if (item.sign !== '+') return null;
  const code = codeShape(item.code);
  if (!/\bres\.redirect\s*\(/.test(code)) return null;
  if (!/(req\.(?:params|query|body)|process\.argv)/.test(code)) return null;
  return makeFinding(item, 'open-redirect', 'medium', 'User-controlled redirect target', {
    attackerControlledInput: 'Request data controls the redirect destination.',
    vulnerableSink: 'HTTP redirect response.',
    exploitPath: 'A crafted URL sends users to an attacker-controlled site.',
    impact: 'Phishing, token leakage through redirect flows, or login abuse.',
    fixStrategy: 'replace-redirect-root',
  });
}

function unsafeErrorResponse(item) {
  if (item.sign !== '+') return null;
  const code = codeShape(item.code);
  const writesClientResponse = /\b(?:res|response)\s*\.\s*(?:status\s*\(\s*5\d\d\s*\)\s*\.\s*)?(?:json|send|end)\s*\(/.test(code);
  if (!writesClientResponse) return null;
  if (!/\b(?:err|error|e)\s*\.\s*(?:message|stack)\b/.test(code)) return null;
  return makeFinding(item, 'security-misconfiguration', 'medium', 'Raw error details returned to client', {
    attackerControlledInput: 'Unexpected request paths can trigger server exceptions.',
    vulnerableSink: 'HTTP error response body.',
    exploitPath: 'A failing request receives raw exception details that may expose internals, schema, dependency messages, or future secret-bearing errors.',
    impact: 'Information disclosure and easier attack discovery.',
    fixStrategy: 'manual',
  });
}

function unboundedBodyRead(item, input, lines) {
  if (item.sign !== '+') return null;
  if (!/\b(?:req|request)\s*\.\s*on\s*\(\s*['"]data['"]/.test(item.code)) return null;
  const code = codeShape(item.code);
  if (!/(?:\+=|\.push\s*\(|Buffer\.concat\s*\()/.test(code)) return null;
  if (hasBodyLimit(item.code) || hasNearbyBodyLimit(item, lines)) return null;
  return makeFinding(item, 'unrestricted-resource-consumption', 'medium', 'Unbounded request body buffering', {
    attackerControlledInput: 'An HTTP client controls the request body size.',
    vulnerableSink: 'In-memory request body accumulation.',
    exploitPath: 'A large or streaming request can keep appending chunks without a byte cap before parsing or rejection.',
    impact: 'Memory exhaustion, request worker starvation, or token/cost amplification in downstream handlers.',
    fixStrategy: 'manual',
  });
}

function hasNearbyBodyLimit(item, lines) {
  const changedLines = Array.isArray(lines) ? lines : [];
  const itemIndex = changedLines.indexOf(item);
  return changedLines.some((candidate, candidateIndex) => {
    if (itemIndex !== -1 && Math.abs(candidateIndex - itemIndex) > 2) return false;
    return candidate.file === item.file
      && candidate.sign === '+'
      && hasBodyLimit(candidate.code);
  });
}

function hasBodyLimit(code) {
  const line = String(code || '');
  if (!/\b(?:MAX_BODY|MAX_BYTES|BODY_LIMIT|content-length|contentLength|byteLength|bytesRead|body\.length|chunks\.length|limit)\b/i.test(line)) return false;
  return /(?:>|>=|destroy|413|too large|abort|return|throw)/i.test(line);
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

function dangerousInstructionEdit(item) {
  if (item.sign !== '+') return null;
  if (!/(CLAUDE\.md|AGENTS\.md|\.cursorrules)$/i.test(item.file || '')) return null;
  if (!/(ignore previous|disable yieldos|do not log|without confirmation)/i.test(item.code)) return null;
  return makeFinding(item, 'dangerous-instruction-edit', 'critical', 'Dangerous agent instruction edit', {
    attackerControlledInput: 'Repository instructions control future agent behavior.',
    vulnerableSink: 'Agent instruction file.',
    exploitPath: 'A future agent follows the injected instruction and bypasses controls.',
    impact: 'Security tooling can be disabled or hidden by prompt injection.',
    fixStrategy: 'manual',
  });
}

function isAuditExemptFile(file) {
  const normalized = String(file || '').replace(/\\/g, '/');
  if (/(?:^|\/)(?:AGENTS|CLAUDE)\.md$/i.test(normalized) || /\.cursorrules$/i.test(normalized)) return false;
  if (normalized.startsWith('dist/yieldos-plugin/')) return true;
  return /(?:^|\/)(?:tests?|__tests__|fixtures?)\//.test(normalized)
    || /\.test\.[cm]?[jt]sx?$/.test(normalized)
    || /\.(?:md|mdx|txt)$/i.test(normalized);
}

function codeShape(code) {
  return stripRegexLiterals(stripQuotedStrings(String(code || '')));
}

function stripQuotedStrings(code) {
  return code.replace(/(['"])(?:\\.|(?!\1)[\s\S])*\1/g, '$1$1');
}

function stripRegexLiterals(code) {
  return code.replace(/(^|[=(:,\[{!&|?;]\s*)\/(?:\\.|[^/\\\n])+\/[dgimsuy]*/g, '$1//');
}

module.exports = {
  redTeam,
  parseAddedLines,
  parseChangedLines,
  hasExploitEvidence,
  hasRouteAuthGuard,
  isAuditExemptFile,
  stripQuotedStrings,
  stripRegexLiterals,
};
