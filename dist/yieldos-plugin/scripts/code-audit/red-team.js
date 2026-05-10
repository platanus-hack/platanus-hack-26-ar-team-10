'use strict';

const { findDocsExampleSecret, isDocsExampleFile } = require('./doc-secrets');

const FINDERS = [
  docsExampleSecret,
  sensitiveLogging,
  hardcodedSecret,
  weakSecretDefault,
  failOpenWebhookSignature,
  missingAuthz,
  unauthenticatedAgentRuntimeProxy,
  unauthenticatedBinaryObjectRoute,
  unauthenticatedServiceRouteMutation,
  unscopedBulkDelete,
  generatedSqlToSensitiveSink,
  sqlInjection,
  shellInjection,
  pathTraversal,
  unsafeFileMutation,
  ssrf,
  openRedirect,
  unsafeErrorResponse,
  unsafeHtmlSink,
  cookieTokenExposure,
  agentCallbackWithoutAuth,
  publicSecurityDefiner,
  electronSecurityMisconfiguration,
  electronRendererControlledFetch,
  mobileDebugLoggingTree,
  unboundedUploadFileRead,
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
  const consoleLog = /\bconsole\.(?:log|debug|info|warn|error)\s*\(/.test(item.code)
    && /(process\.env|token|secret|password|passwd|api[_-]?key|authorization|bearer)/i.test(item.code);
  const mobileLog = isMobileLogCall(item) && hasSensitiveMobileLogPayload(item.code);
  if (!consoleLog && !mobileLog) return null;
  return makeFinding(item, 'sensitive-logging', 'high', 'Sensitive value logged', {
    attackerControlledInput: 'Runtime secrets, credentials, speech transcripts, messages, contacts, or action URLs can enter app context.',
    vulnerableSink: 'Application log output.',
    exploitPath: 'An attacker or insider with log access can recover sensitive values emitted by this statement.',
    impact: 'Credential or PII disclosure and possible account, infrastructure, or user privacy compromise.',
    fixStrategy: 'remove-line',
  });
}

function isMobileLogCall(item) {
  const file = String(item.file || '');
  if (!/\.(?:kt|java)$/i.test(file)) return false;
  return /\b(?:Timber(?:\.tag\s*\([^)]*\))?\s*\.\s*(?:v|d|i|w|e)|Log\s*\.\s*(?:v|d|i|w|e))\s*\(/.test(item.code);
}

function hasSensitiveMobileLogPayload(code) {
  const line = String(code || '');
  if (!/[,$]|\$\{/.test(line)) return false;
  return /(token|secret|password|passwd|api[_-]?key|authorization|bearer|text|message|uri|url|phone|contact|email|address|location|stt|tts|speech|transcript|voice|command\.text|normalizedText|spec\.uri|canonicalName|pendingMessage)/i.test(line);
}

function hardcodedSecret(item) {
  if (item.sign !== '+') return null;
  const secretName = '(?:api[_-]?key|private[_-]?key|encryption[_-]?key|secret|token|password|passwd)';
  const quotedSecret = new RegExp(`${secretName}\\s*[:=]\\s*['"][^'"]{12,}['"]`, 'i');
  const envLikeSecret = new RegExp(`['"][A-Z0-9_]*${secretName.replace(/\\/g, '\\\\')}\\s*=\\s*([A-Za-z0-9._~+/=-]{24,})['"]`, 'i');
  const providerToken = /['"](?:sk|ghp|xox[abprs])-?[A-Za-z0-9_-]{16,}['"]/;
  const envMatch = envLikeSecret.exec(item.code);
  const hasEnvSecret = envMatch && !isPlaceholderSecretLiteral(envMatch[1]);
  if (!quotedSecret.test(item.code) && !providerToken.test(item.code) && !hasEnvSecret) return null;
  return makeFinding(item, 'hardcoded-secret', 'critical', 'Hardcoded secret introduced', {
    attackerControlledInput: 'The committed source tree is readable by anyone with repository access.',
    vulnerableSink: 'Secret literal in source code.',
    exploitPath: 'A repository reader can copy the credential directly from the commit.',
    impact: 'Credential compromise; the secret must be rotated.',
    fixStrategy: 'manual',
  });
}

function weakSecretDefault(item) {
  if (item.sign !== '+') return null;
  if (!isRuntimeCodeFile(item.file)) return null;
  const credentialName = /(?:(?:jwt|session|cookie|signing|auth|admin|api|access|gateway|webhook).{0,50}(?:secret|token|key)|(?:secret|token|key).{0,50}(?:jwt|session|cookie|signing|auth|admin|api|access|gateway|webhook))/i;
  if (!credentialName.test(item.code)) {
    return null;
  }
  const defaultMatch = /(?:=\s*|\.default\s*\(\s*|default\s*=\s*|SecretStr\s*\(\s*)['"]([^'"]{4,})['"]/.exec(item.code);
  if (!defaultMatch || !isKnownWeakSecretLiteral(defaultMatch[1])) return null;

  return makeFinding(item, 'security-misconfiguration', 'high', 'Known default credential protects authentication', {
    attackerControlledInput: 'A deployment can start without setting the runtime JWT, session, cookie, admin token, or signing secret.',
    vulnerableSink: 'Authentication, admin API, or session signing configuration.',
    exploitPath: 'An attacker who knows the committed default can forge or validate security tokens when production inherits the fallback.',
    impact: 'Authentication bypass or session forgery if the environment secret is missing or misconfigured.',
    fixStrategy: 'manual',
  });
}

function isKnownWeakSecretLiteral(value) {
  const normalized = String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!normalized || normalized.length < 4) return false;
  if (/^(dev|test|demo|dummy|sample|example|default|changeme|change-me|please-change|your-secret|secret|password|insecure)(?:-|$)/.test(normalized)) {
    return true;
  }
  return /(?:dev-only|change-me|changeme|do-not-use|not-for-prod|replace-me|super-secret|supersecret)/.test(normalized);
}

function isPlaceholderSecretLiteral(value) {
  const normalized = String(value || '').toLowerCase();
  if (!normalized) return true;
  if (/(redacted|your[_-]?|placeholder|example|dummy|fake|test|change[_-]?me)/i.test(normalized)) return true;
  const compact = normalized.replace(/[^a-z0-9]/g, '');
  if (compact.length < 24) return true;
  return /^(x+|0+|1+|a+|abc123+)$/.test(compact);
}

function failOpenWebhookSignature(item, input) {
  if (item.sign !== '+') return null;
  const file = String(item.file || '').replace(/\\/g, '/');
  if (!isJavaScriptLikeFile(file)) return null;
  if (!/(?:webhook|callback)/i.test(file)) return null;
  if (!/(?:accepting unsigned|skip(?:ping)? verification|without signature|unsigned payload|no signature required)/i.test(item.code)) {
    return null;
  }

  const sameFileAdded = addedTextForFile(input, item.file);
  if (!/\b[A-Z0-9_]*WEBHOOK[A-Z0-9_]*(?:SECRET|SIGNING|SIGNATURE)|webhook[_-]?secret|signing[_-]?secret/i.test(sameFileAdded)) {
    return null;
  }
  if (hasProductionWebhookFailClosed(sameFileAdded)) return null;

  return makeFinding(item, 'security-misconfiguration', 'high', 'Webhook signature check fails open', {
    attackerControlledInput: 'An external HTTP client can send provider-style webhook payloads when the signing secret is unset.',
    vulnerableSink: 'Webhook handler that accepts unsigned payloads instead of failing closed.',
    exploitPath: 'A misconfigured deployment without the webhook secret processes forged callbacks, messages, or status updates.',
    impact: 'Unauthorized state changes, fake provider events, message injection, or callback abuse.',
    fixStrategy: 'manual',
  });
}

function hasProductionWebhookFailClosed(text) {
  return /if\s*\(\s*!\s*[^)]*(?:WEBHOOK[A-Z0-9_]*(?:SECRET|SIGNING|SIGNATURE)|webhookSecret|signingSecret)[^)]*\)[\s\S]{0,180}(?:500|503|throw|not configured|missing webhook secret|missing signing secret)/i.test(text);
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

function unauthenticatedAgentRuntimeProxy(item, input) {
  if (item.sign !== '+') return null;
  if (!isJavaScriptLikeFile(item.file)) return null;
  if (!/\b(?:runtimeClient|configStore)\s*\.\s*(?:listAgents|getFiles|getAgentFiles|updateFiles|updateAgentFiles|sendMessage|sendMessageToAgent)\s*\(/.test(item.code)) {
    return null;
  }

  const sameFileAdded = addedTextForFile(input, item.file);
  if (!/(?:app|router)\s*\.\s*(?:get|post|put|patch)\s*\(\s*['"`][^'"`]*(?:agents?|workspaces?)[^'"`]*['"`]/i.test(sameFileAdded)) {
    return null;
  }
  if (hasExpressRouteAuthGuardInText(sameFileAdded) || hasNextRouteSecurityControl(sameFileAdded)) return null;

  return makeFinding(item, 'missing-authz', 'high', 'Public agent runtime proxy without auth', {
    attackerControlledInput: 'An unauthenticated HTTP client can choose agent, workspace, or file identifiers in the public route.',
    vulnerableSink: 'Server-side proxy call into an internal agent runtime/admin API.',
    exploitPath: 'A direct request to the public route reuses the server admin token and reaches agent file or runtime operations.',
    impact: 'Unauthorized disclosure or mutation of agent identity, instruction, workspace, or runtime state.',
    fixStrategy: 'manual',
  });
}

function unauthenticatedServiceRouteMutation(item, input) {
  if (item.sign !== '+') return null;
  const file = String(item.file || '').replace(/\\/g, '/');
  if (!isJavaScriptLikeFile(file)) return null;
  if (!/(?:^|\/)app\/api\//i.test(file)) return null;

  const sameFileAdded = addedTextForFile(input, item.file);
  if (!/\bexport\s+(?:async\s+function\s+(?:POST|PUT|PATCH|DELETE)|const\s+(?:POST|PUT|PATCH|DELETE))\b/.test(sameFileAdded)) return null;
  if (!hasServiceRoleOrOutboundSend(sameFileAdded)) return null;
  if (!isServiceRouteMutationLine(item.code)) return null;
  if (hasNextRouteSecurityControl(sameFileAdded)) return null;

  return makeFinding(item, 'missing-authz', 'high', 'Service route mutates state without auth', {
    attackerControlledInput: 'An unauthenticated HTTP client can submit JSON, ids, contact data, or message bodies to the route.',
    vulnerableSink: 'Next.js API route using a service-role/admin client or outbound provider send primitive.',
    exploitPath: 'Calling the route directly bypasses user auth/RLS and mutates persistent data or sends provider messages with server credentials.',
    impact: 'Cross-user state changes, forged feed decisions, unauthorized outbound messages, or provider spend/abuse.',
    fixStrategy: 'manual',
  });
}

function hasExpressRouteAuthGuardInText(text) {
  return String(text || '').split(/\r?\n/).some((line) => hasRouteAuthGuard(line));
}

function hasServiceRoleOrOutboundSend(text) {
  return /\b(?:createServiceClient|supabaseAdmin|serviceRole|SERVICE_ROLE|admin\s*=\s*createClient)\b/i.test(text)
    || /\b(?:sendOutbound|sendText|sendTemplate|messages\s*\.\s*send(?:Text|Template)?|twilio\s*\.\s*messages\s*\.\s*create)\s*\(/i.test(text);
}

function isServiceRouteMutationLine(code) {
  return /\.(?:insert|update|upsert|delete)\s*\(/.test(code)
    || /\b(?:sendOutbound|sendText|sendTemplate|messages\s*\.\s*send(?:Text|Template)?|twilio\s*\.\s*messages\s*\.\s*create)\s*\(/i.test(code);
}

function hasNextRouteSecurityControl(text) {
  return hasNextAuthEnforcement(text) || hasWebhookSignatureGuard(text);
}

function hasNextAuthEnforcement(text) {
  const body = String(text || '');
  return /\b(?:requireAuth|requireUser|requireSession|authorize|ensureAuth|withAuth|currentUser)\s*\(/i.test(body)
    || /if\s*\(\s*!\s*(?:user|session(?:\.user)?|authUser|currentUser)\s*\)[\s\S]{0,180}(?:401|Unauthorized|redirect\s*\()/i.test(body)
    || /\bthrow\s+new\s+Unauthorized/i.test(body);
}

function hasWebhookSignatureGuard(text) {
  return /\b(?:verify[A-Za-z0-9_]*(?:Signature|Webhook|Hmac|HMAC)|timingSafeEqual|createHmac|x-[a-z0-9-]*signature|webhook[_-]?secret|signing[_-]?secret)\b/i.test(text);
}

function unauthenticatedBinaryObjectRoute(item, input) {
  if (item.sign !== '+') return null;
  if (!isPythonFile(item.file)) return null;
  if (!/\b(?:Response\s*\(\s*content\s*=|FileResponse\s*\()/i.test(item.code)) return null;
  if (!/(?:image|file|document|attachment|media|pdf|blob|binary|bytes)[A-Za-z0-9_]*(?:_data|_bytes)?\b|\bFileResponse\s*\(/i.test(item.code)) {
    return null;
  }

  const sameFileAdded = addedTextForFile(input, item.file);
  if (!/@(?:app|router)\s*\.\s*get\s*\(\s*['"][^'"]*\{[^'"]+\}[^'"]*['"]/.test(sameFileAdded)) return null;
  if (hasPythonAuthGuard(sameFileAdded)) return null;

  return makeFinding(item, 'missing-authz', 'high', 'Dynamic object media route without auth guard', {
    attackerControlledInput: 'An unauthenticated HTTP client can choose the route id for a stored media or binary object.',
    vulnerableSink: 'FastAPI response returning database-backed file, image, document, or binary bytes.',
    exploitPath: 'A direct request to the dynamic media route can download stored object bytes without authentication or ownership checks.',
    impact: 'Unauthorized disclosure of uploaded or derived private content.',
    fixStrategy: 'manual',
  });
}

function unscopedBulkDelete(item, input) {
  if (item.sign !== '+') return null;
  if (!isPythonFile(item.file)) return null;
  if (!/\b(?:db|session)\s*\.\s*query\s*\([^)]+\)(?:\s*\.\s*(?!filter|where|join)[A-Za-z_][A-Za-z0-9_]*\s*\([^)]*\))*\s*\.\s*delete\s*\(/.test(item.code)) {
    return null;
  }

  const sameFileAdded = addedTextForFile(input, item.file);
  if (!/@(?:app|router)\s*\.\s*delete\s*\(/.test(sameFileAdded)) return null;
  if (hasPythonAdminGuard(sameFileAdded)) return null;
  if (hasScopedDeleteQuery(item.code)) return null;

  return makeFinding(item, 'missing-authz', 'high', 'Bulk delete lacks ownership or admin scope', {
    attackerControlledInput: 'Any authenticated caller who can invoke the route can trigger the delete operation.',
    vulnerableSink: 'ORM bulk delete without an ownership, tenant, or admin restriction.',
    exploitPath: 'Calling the endpoint deletes every row in the model table instead of only rows owned by the current actor.',
    impact: 'Cross-user data loss or unauthorized destructive action.',
    fixStrategy: 'manual',
  });
}

function hasPythonAuthGuard(text) {
  return /\bDepends\s*\(\s*(?:get_current_[A-Za-z0-9_]*|current_[A-Za-z0-9_]*|require_[A-Za-z0-9_]*(?:auth|user|teacher|admin)|auth_required|require_admin)\b/i.test(text)
    || /\bSecurity\s*\(\s*(?:HTTPBearer|OAuth2|require_|get_current_)/i.test(text);
}

function hasPythonAdminGuard(text) {
  return /\bDepends\s*\(\s*(?:require_admin|get_current_admin|admin_required|require_role)\b/i.test(text)
    || /\b(?:is_admin|is_superuser|role\s*==\s*['"]admin['"]|Role\.ADMIN)\b/.test(text);
}

function hasScopedDeleteQuery(code) {
  return /\.(?:filter|where|join)\s*\(/.test(code)
    || /\b(?:teacher|user|owner|tenant|workspace|org|organization|account)_id\b/i.test(code);
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

function generatedSqlToSensitiveSink(item) {
  if (item.sign !== '+') return null;
  const code = codeShape(item.code);
  if (!/\b(?:execute|query|raw)\s*\(\s*(?:migration_sql|generated_sql|llm_sql|model_sql|proposed_sql|candidate_sql)\b/i.test(code)) {
    return null;
  }
  return makeFinding(item, 'llm-output-to-sensitive-sink', 'high', 'Generated SQL reaches database execution', {
    attackerControlledInput: 'A model, agent, request, or migration workflow can provide SQL text through a generated/proposed SQL variable.',
    vulnerableSink: 'Database execution of unconstrained SQL text.',
    exploitPath: 'A generated SQL payload can mutate data, bypass a sandbox search_path, or run commands outside the intended schema.',
    impact: 'Data loss, tenant boundary bypass, or unsafe production database mutation.',
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

function electronRendererControlledFetch(item, input) {
  if (item.sign !== '+') return null;
  if (!isJavaScriptLikeFile(item.file)) return null;
  const code = codeShape(item.code);
  if (!/\bfetch\s*\(/.test(code)) return null;
  if (!/\b(?:apiBaseUrl|serverBaseUrl|baseUrl|targetUrl|requestUrl|normalizedBaseUrl|url)\b/.test(code)) return null;

  const sameFileAdded = addedTextForFile(input, item.file);
  if (!/\bipcMain\s*\.\s*handle\s*\(/.test(sameFileAdded)) return null;
  if (!/\b(?:apiBaseUrl|serverBaseUrl|baseUrl|targetUrl|requestUrl|url)\b/.test(sameFileAdded)) return null;

  return makeFinding(item, 'ssrf', 'high', 'Renderer-controlled main-process fetch', {
    attackerControlledInput: 'Electron renderer or web content can invoke the preload-exposed IPC handler with a URL-like value.',
    vulnerableSink: 'Main-process fetch call.',
    exploitPath: 'A compromised renderer can make the privileged main process request an arbitrary host or local service.',
    impact: 'Local service probing, token exposure through redirected requests, or access to network locations not intended for renderer control.',
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

function electronSecurityMisconfiguration(item, input) {
  if (item.sign !== '+') return null;
  if (!isJavaScriptLikeFile(item.file)) return null;
  const code = codeShape(item.code);

  if (hasUnsafeElectronWebPreference(code)) {
    return makeFinding(item, 'security-misconfiguration', 'medium', 'Unsafe Electron BrowserWindow preference', {
      attackerControlledInput: 'Renderer content, markdown, or future remote content can execute inside the BrowserWindow boundary.',
      vulnerableSink: 'Electron BrowserWindow webPreferences.',
      exploitPath: 'A renderer compromise gets stronger main-process or browser privileges because a defense-in-depth Electron boundary is disabled.',
      impact: 'Local file, credential, or host access becomes easier after renderer compromise.',
      fixStrategy: 'manual',
    });
  }

  if (/\bshell\s*\.\s*openExternal\s*\(\s*(?:details|event|e)\s*\.\s*url\s*\)/.test(code)) {
    return makeFinding(item, 'security-misconfiguration', 'medium', 'Unvalidated Electron external URL', {
      attackerControlledInput: 'Renderer content can create or trigger a new-window URL.',
      vulnerableSink: 'Electron shell.openExternal call.',
      exploitPath: 'A crafted link can open an arbitrary external protocol or host without an allowlist.',
      impact: 'Phishing, custom-protocol abuse, or local application launch from untrusted renderer content.',
      fixStrategy: 'manual',
    });
  }

  if (isUnsafeElectronSecretSettingsWrite(item, input)) {
    return makeFinding(item, 'security-misconfiguration', 'medium', 'Electron secret settings written without private file mode', {
      attackerControlledInput: 'User-entered API keys or session tokens are saved by the desktop app.',
      vulnerableSink: 'Local settings file write.',
      exploitPath: 'When secure storage is unavailable or bypassed, secrets can land in a default-permission settings file.',
      impact: 'Local credential disclosure to other users, backup/sync tools, or malware with access to user data files.',
      fixStrategy: 'manual',
    });
  }

  return null;
}

function hasUnsafeElectronWebPreference(code) {
  return /\b(?:nodeIntegration|contextIsolation|webSecurity|allowRunningInsecureContent|sandbox)\s*:\s*(?:true|false)\b/.test(code)
    && (
      /\bnodeIntegration\s*:\s*true\b/.test(code)
      || /\bcontextIsolation\s*:\s*false\b/.test(code)
      || /\bwebSecurity\s*:\s*false\b/.test(code)
      || /\ballowRunningInsecureContent\s*:\s*true\b/.test(code)
      || /\bsandbox\s*:\s*false\b/.test(code)
    );
}

function isUnsafeElectronSecretSettingsWrite(item, input) {
  const code = codeShape(item.code);
  if (!/\bwriteFile(?:Sync)?\s*\(/.test(code)) return false;
  if (/\bmode\s*:\s*0o?600\b/.test(item.code) || /\bchmod\s*\(/.test(item.code)) return false;
  const sameFileAdded = addedTextForFile(input, item.file);
  if (!/\bsafeStorage\b/.test(sameFileAdded)) return false;
  if (!/(?:apiKey|sessionToken|authToken|secret)/i.test(sameFileAdded)) return false;
  return /\bencrypted\s*:\s*false\b/.test(sameFileAdded)
    || /\bstoredSecret\s*\.\s*value\b/.test(sameFileAdded)
    || /\bwriteStoredSettings\b/.test(sameFileAdded);
}

function unsafeErrorResponse(item) {
  if (item.sign !== '+') return null;
  const code = codeShape(item.code);
  const writesExpressResponse = /\b(?:res|response)\s*\.\s*(?:status\s*\(\s*5\d\d\s*\)\s*\.\s*)?(?:json|send|end)\s*\(/.test(code);
  const writesNextResponse = /\bNextResponse\s*\.\s*json\s*\(/.test(code);
  const writesStandardResponse = /\bnew\s+Response\s*\(/.test(code);
  const writesJsonErrorHelper = /\b(?:jsonError|errorJson|errorResponse|jsonErrorResponse)\s*\(\s*5\d\d\s*,/.test(code);
  const writesClientResponse = writesExpressResponse || writesNextResponse || writesStandardResponse || writesJsonErrorHelper;
  if (!writesClientResponse) return null;
  if (!/\b(?:err|error|e|scanErr|jobErr)\s*(?:\.|\?\.)\s*(?:message|stack)\b/.test(code)) return null;
  return makeFinding(item, 'security-misconfiguration', 'medium', 'Raw error details returned to client', {
    attackerControlledInput: 'Unexpected request paths can trigger server exceptions.',
    vulnerableSink: 'HTTP error response body.',
    exploitPath: 'A failing request receives raw exception details that may expose internals, schema, dependency messages, or future secret-bearing errors.',
    impact: 'Information disclosure and easier attack discovery.',
    fixStrategy: 'manual',
  });
}

function unsafeHtmlSink(item) {
  if (item.sign !== '+') return null;
  if (!isJavaScriptLikeFile(item.file)) return null;
  const code = String(item.code || '');
  if (!/\b(?:dangerouslySetInnerHTML|innerHTML)\b/.test(code)) return null;
  if (/\b(?:DOMPurify|sanitizeHtml|sanitize|escapeHtml|escapeScriptString)\s*\(/.test(code)) return null;
  if (!/\b(?:session_id|sessionId|searchParams|params|query|req|request|body|message|content|markdownHtml|html)\b/i.test(code)) return null;

  return makeFinding(item, 'xss', 'high', 'Request-derived HTML reaches script/DOM sink', {
    attackerControlledInput: 'A request, callback query parameter, or user-controlled content can influence rendered HTML or script text.',
    vulnerableSink: 'dangerouslySetInnerHTML or innerHTML.',
    exploitPath: 'A crafted value can break out of the generated HTML/script context and execute in the browser.',
    impact: 'Session/token theft, account actions in the user context, or manipulation of verification flows.',
    fixStrategy: 'manual',
  });
}

function cookieTokenExposure(item, input) {
  if (item.sign !== '+') return null;
  if (!isJavaScriptLikeFile(item.file)) return null;
  const sameFileAdded = addedTextForFile(input, item.file);
  if (!/\b(?:req|request)\s*\.\s*cookies\s*\.\s*get\s*\(/.test(sameFileAdded)) return null;
  if (!/\b(?:NextResponse|res|response)\s*\.\s*json\s*\(/.test(sameFileAdded)) return null;
  if (!/\btoken\s*:\s*(?:cookieToken|sessionToken|sessionJwt|jwtCookie|cookieJwt)\b/.test(item.code)) return null;

  return makeFinding(item, 'sensitive-data-exposure', 'high', 'HttpOnly cookie token returned to client JavaScript', {
    attackerControlledInput: 'Browser JavaScript can call the session endpoint with ambient cookies.',
    vulnerableSink: 'JSON response body containing the same token stored in an HttpOnly cookie.',
    exploitPath: 'Any injected script or third-party script on the origin can fetch the endpoint and read a token that HttpOnly was meant to hide.',
    impact: 'Session token disclosure and loss of HttpOnly cookie protection.',
    fixStrategy: 'manual',
  });
}

function agentCallbackWithoutAuth(item, input) {
  if (item.sign !== '+') return null;
  const file = String(item.file || '').replace(/\\/g, '/');
  if (!isJavaScriptLikeFile(file)) return null;
  if (!/(?:^|\/)app\/api\//i.test(file)) return null;
  if (!/(?:elevenlabs|webhook|callback|decision|voice|step-up)/i.test(file)) return null;
  if (!/\bexport\s+(?:async\s+function\s+POST|const\s+POST)\b/.test(item.code)) return null;

  const sameFileAdded = addedTextForFile(input, item.file);
  if (!hasAgentCallbackMutation(sameFileAdded)) return null;
  if (hasAgentCallbackAuthGuard(sameFileAdded)) return null;

  return makeFinding(item, 'agent-callback-without-auth', 'high', 'Agent callback mutates state without auth', {
    attackerControlledInput: 'An external provider, browser, or HTTP client can submit callback JSON such as challenge ids, approval decisions, or rejection reasons.',
    vulnerableSink: 'Public API route that mutates verification, approval, voice, or step-up state.',
    exploitPath: 'A forged callback can approve, deny, cancel, or advance an agent verification flow without a bearer token or webhook signature.',
    impact: 'Unauthorized state changes in approval or agent-permission workflows.',
    fixStrategy: 'manual',
  });
}

function hasAgentCallbackMutation(text) {
  return /\b(?:confirmPhoneStepUp|cancelPendingStepUp|rejectStepUp|completeVerifiedStepUp|beginPasskeyStepUp|approve[A-Za-z0-9_]*|deny[A-Za-z0-9_]*|reject[A-Za-z0-9_]*|cancel[A-Za-z0-9_]*)\s*\(/.test(text)
    || /\b(?:kernelRuntime|runtime)\s*\.\s*(?:emit|confirm|cancel|reject|complete|approve|deny)\s*\(/.test(text);
}

function hasAgentCallbackAuthGuard(text) {
  return /\b(?:require[A-Za-z0-9_]*(?:Auth|Signature)|verify[A-Za-z0-9_]*(?:Signature|Webhook|Hmac|HMAC)|timingSafeEqual|createHmac|x-[a-z0-9-]*signature|webhook[_-]?secret|signing[_-]?secret)\b/i.test(text)
    || /\b(?:req|request)\s*\.\s*headers\s*\.\s*get\s*\(\s*['"]authorization['"]\s*\)/i.test(text)
    || /\b(?:req|request)\s*\.\s*headers\s*\[\s*['"]authorization['"]\s*\]/i.test(text);
}

function publicSecurityDefiner(item, input) {
  if (item.sign !== '+') return null;
  const code = codeShape(item.code);
  const grantsAnonExecute = /\bgrant\s+execute\s+on\s+function\b.+\bto\b.+\banon\b/i.test(code);
  if (!grantsAnonExecute) return null;

  const sameFileAdded = parseChangedLines(input?.diff || '').filter((candidate) => {
    return candidate.file === item.file && candidate.sign === '+';
  }).map((candidate) => codeShape(candidate.code)).join('\n');
  if (!/\bsecurity\s+definer\b/i.test(sameFileAdded)) return null;
  if (!/\bgrant\s+execute\s+on\s+function\b.+\bto\b.+\banon\b/i.test(sameFileAdded)) return null;

  return makeFinding(item, 'security-misconfiguration', 'high', 'Public SECURITY DEFINER function', {
    attackerControlledInput: 'Anonymous clients can call a database function exposed through SQL grants or API RPC.',
    vulnerableSink: 'SECURITY DEFINER database function execution.',
    exploitPath: 'The function executes with elevated privileges and can bypass row-level security or mutate shared state.',
    impact: 'Tenant isolation bypass, integrity loss, or anonymous state-changing database access.',
    fixStrategy: 'manual',
  });
}

function mobileDebugLoggingTree(item, input) {
  if (item.sign !== '+') return null;
  const file = String(item.file || '').replace(/\\/g, '/');
  if (!/src\/main\/.+\.(?:kt|java)$/i.test(file)) return null;
  if (!/\bTimber\s*\.\s*plant\s*\(\s*Timber\s*\.\s*DebugTree\s*\(\s*\)\s*\)/.test(item.code)) return null;
  const sameFileAdded = parseChangedLines(input?.diff || '').filter((candidate) => {
    return candidate.file === item.file && candidate.sign === '+';
  }).map((candidate) => candidate.code).join('\n');
  if (/\bBuildConfig\s*\.\s*DEBUG\b/.test(sameFileAdded)) return null;

  return makeFinding(item, 'security-misconfiguration', 'medium', 'Debug logging tree enabled in Android main source', {
    attackerControlledInput: 'User speech, contact, intent, or accessibility events can flow into mobile logs.',
    vulnerableSink: 'Android production logging pipeline.',
    exploitPath: 'A release build can keep verbose/debug logging active and preserve sensitive mobile-agent data in device or crash logs.',
    impact: 'PII disclosure and easier reverse engineering of sensitive app behavior.',
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

function unboundedUploadFileRead(item, input) {
  if (item.sign !== '+') return null;
  if (!isPythonFile(item.file)) return null;
  if (!/\bawait\s+[A-Za-z_][A-Za-z0-9_]*\s*\.\s*read\s*\(\s*\)/.test(item.code)) return null;

  const sameFileAdded = addedTextForFile(input, item.file);
  if (!/\bUploadFile\b/.test(sameFileAdded)) return null;
  if (hasPythonUploadLimit(sameFileAdded)) return null;

  return makeFinding(item, 'unrestricted-resource-consumption', 'medium', 'Unbounded UploadFile read', {
    attackerControlledInput: 'An HTTP client controls the uploaded file size.',
    vulnerableSink: 'FastAPI UploadFile is read fully into memory before parsing or downstream processing.',
    exploitPath: 'A large file can be buffered and then sent into PDF/audio/XLSX parsers, LLM/STT APIs, or other expensive handlers without a byte cap.',
    impact: 'Memory pressure, request worker exhaustion, parser CPU amplification, or model/API cost amplification.',
    fixStrategy: 'manual',
  });
}

function hasPythonUploadLimit(text) {
  return /\b(?:MAX_(?:UPLOAD|FILE|BODY|REQUEST|BYTES)[A-Z0-9_]*|UPLOAD_LIMIT|FILE_SIZE_LIMIT|content-length|content_length|max_length|spool_max_size)\b/i.test(text)
    && /(?:len\s*\(|>|>=|413|too large|demasiado grande|abort|return|raise|HTTPException)/i.test(text);
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

function addedTextForFile(input, file) {
  return parseChangedLines(input?.diff || '')
    .filter((candidate) => candidate.file === file && candidate.sign === '+')
    .map((candidate) => candidate.code)
    .join('\n');
}

function isJavaScriptLikeFile(file) {
  return /\.(?:[cm]?[jt]sx?)$/i.test(String(file || ''));
}

function isPythonFile(file) {
  return /\.py$/i.test(String(file || ''));
}

function isRuntimeCodeFile(file) {
  return /\.(?:py|[cm]?[jt]sx?)$/i.test(String(file || ''));
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
