'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const checkpoint = require('./audit-event-checkpoint');

const EVENT_FILE = 'yieldos-events.jsonl';
const LOCK_FILE = '.yieldos-events.lock';
const LOCK_TIMEOUT_MS = 5000;
const STALE_LOCK_MS = 30000;
const MAX_STRING_LENGTH = 4096;

const SECRET_KEY_RE = /(?:password|passwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|credential|authorization|database_url)/i;
const SECRET_PATTERNS = [
  /\bsk-proj-[A-Za-z0-9_-]{20,}\b/g,
  /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g,
  /\bsk-(?!ant-|proj-)[A-Za-z0-9_-]{16,}\b/g,
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{40,}\b/g,
  /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,
  /\bBearer\s+[A-Za-z0-9._-]{8,}\b/g,
  /\b(?:postgres|postgresql|mysql|mongodb|redis|amqp)(?:\+[a-z]+)?:\/\/[^:\s/@]+:[^@\s]+@[^\s]+/gi,
  /-----BEGIN (?:RSA |OPENSSH |EC |DSA |ENCRYPTED |PGP )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA |OPENSSH |EC |DSA |ENCRYPTED |PGP )?PRIVATE KEY-----/g,
];

function appendAuditEvent({
  projectRoot,
  eventType,
  decision,
  subject = {},
  payload = {},
  now = new Date().toISOString(),
}) {
  const securityDir = securityDirectory(projectRoot);
  const filePath = path.join(securityDir, EVENT_FILE);
  const lockPath = path.join(securityDir, LOCK_FILE);
  const release = acquireLock(lockPath);

  try {
    const chain = inspectAuditEventChain(filePath);
    if (!chain.ok) {
      throw new Error(`audit event chain is invalid: ${chain.reason}`);
    }
    assertCheckpointMatches(projectRoot, chain);
    const previous = readPreviousEvent(filePath);
    const event = {
      schema_version: 1,
      event_id: crypto.randomUUID(),
      sequence: previous ? Number(previous.sequence) + 1 : 1,
      timestamp: now,
      event_type: eventType || 'yieldos.event',
      decision: decision || 'unknown',
      subject: redactEventPayload(subject),
      payload: redactEventPayload(payload),
      prev_hash: previous ? previous.event_hash : null,
      event_hash: null,
    };
    event.event_hash = hashEvent(event);
    fs.appendFileSync(filePath, `${JSON.stringify(event)}\n`, { mode: 0o600 });
    try { fs.chmodSync(filePath, 0o600); } catch (_) { /* ignore */ }
    checkpoint.writeCheckpoint({
      projectRoot,
      sequence: event.sequence,
      eventHash: event.event_hash,
      now,
    });
    return event;
  } finally {
    release();
  }
}

function securityDirectory(projectRoot) {
  const root = path.resolve(projectRoot || process.cwd());
  const securityDir = path.join(root, 'security');
  assertInside(root, securityDir, 'audit event path');
  assertNoSymlinkTraversal(root, securityDir, 'audit event path');
  fs.mkdirSync(securityDir, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(securityDir, 0o700); } catch (_) { /* ignore */ }
  const eventFile = path.join(securityDir, EVENT_FILE);
  assertInside(root, eventFile, 'audit event path');
  assertNoSymlinkTraversal(root, eventFile, 'audit event path');
  return securityDir;
}

function readPreviousEvent(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const text = fs.readFileSync(filePath, 'utf8').trim();
  if (!text) return null;
  const line = text.split(/\r?\n/).filter(Boolean).at(-1);
  return JSON.parse(line);
}

function verifyAuditEventChain(filePath, options = {}) {
  const result = inspectAuditEventChain(filePath);
  if (!result.ok) return result;
  const projectRoot = options.projectRoot || projectRootFromEventFile(filePath);
  if (projectRoot) {
    const checkpointResult = checkpointComparison(projectRoot, result);
    if (!checkpointResult.ok) {
      return { ok: false, events: result.events, reason: checkpointResult.reason };
    }
  }
  return { ok: true, events: result.events };
}

function inspectAuditEventChain(filePath) {
  const text = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8').trim() : '';
  if (!text) return { ok: true, events: 0, last_hash: null };

  let previousHash = null;
  const lines = text.split(/\r?\n/).filter(Boolean);
  for (const [index, line] of lines.entries()) {
    let event;
    try {
      event = JSON.parse(line);
    } catch (error) {
      return { ok: false, events: index, reason: `invalid-json:${index + 1}:${error.message}` };
    }
    if (event.sequence !== index + 1) {
      return { ok: false, events: index, reason: `sequence-mismatch:${index + 1}` };
    }
    if ((event.prev_hash || null) !== previousHash) {
      return { ok: false, events: index, reason: `prev-hash-mismatch:${index + 1}` };
    }
    if (event.event_hash !== hashEvent(event)) {
      return { ok: false, events: index, reason: `event-hash-mismatch:${index + 1}` };
    }
    previousHash = event.event_hash;
  }
  return { ok: true, events: lines.length, last_hash: previousHash };
}

function assertCheckpointMatches(projectRoot, chain) {
  const comparison = checkpointComparison(projectRoot, chain);
  if (!comparison.ok) {
    const reason = comparison.reason === 'checkpoint-mismatch' ? 'checkpoint mismatch' : comparison.reason;
    throw new Error(`audit event chain is invalid: ${reason}`);
  }
}

function checkpointComparison(projectRoot, chain) {
  const stored = checkpoint.readCheckpoint({ projectRoot });
  if (!stored) return { ok: true };
  if (stored.schema_version !== 1 || stored.project_hash !== checkpoint.projectHash(projectRoot)) {
    return { ok: false, reason: 'checkpoint-mismatch' };
  }
  if (Number(stored.sequence) !== chain.events || stored.event_hash !== chain.last_hash) {
    return { ok: false, reason: 'checkpoint-mismatch' };
  }
  return { ok: true };
}

function projectRootFromEventFile(filePath) {
  const resolved = path.resolve(filePath || '');
  if (path.basename(resolved) !== EVENT_FILE) return null;
  const securityDir = path.dirname(resolved);
  if (path.basename(securityDir) !== 'security') return null;
  return path.dirname(securityDir);
}

function redactEventPayload(value, key = '') {
  if (value === null || value === undefined) return value;
  if (SECRET_KEY_RE.test(key)) return '[REDACTED:field]';
  if (typeof value === 'string') return redactString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map((item) => redactEventPayload(item, key));
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([nestedKey, nestedValue]) => [
      nestedKey,
      redactEventPayload(nestedValue, nestedKey),
    ]));
  }
  return String(value);
}

function redactString(value) {
  let out = value;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, (match) => {
      if (/^Bearer\s+/i.test(match)) return 'Bearer [REDACTED]';
      if (/^[a-z]+(?:\+[a-z]+)?:\/\//i.test(match)) return '[REDACTED:credential-url]';
      return '[REDACTED:secret]';
    });
  }
  if (out.length > MAX_STRING_LENGTH) {
    return `${out.slice(0, MAX_STRING_LENGTH)}...[TRUNCATED:${out.length - MAX_STRING_LENGTH}]`;
  }
  return out;
}

function hashEvent(event) {
  return sha256(canonicalStringify({ ...event, event_hash: null }));
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function canonicalStringify(value) {
  return JSON.stringify(sortValue(value));
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((out, key) => {
    out[key] = sortValue(value[key]);
    return out;
  }, {});
}

function acquireLock(lockPath) {
  const started = Date.now();
  while (true) {
    try {
      const fd = fs.openSync(lockPath, 'wx', 0o600);
      fs.writeFileSync(fd, `${process.pid}\n${new Date().toISOString()}\n`);
      return () => {
        try { fs.closeSync(fd); } catch (_) { /* ignore */ }
        try { fs.unlinkSync(lockPath); } catch (_) { /* ignore */ }
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      removeStaleLock(lockPath);
      if (Date.now() - started > LOCK_TIMEOUT_MS) {
        throw new Error('timed out waiting for audit event lock');
      }
      sleepSync(10);
    }
  }
}

function removeStaleLock(lockPath) {
  try {
    const stat = fs.statSync(lockPath);
    if (Date.now() - stat.mtimeMs > STALE_LOCK_MS) fs.unlinkSync(lockPath);
  } catch (_) {
    // ignore
  }
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function assertInside(root, target, label) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  const prefix = resolvedRoot.endsWith(path.sep) ? resolvedRoot : `${resolvedRoot}${path.sep}`;
  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(prefix)) {
    throw new Error(`${label} must stay inside the project`);
  }
}

function assertNoSymlinkTraversal(root, target, label) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  const relative = path.relative(resolvedRoot, resolvedTarget);
  if (!relative) return;
  let current = resolvedRoot;
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) throw new Error(`${label} must not traverse a symlink`);
    } catch (error) {
      if (error.code === 'ENOENT') break;
      throw error;
    }
  }
}

module.exports = {
  EVENT_FILE,
  appendAuditEvent,
  hashEvent,
  inspectAuditEventChain,
  redactEventPayload,
  verifyAuditEventChain,
};
