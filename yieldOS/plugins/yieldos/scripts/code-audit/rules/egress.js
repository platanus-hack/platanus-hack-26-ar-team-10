'use strict';

const { codeShape, makeFinding } = require('./shared');

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

module.exports = {
  openRedirect,
  pathTraversal,
  shellInjection,
  sqlInjection,
  ssrf,
  unboundedBodyRead,
  unsafeErrorResponse,
  unsafeFileMutation,
};
