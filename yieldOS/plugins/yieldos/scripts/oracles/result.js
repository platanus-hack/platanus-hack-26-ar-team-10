'use strict';

const crypto = require('node:crypto');

const VALID_STATUSES = new Set(['pass', 'fail', 'unknown']);
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_SINGLE_EVIDENCE_BYTES = 2 * 1024;
const DEFAULT_RESULT_BYTES = 16 * 1024;
const PASS_LIMIT = 'A pass is scoped to this subject and evidence only.';

function pass(input = {}) {
  return makeResult('pass', input);
}

function fail(input = {}) {
  return makeResult('fail', input);
}

function unknown(input = {}) {
  return makeResult('unknown', input);
}

function makeResult(status, input = {}) {
  if (!VALID_STATUSES.has(status)) throw new Error(`invalid oracle status: ${status}`);
  const evidence = capEvidence(input.evidence || [], input.maxEvidenceBytes || DEFAULT_SINGLE_EVIDENCE_BYTES);
  const subject = normalizeObject(input.subject, { type: 'unknown', ref: input.id || 'unknown' });
  const scope = normalizeScope(input.scope);
  const limits = normalizeArray(input.limits);
  if (status === 'pass' && !limits.includes(PASS_LIMIT)) limits.push(PASS_LIMIT);

  const metrics = {
    duration_ms: numberOrDefault(input.metrics?.duration_ms, input.duration_ms, 0),
    timeout_ms: numberOrDefault(input.metrics?.timeout_ms, input.timeout_ms, DEFAULT_TIMEOUT_MS),
    timed_out: Boolean(input.metrics?.timed_out || input.timed_out),
    evidence_bytes: Buffer.byteLength(canonicalJson(evidence), 'utf8'),
  };

  const blocking = input.blocking !== undefined ? Boolean(input.blocking) : status !== 'pass';
  const result = {
    version: input.version || '0.1',
    id: input.id || 'unknown-oracle',
    kind: input.kind || 'policy',
    status,
    blocking,
    blocking_reason: blocking ? (input.blocking_reason || defaultBlockingReason(status)) : '',
    subject,
    scope,
    limits,
    summary: input.summary || defaultSummary(status),
    evidence,
    metrics,
  };
  result.hashes = {
    subject: hashObject(subject),
    evidence: hashObject(evidence),
    result: hashObject(resultHashPayload(result)),
  };
  enforceResultSize(result, input.maxResultBytes || DEFAULT_RESULT_BYTES);
  return result;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

function hashObject(value) {
  return `sha256:${crypto.createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
}

function verifyResultHash(result) {
  if (!result || typeof result !== 'object') return false;
  const expected = result.hashes?.result;
  if (!expected) return false;
  return hashObject(resultHashPayload(result)) === expected;
}

function capEvidence(evidence, maxBytes = DEFAULT_SINGLE_EVIDENCE_BYTES) {
  const items = Array.isArray(evidence) ? evidence : [evidence];
  return items.map((item) => capEvidenceValue(item, maxBytes));
}

function evidenceBytes(evidence) {
  return Buffer.byteLength(canonicalJson(evidence || []), 'utf8');
}

function resultHashPayload(result) {
  const copy = canonicalValue(result);
  delete copy.hashes;
  if (copy.metrics && typeof copy.metrics === 'object') delete copy.metrics.duration_ms;
  return copy;
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value)
    .filter((key) => value[key] !== undefined)
    .sort()
    .reduce((out, key) => {
      out[key] = canonicalValue(value[key]);
      return out;
    }, {});
}

function capEvidenceValue(value, maxBytes) {
  if (typeof value === 'string') return capString(value, maxBytes);
  if (Array.isArray(value)) return value.map((item) => capEvidenceValue(item, maxBytes));
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).reduce((out, key) => {
    out[key] = capEvidenceValue(value[key], maxBytes);
    return out;
  }, {});
}

function capString(value, maxBytes) {
  const text = String(value);
  if (Buffer.byteLength(text, 'utf8') <= maxBytes) return text;
  const marker = '\n[truncated by yieldOS oracle evidence cap]';
  const markerBytes = Buffer.byteLength(marker, 'utf8');
  if (markerBytes >= maxBytes) return marker.slice(0, maxBytes);
  const bodyLimit = maxBytes - markerBytes;
  let out = '';
  for (const char of text) {
    if (Buffer.byteLength(`${out}${char}`, 'utf8') > bodyLimit) break;
    out += char;
  }
  return `${out}${marker}`;
}

function normalizeObject(value, fallback) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  return value;
}

function normalizeScope(scope = {}) {
  return {
    checked: normalizeArray(scope.checked),
    not_checked: normalizeArray(scope.not_checked),
  };
}

function normalizeArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value.map(String) : [String(value)];
}

function numberOrDefault(...values) {
  for (const value of values) {
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

function defaultBlockingReason(status) {
  if (status === 'fail') return 'oracle-failed';
  if (status === 'unknown') return 'sensitive-action-missing-evidence';
  return '';
}

function defaultSummary(status) {
  if (status === 'pass') return 'Oracle passed for the scoped subject.';
  if (status === 'fail') return 'Oracle failed for the scoped subject.';
  return 'Oracle could not produce enough evidence.';
}

function enforceResultSize(result, maxBytes) {
  const bytes = Buffer.byteLength(JSON.stringify(result), 'utf8');
  if (bytes <= maxBytes) return;
  result.evidence = [{
    type: 'summary',
    value: `oracle evidence exceeded ${maxBytes} bytes and was summarized`,
  }];
  result.metrics.evidence_bytes = evidenceBytes(result.evidence);
  result.hashes.evidence = hashObject(result.evidence);
  result.hashes.result = hashObject(resultHashPayload(result));
}

module.exports = {
  DEFAULT_RESULT_BYTES,
  DEFAULT_SINGLE_EVIDENCE_BYTES,
  PASS_LIMIT,
  pass,
  fail,
  unknown,
  makeResult,
  canonicalJson,
  hashObject,
  verifyResultHash,
  capEvidence,
  evidenceBytes,
};
