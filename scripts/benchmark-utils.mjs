import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SECRET_KEY_PATTERN = /(?:api[_-]?key|token|secret|password|passwd|private[_-]?key|access[_-]?key)/i;

export function runGit(cwd, args, options = {}) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    timeout: options.timeout || 30000,
  });
  if (result.error) return { status: 1, stdout: '', stderr: result.error.message };
  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

export function commandOutputEvidence(result) {
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  return {
    stdout_bytes: Buffer.byteLength(stdout),
    stderr_bytes: Buffer.byteLength(stderr),
    stdout_lines: lineCount(stdout),
    stderr_lines: lineCount(stderr),
  };
}

export function outputHashEvidence(result) {
  return {
    stdout_sha256: sha256(result.stdout || ''),
    stderr_sha256: sha256(result.stderr || ''),
  };
}

export function safeReportPath(value) {
  const text = String(value || '').replace(/\\/g, '/');
  if (!text) return '';
  if (path.isAbsolute(text)) return path.basename(text);
  return text
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..')
    .join('/');
}

export function safeText(value, max = 240) {
  return sanitizeSecretLike(String(value || ''))
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/`/g, "'")
    .slice(0, max);
}

export function ratio(numerator, denominator) {
  if (!denominator) return 0;
  return Number((numerator / denominator).toFixed(4));
}

export function summarizeCounts(items) {
  return items.reduce((out, item) => {
    out[item] = (out[item] || 0) + 1;
    return out;
  }, {});
}

export function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1);
  return sorted[index];
}

export function estimateModelCostUsd({ input_tokens = 0, output_tokens = 0, input_usd_per_million, output_usd_per_million }) {
  const inputCost = (input_tokens / 1_000_000) * input_usd_per_million;
  const outputCost = (output_tokens / 1_000_000) * output_usd_per_million;
  return roundUsd(inputCost + outputCost);
}

export function estimateHumanCostUsd(minutes, hourlyRateUsd) {
  return roundUsd((minutes / 60) * hourlyRateUsd);
}

export function roundUsd(value) {
  return Number(Number(value || 0).toFixed(4));
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(path.resolve(file), `${JSON.stringify(value, null, 2)}\n`);
}

export function loadDotEnv(file = path.resolve('.env')) {
  if (!fs.existsSync(file)) return [];
  const loaded = [];
  const text = fs.readFileSync(file, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(trimmed);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = parseEnvValue(rawValue);
    loaded.push(key);
  }
  return loaded;
}

export function hasRequiredEnv(keys) {
  return Object.fromEntries(keys.map((key) => [key, Boolean(process.env[key])]));
}

export function sanitizeSecretLike(value) {
  return String(value || '')
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, '[redacted-api-key]')
    .replace(/\b(?:ghp|gho|ghu|github_pat)_[A-Za-z0-9_]{12,}/g, '[redacted-token]')
    .replace(/\b[A-Za-z0-9+/]{32,}={0,2}\b/g, '[redacted-token]')
    .replace(new RegExp(`(${SECRET_KEY_PATTERN.source}\\s*[:=]\\s*)\\S+`, 'gi'), '$1[redacted]');
}

function parseEnvValue(value) {
  const trimmed = String(value || '').trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function lineCount(value) {
  const text = String(value || '');
  if (!text) return 0;
  return text.split('\n').filter(Boolean).length;
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}
