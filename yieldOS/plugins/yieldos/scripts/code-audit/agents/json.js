'use strict';

const { hasExploitEvidence } = require('../red-team');

const SEVERITIES = new Set(['critical', 'high', 'medium', 'low', 'info']);

function parseJsonPayload(stdout) {
  if (!stdout || typeof stdout !== 'string') return {};
  const parsed = parseJsonText(stdout.trim());
  return unwrapPayload(parsed);
}

function parseJsonText(text) {
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch (_) {
    // Some CLIs stream JSONL. Prefer the final parseable object because that is
    // where command-style tools usually place the final result.
  }

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).reverse();
  for (const line of lines) {
    try {
      return JSON.parse(line);
    } catch (_) {
      // Keep scanning.
    }
  }

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch (_) {
      return {};
    }
  }

  return {};
}

function unwrapPayload(payload) {
  if (!payload || typeof payload !== 'object') return {};
  for (const key of ['result', 'response', 'content', 'text']) {
    if (typeof payload[key] === 'string') {
      const inner = parseJsonPayload(payload[key]);
      if (Object.keys(inner).length > 0) return inner;
    }
  }
  return payload;
}

function normalizeAgentFindings(payload) {
  const findings = Array.isArray(payload) ? payload : payload?.findings || [];
  if (!Array.isArray(findings)) return [];

  return findings
    .map(normalizeFinding)
    .filter((finding) => finding && hasExploitEvidence(finding));
}

function normalizeFinding(finding) {
  if (!finding || typeof finding !== 'object') return null;
  const severity = normalizeSeverity(finding.severity);
  return {
    ruleId: String(finding.ruleId || finding.rule_id || 'agent-finding'),
    severity,
    title: String(finding.title || 'Agent security finding'),
    file: String(finding.file || 'unknown'),
    line: String(finding.line || finding.code || ''),
    attackerControlledInput: finding.attackerControlledInput || finding.attacker_controlled_input || '',
    vulnerableSink: finding.vulnerableSink || finding.vulnerable_sink || '',
    exploitPath: finding.exploitPath || finding.exploit_path || '',
    impact: finding.impact || '',
    fixStrategy: finding.fixStrategy || finding.fix_strategy || 'manual',
    source: 'agent',
  };
}

function normalizeSeverity(value) {
  const severity = String(value || 'info').toLowerCase();
  return SEVERITIES.has(severity) ? severity : 'info';
}

function extractPatch(payload) {
  if (typeof payload === 'string') return payload;
  if (!payload || typeof payload !== 'object') return '';
  return String(payload.patch || payload.unified_diff || payload.unifiedDiff || payload.diff || '');
}

module.exports = {
  parseJsonPayload,
  normalizeAgentFindings,
  extractPatch,
};
