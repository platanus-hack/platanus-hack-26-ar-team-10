'use strict';

const {
  addedTextForFile,
  codeShape,
  isJavaScriptLikeFile,
  isPythonFile,
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

const AUTH_GUARD_RE = /\b(?:requireAuth|authorize|authMiddleware|isAdmin|requireRole|ensureAuth)\b/;
const REMOVED_GUARD_RE = /\b(?:req\.user|requireAuth|authorize|authMiddleware|ensureAuth|isAdmin|requireRole|schema\.parse|z\.object|permission|role)\b/i;
const VALIDATION_CALL_RE = /\bvalidate[A-Za-z0-9_]*\s*\(/;

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

function hasAgentCallbackMutation(text) {
  return /\b(?:confirmPhoneStepUp|cancelPendingStepUp|rejectStepUp|completeVerifiedStepUp|beginPasskeyStepUp|approve[A-Za-z0-9_]*|deny[A-Za-z0-9_]*|reject[A-Za-z0-9_]*|cancel[A-Za-z0-9_]*)\s*\(/.test(text)
    || /\b(?:kernelRuntime|runtime)\s*\.\s*(?:emit|confirm|cancel|reject|complete|approve|deny)\s*\(/.test(text);
}

function hasAgentCallbackAuthGuard(text) {
  return /\b(?:require[A-Za-z0-9_]*(?:Auth|Signature)|verify[A-Za-z0-9_]*(?:Signature|Webhook|Hmac|HMAC)|timingSafeEqual|createHmac|x-[a-z0-9-]*signature|webhook[_-]?secret|signing[_-]?secret)\b/i.test(text)
    || /\b(?:req|request)\s*\.\s*headers\s*\.\s*get\s*\(\s*['"]authorization['"]\s*\)/i.test(text)
    || /\b(?:req|request)\s*\.\s*headers\s*\[\s*['"]authorization['"]\s*\]/i.test(text);
}

function removedValidation(item, input) {
  if (item.sign !== '-') return null;
  const code = codeShape(item.code);
  const hasGuardToken = REMOVED_GUARD_RE.test(code) || VALIDATION_CALL_RE.test(code);
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
    return REMOVED_GUARD_RE.test(code) || VALIDATION_CALL_RE.test(code);
  });
}

module.exports = {
  agentCallbackWithoutAuth,
  hasRouteAuthGuard,
  missingAuthz,
  publicSecurityDefiner,
  removedValidation,
  unauthenticatedAgentRuntimeProxy,
  unauthenticatedBinaryObjectRoute,
  unauthenticatedServiceRouteMutation,
  unscopedBulkDelete,
};
