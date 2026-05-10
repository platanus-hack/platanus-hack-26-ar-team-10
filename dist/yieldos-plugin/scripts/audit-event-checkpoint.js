'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function defaultRuntimeRoot() {
  return process.env.YIELDOS_AUDIT_EVENTS_ROOT
    || path.join(os.homedir(), '.cache', 'yieldos', 'audit-events');
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function projectHash(projectRoot) {
  return sha256(normalizeForCompare(realpathForCompare(projectRoot || process.cwd())));
}

function checkpointPath({ runtimeRoot = defaultRuntimeRoot(), projectRoot }) {
  return path.join(runtimeRoot, `${projectHash(projectRoot)}.json`);
}

function mkdirPrivate(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(dir, 0o700); } catch (_) { /* ignore */ }
}

function writeCheckpoint({ runtimeRoot = defaultRuntimeRoot(), projectRoot, sequence, eventHash, now = new Date().toISOString() }) {
  const filePath = checkpointPath({ runtimeRoot, projectRoot });
  mkdirPrivate(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify({
    schema_version: 1,
    project_hash: projectHash(projectRoot),
    sequence,
    event_hash: eventHash,
    updated_at: now,
  }, null, 2)}\n`, { mode: 0o600 });
  try { fs.chmodSync(filePath, 0o600); } catch (_) { /* ignore */ }
  return filePath;
}

function readCheckpoint({ runtimeRoot = defaultRuntimeRoot(), projectRoot }) {
  const filePath = checkpointPath({ runtimeRoot, projectRoot });
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
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

function isAuditEventCheckpointPath(filePath, { runtimeRoot = defaultRuntimeRoot() } = {}) {
  if (typeof filePath !== 'string' || filePath.length === 0) return false;
  return isInsidePath(filePath, runtimeRoot);
}

function commandReferencesAuditEventCheckpoint(command, { runtimeRoot = defaultRuntimeRoot() } = {}) {
  const normalizedCommand = String(command || '').replace(/\\/g, '/');
  const normalizedRuntimeRoot = normalizeForCompare(runtimeRoot);
  const defaultRoot = normalizeForCompare(path.join(os.homedir(), '.cache', 'yieldos', 'audit-events'));
  return normalizedCommand.includes(normalizedRuntimeRoot)
    || normalizedCommand.includes(defaultRoot)
    || normalizedCommand.includes('~/.cache/yieldos/audit-events')
    || normalizedCommand.includes('.cache/yieldos/audit-events')
    || normalizedCommand.includes('YIELDOS_AUDIT_EVENTS_ROOT');
}

module.exports = {
  checkpointPath,
  commandReferencesAuditEventCheckpoint,
  defaultRuntimeRoot,
  isAuditEventCheckpointPath,
  projectHash,
  readCheckpoint,
  writeCheckpoint,
};
