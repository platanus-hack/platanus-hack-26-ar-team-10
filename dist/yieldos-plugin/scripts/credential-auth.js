'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const AUTH_TTL_MS = 30 * 60 * 1000;
const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const RESPONSE_PREFIX = 'AUTORIZO yieldOS';

function defaultRuntimeRoot() {
  return process.env.YIELDOS_CREDENTIAL_AUTH_ROOT
    || path.join(os.homedir(), '.cache', 'yieldos', 'credential-auth');
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function normalizeProject(projectRoot) {
  return path.resolve(projectRoot || process.cwd());
}

function normalizeTarget(projectRoot, targetPath) {
  const project = normalizeProject(projectRoot);
  return path.isAbsolute(targetPath)
    ? path.resolve(targetPath)
    : path.resolve(project, targetPath);
}

function projectHash(projectRoot) {
  return sha256(normalizeProject(projectRoot));
}

function targetHash(projectRoot, targetPath) {
  return sha256(`${projectHash(projectRoot)}\n${normalizeTarget(projectRoot, targetPath)}`);
}

function projectAuthDir({ runtimeRoot = defaultRuntimeRoot(), projectRoot }) {
  return path.join(runtimeRoot, projectHash(projectRoot));
}

function pendingChallengePath({ runtimeRoot = defaultRuntimeRoot(), projectRoot }) {
  return path.join(projectAuthDir({ runtimeRoot, projectRoot }), 'pending.json');
}

function authorizationPath({ runtimeRoot = defaultRuntimeRoot(), projectRoot, targetPath }) {
  return path.join(projectAuthDir({ runtimeRoot, projectRoot }), `auth-${targetHash(projectRoot, targetPath)}.json`);
}

function mkdirPrivate(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(dir, 0o700); } catch (_) { /* ignore */ }
}

function writeJsonPrivate(filePath, value) {
  mkdirPrivate(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  try { fs.chmodSync(filePath, 0o600); } catch (_) { /* ignore */ }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sessionKey(sessionId) {
  return String(sessionId || 'local-session');
}

function createCredentialChallenge({
  runtimeRoot = defaultRuntimeRoot(),
  projectRoot,
  targetPath,
  sessionId,
  nowMs = Date.now(),
}) {
  const nonce = crypto.randomBytes(6).toString('hex');
  const expectedResponse = `${RESPONSE_PREFIX} ${nonce}`;
  const normalizedTarget = normalizeTarget(projectRoot, targetPath);
  writeJsonPrivate(pendingChallengePath({ runtimeRoot, projectRoot }), {
    schema_version: 1,
    nonce,
    nonce_hash: sha256(nonce),
    project_hash: projectHash(projectRoot),
    target_hash: targetHash(projectRoot, normalizedTarget),
    target_display: path.basename(normalizedTarget),
    session_hash: sha256(sessionKey(sessionId)),
    response_hash: sha256(expectedResponse),
    created_at_ms: nowMs,
    expires_at_ms: nowMs + CHALLENGE_TTL_MS,
  });
  return { nonce, expectedResponse };
}

function authorizePendingCredentialRead({ runtimeRoot = defaultRuntimeRoot(), projectRoot, response, nowMs = Date.now() }) {
  const pendingPath = pendingChallengePath({ runtimeRoot, projectRoot });
  if (!fs.existsSync(pendingPath)) {
    return { ok: false, reason: 'no pending credential challenge' };
  }

  let pending;
  try {
    pending = readJson(pendingPath);
  } catch (_) {
    return { ok: false, reason: 'invalid pending credential challenge' };
  }

  if (Number(pending.expires_at_ms) < nowMs) {
    return { ok: false, reason: 'credential challenge expired' };
  }

  const expectedResponse = `${RESPONSE_PREFIX} ${pending.nonce}`;
  if (String(response || '').trim() !== expectedResponse) {
    return { ok: false, reason: 'credential authorization phrase mismatch' };
  }

  return { ok: true, target_display: pending.target_display, requires_transcript: true };
}

function latestUserPromptFromTranscript(transcriptPath) {
  if (typeof transcriptPath !== 'string' || transcriptPath.length === 0) return null;

  try {
    const stat = fs.statSync(transcriptPath);
    const maxBytes = 1024 * 1024;
    const start = Math.max(0, stat.size - maxBytes);
    const fd = fs.openSync(transcriptPath, 'r');
    try {
      const buffer = Buffer.alloc(stat.size - start);
      fs.readSync(fd, buffer, 0, buffer.length, start);
      const lines = buffer.toString('utf8').trim().split(/\r?\n/).filter(Boolean);
      for (let index = lines.length - 1; index >= 0; index -= 1) {
        const text = userPromptFromTranscriptLine(lines[index]);
        if (typeof text === 'string') return text;
      }
    } finally {
      fs.closeSync(fd);
    }
  } catch (_) {
    return null;
  }
  return null;
}

function userPromptFromTranscriptLine(line) {
  try {
    const entry = JSON.parse(line);
    const role = entry.role || entry.message?.role;
    if (role !== 'user' && entry.type !== 'user') return null;
    return transcriptContentText(entry.content ?? entry.message?.content ?? entry.text ?? entry.prompt);
  } catch (_) {
    return null;
  }
}

function transcriptContentText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return null;
  const parts = [];
  for (const item of content) {
    if (typeof item === 'string') {
      parts.push(item);
    } else if (item && typeof item.text === 'string') {
      parts.push(item.text);
    }
  }
  return parts.length > 0 ? parts.join('') : null;
}

function isCredentialReadAuthorized({
  runtimeRoot = defaultRuntimeRoot(),
  projectRoot,
  targetPath,
  sessionId,
  transcriptPath,
  latestPrompt,
  nowMs = Date.now(),
}) {
  const prompt = typeof latestPrompt === 'string'
    ? latestPrompt
    : latestUserPromptFromTranscript(transcriptPath);
  if (typeof prompt !== 'string') return false;
  const normalizedPrompt = prompt.trim();

  try {
    const pending = readJson(pendingChallengePath({ runtimeRoot, projectRoot }));
    if (Number(pending.expires_at_ms) < nowMs) return false;
    return pending.project_hash === projectHash(projectRoot)
      && pending.target_hash === targetHash(projectRoot, targetPath)
      && pending.session_hash === sha256(sessionKey(sessionId))
      && pending.response_hash === sha256(normalizedPrompt)
      && normalizedPrompt === `${RESPONSE_PREFIX} ${pending.nonce}`;
  } catch (_) {
    return false;
  }
}

function normalizeForCompare(value) {
  return path.resolve(String(value || '')).replace(/\\/g, '/').replace(/\/+$/, '');
}

function realpathForCompare(value) {
  let current = path.resolve(String(value || ''));
  let suffix = '';
  while (current && current !== path.dirname(current)) {
    try {
      const real = fs.realpathSync.native(current);
      return suffix ? path.join(real, suffix) : real;
    } catch (_) {
      suffix = suffix ? path.join(path.basename(current), suffix) : path.basename(current);
      current = path.dirname(current);
    }
  }
  return path.resolve(String(value || ''));
}

function compareAliases(value) {
  return [...new Set([
    normalizeForCompare(value),
    normalizeForCompare(realpathForCompare(value)),
  ])];
}

function isInsidePath(candidate, root) {
  for (const normalizedCandidate of compareAliases(candidate)) {
    for (const normalizedRoot of compareAliases(root)) {
      if (normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}/`)) {
        return true;
      }
    }
  }
  return false;
}

function isCredentialAuthPath(filePath, { runtimeRoot = defaultRuntimeRoot() } = {}) {
  if (typeof filePath !== 'string' || filePath.length === 0) return false;
  return isInsidePath(filePath, runtimeRoot);
}

function commandReferencesCredentialAuth(command, { runtimeRoot = defaultRuntimeRoot() } = {}) {
  const normalizedCommand = String(command || '').replace(/\\/g, '/');
  const lower = normalizedCommand.toLowerCase();
  const normalizedRuntimeRoot = normalizeForCompare(runtimeRoot);
  const defaultRoot = normalizeForCompare(path.join(os.homedir(), '.cache', 'yieldos', 'credential-auth'));
  const hasCredentialAuthTokens = lower.includes('credential-auth')
    || (lower.includes('credential') && lower.includes('auth'));
  const hasYieldosCacheTokens = lower.includes('yieldos')
    && (lower.includes('.cache') || lower.includes('homedir') || lower.includes('credential-auth'));
  return normalizedCommand.includes(normalizedRuntimeRoot)
    || normalizedCommand.includes(defaultRoot)
    || normalizedCommand.includes('~/.cache/yieldos/credential-auth')
    || normalizedCommand.includes('.cache/yieldos/credential-auth')
    || normalizedCommand.includes('YIELDOS_CREDENTIAL_AUTH_ROOT')
    || (hasCredentialAuthTokens && hasYieldosCacheTokens);
}

module.exports = {
  AUTH_TTL_MS,
  CHALLENGE_TTL_MS,
  RESPONSE_PREFIX,
  authorizePendingCredentialRead,
  authorizationPath,
  commandReferencesCredentialAuth,
  createCredentialChallenge,
  defaultRuntimeRoot,
  isCredentialReadAuthorized,
  isCredentialAuthPath,
  latestUserPromptFromTranscript,
  pendingChallengePath,
};
