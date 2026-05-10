'use strict';

const {
  addedTextForFile,
  codeShape,
  isJavaScriptLikeFile,
  isPythonFile,
  makeFinding,
  parseChangedLines,
} = require('./shared');

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
  const code = codeShape(item.code);
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

module.exports = {
  cookieTokenExposure,
  electronRendererControlledFetch,
  electronSecurityMisconfiguration,
  generatedSqlToSensitiveSink,
  mobileDebugLoggingTree,
  openRedirect,
  pathTraversal,
  shellInjection,
  sqlInjection,
  ssrf,
  unboundedBodyRead,
  unboundedUploadFileRead,
  unsafeErrorResponse,
  unsafeFileMutation,
  unsafeHtmlSink,
};
