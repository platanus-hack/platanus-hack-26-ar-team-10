'use strict';

const FINDERS = [
  sensitiveLogging,
  hardcodedSecret,
  missingAuthz,
  sqlInjection,
  shellInjection,
  pathTraversal,
  unsafeFileMutation,
  ssrf,
  openRedirect,
  removedValidation,
  dangerousInstructionEdit,
];

function redTeam(input) {
  const lines = parseChangedLines(input.diff || '');
  const findings = [];
  for (const item of lines) {
    if (isAuditExemptFile(item.file)) continue;
    for (const finder of FINDERS) {
      const finding = finder(item, input);
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
  if (/(requireAuth|authorize|authMiddleware|isAdmin|requireRole|ensureAuth)/.test(item.code)) return null;
  return makeFinding(item, 'missing-authz', 'high', 'Sensitive route without auth guard', {
    attackerControlledInput: 'Any unauthenticated HTTP client can request the new sensitive route.',
    vulnerableSink: 'Route handler for privileged application data or actions.',
    exploitPath: 'A direct request to the route reaches the handler without an auth or role middleware.',
    impact: 'Unauthorized access to administrative or private user data.',
    fixStrategy: 'manual',
  });
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
  if (!/(?:^|[^\w.])(?:exec|execSync)\s*\(/.test(item.code)) return null;
  if (!/(\+|\$\{|\breq\.|\bprocess\.argv\b)/.test(item.code)) return null;
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
  if (!/\bpath\.join\s*\(/.test(item.code)) return null;
  if (!/(req\.(?:params|query|body)|process\.argv)/.test(item.code)) return null;
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
  if (!/\bfs\.(?:writeFile|writeFileSync|rm|rmSync|unlink|unlinkSync)\s*\(/.test(item.code)) return null;
  if (!/(req\.(?:params|query|body)|process\.argv)/.test(item.code)) return null;
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
  if (!/\bfetch\s*\(/.test(item.code)) return null;
  if (!/(req\.(?:params|query|body)|process\.argv)/.test(item.code)) return null;
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
  if (!/\bres\.redirect\s*\(/.test(item.code)) return null;
  if (!/(req\.(?:params|query|body)|process\.argv)/.test(item.code)) return null;
  return makeFinding(item, 'open-redirect', 'medium', 'User-controlled redirect target', {
    attackerControlledInput: 'Request data controls the redirect destination.',
    vulnerableSink: 'HTTP redirect response.',
    exploitPath: 'A crafted URL sends users to an attacker-controlled site.',
    impact: 'Phishing, token leakage through redirect flows, or login abuse.',
    fixStrategy: 'replace-redirect-root',
  });
}

function removedValidation(item) {
  if (item.sign !== '-') return null;
  if (!/(req\.user|requireAuth|authorize|isAdmin|requireRole|validate|schema\.parse|z\.object|permission|role)/i.test(item.code)) return null;
  return makeFinding(item, 'removed-security-guard', 'high', 'Security guard removed', {
    attackerControlledInput: 'External input may reach downstream code without validation.',
    vulnerableSink: 'Removed authentication, authorization, or validation guard.',
    exploitPath: 'A request that was previously rejected can now reach protected logic.',
    impact: 'Authorization, injection, or integrity checks can be bypassed.',
    fixStrategy: 'manual',
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
  return /(?:^|\/)(?:tests?|__tests__|fixtures?)\//.test(normalized) || /\.test\.[cm]?[jt]sx?$/.test(normalized);
}

module.exports = { redTeam, parseAddedLines, parseChangedLines, hasExploitEvidence, isAuditExemptFile };
