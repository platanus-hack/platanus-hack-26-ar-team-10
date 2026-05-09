'use strict';

const { unknown, makeResult, verifyResultHash, evidenceBytes } = require('./result');

const DEFAULT_TIMEOUT_MS = 30000;

async function runOne(oracle, options = {}) {
  const timeoutMs = options.timeoutMs || oracle?.timeoutMs || DEFAULT_TIMEOUT_MS;
  const started = Date.now();
  if (!oracle || typeof oracle.run !== 'function') {
    return timedResult(unknown({
      id: oracle?.id || 'unknown-oracle',
      kind: oracle?.kind || 'policy',
      subject: oracle?.subject,
      scope: { checked: [], not_checked: ['oracle run function missing'] },
      summary: 'Oracle could not run because no run function was provided.',
      blocking_reason: 'oracle-runtime-error',
      timeout_ms: timeoutMs,
    }), started, timeoutMs);
  }

  let timeoutHandle;
  try {
    const timeout = new Promise((_, reject) => {
      timeoutHandle = setTimeout(() => {
        const err = new Error(`oracle timed out after ${timeoutMs}ms`);
        err.code = 'YIELDOS_ORACLE_TIMEOUT';
        reject(err);
      }, timeoutMs);
    });
    const raw = await Promise.race([Promise.resolve().then(() => oracle.run(options)), timeout]);
    clearTimeout(timeoutHandle);
    return timedResult(normalizeResult(raw, oracle, timeoutMs), started, timeoutMs);
  } catch (err) {
    clearTimeout(timeoutHandle);
    const timedOut = err?.code === 'YIELDOS_ORACLE_TIMEOUT';
    return timedResult(unknown({
      id: oracle.id,
      kind: oracle.kind || 'policy',
      subject: oracle.subject,
      scope: { checked: [], not_checked: [timedOut ? 'oracle timed out' : 'oracle threw before producing evidence'] },
      summary: timedOut ? `Oracle timed out after ${timeoutMs}ms.` : `Oracle failed before producing evidence: ${err.message}`,
      evidence: [{ type: timedOut ? 'timeout' : 'exception', value: err.message }],
      blocking_reason: timedOut ? 'oracle-timeout' : 'oracle-runtime-error',
      timeout_ms: timeoutMs,
      timed_out: timedOut,
    }), started, timeoutMs, timedOut);
  }
}

async function runMany(oracles, options = {}) {
  const results = [];
  for (const oracle of oracles || []) {
    results.push(await runOne(oracle, options));
  }
  return {
    ok: results.every((result) => result.status === 'pass' && !result.blocking),
    blocking: results.filter((result) => result.blocking),
    results,
  };
}

function normalizeResult(raw, oracle, timeoutMs) {
  if (raw && raw.hashes?.result && verifyResultHash(raw)) return raw;
  if (raw && raw.status) {
    return makeResult(raw.status, {
      ...raw,
      id: raw.id || oracle.id,
      kind: raw.kind || oracle.kind,
      subject: raw.subject || oracle.subject,
      timeout_ms: timeoutMs,
    });
  }
  return makeResult(raw?.ok === false ? 'fail' : 'pass', {
    id: raw?.id || oracle.id,
    kind: raw?.kind || oracle.kind || 'policy',
    subject: raw?.subject || oracle.subject,
    scope: raw?.scope || { checked: [oracle.id], not_checked: [] },
    summary: raw?.summary || `${oracle.id} completed.`,
    evidence: raw?.evidence || [],
    blocking: raw?.blocking,
    blocking_reason: raw?.blocking_reason,
    timeout_ms: timeoutMs,
  });
}

function timedResult(result, started, timeoutMs, forcedTimedOut = false) {
  const duration = Math.max(0, Date.now() - started);
  return makeResult(result.status, {
    ...result,
    duration_ms: duration,
    timeout_ms: timeoutMs,
    timed_out: forcedTimedOut || result.metrics?.timed_out || false,
    evidence: result.evidence,
    metrics: {
      ...(result.metrics || {}),
      duration_ms: duration,
      timeout_ms: timeoutMs,
      timed_out: forcedTimedOut || result.metrics?.timed_out || false,
      evidence_bytes: evidenceBytes(result.evidence),
    },
  });
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  runOne,
  runMany,
};
