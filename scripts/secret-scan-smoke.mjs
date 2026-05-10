#!/usr/bin/env node
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const SECRET_PATTERNS = [
  {
    id: 'provider-token',
    regex: /\b(?:sk|ghp|gho|ghu|github_pat|xox[abprs])[-_][A-Za-z0-9_=-]{20,}\b/g,
  },
  {
    id: 'aws-access-key',
    regex: /\bAKIA[0-9A-Z]{16}\b/g,
  },
  {
    id: 'secret-assignment',
    regex: /\b[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|API_KEY|ACCESS_KEY|PRIVATE_KEY)[A-Z0-9_]*\s*[:=]\s*['"][A-Za-z0-9._~+/=-]{24,}['"]/gi,
  },
  {
    id: 'secret-assignment',
    regex: /\b[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|API_KEY|ACCESS_KEY|PRIVATE_KEY)[A-Z0-9_]*\s*=\s*[A-Za-z0-9_+/=-]{24,}\b/gi,
  },
];

const APPROVED_FIXTURE_PATHS = [
  /^benchmarks\//,
  /^examples\//,
  /^scripts\/.*benchmark.*\.mjs$/,
  /^scripts\/secret-scan-smoke\.test\.mjs$/,
  /^yieldOS\/plugins\/yieldos\/tests\//,
  /^yieldOS\/plugins\/yieldos\/scripts\/oracles\/templates\//,
  /^dist\/yieldos-plugin\/scripts\/oracles\/templates\//,
];

function isApprovedSecretFixturePath(filePath) {
  const normalized = String(filePath || '').replace(/\\/g, '/');
  return APPROVED_FIXTURE_PATHS.some((pattern) => pattern.test(normalized));
}

function findSecretSmokeFindings(files) {
  const findings = [];
  for (const file of files) {
    const text = String(file.text || '');
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const pattern of SECRET_PATTERNS) {
        pattern.regex.lastIndex = 0;
        const matches = Array.from(line.matchAll(pattern.regex));
        for (const match of matches) {
          if (isApprovedSecretFixturePath(file.path) && isApprovedFixtureSecretMatch(match[0])) continue;
          findings.push({
            path: file.path,
            line: index + 1,
            rule_id: pattern.id,
            sample: redactLine(line),
          });
        }
      }
    });
  }
  return findings;
}

function isApprovedFixtureSecretMatch(matchText) {
  const normalized = String(matchText || '').toLowerCase();
  const value = normalized.replace(/^[^:=]+[:=]\s*/, '');
  return [
    'sk-test',
    'sk-fake',
    'sk-1234567890',
    'sk-abcdefghij',
    `sk-proj-${'abcdefghijklmnopqrstuvwxyz'}`,
    '1234567890abcdefghijklmnop',
    'abcdefghijklmnopqrstuvwxyz1234567890token',
    'your_token',
    'secret_token',
  ].some((marker) => value.includes(marker));
}

function trackedFiles() {
  const result = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || 'git ls-files failed');
  return Array.from(new Set(result.stdout.split(/\r?\n/).filter(Boolean)));
}

function readTrackedTextFiles(paths) {
  const files = [];
  for (const filePath of paths) {
    let buffer;
    try {
      buffer = fs.readFileSync(filePath);
    } catch (_) {
      continue;
    }
    if (buffer.includes(0)) continue;
    files.push({ path: filePath, text: buffer.toString('utf8') });
  }
  return files;
}

function redactLine(line) {
  return String(line || '')
    .replace(/(['"]?)([A-Za-z0-9._~+/=-]{8})[A-Za-z0-9._~+/=-]{8,}(['"]?)/g, '$1$2[REDACTED]$3')
    .slice(0, 220);
}

function main() {
  const findings = findSecretSmokeFindings(readTrackedTextFiles(trackedFiles()));
  if (findings.length === 0) {
    process.stdout.write('secret smoke scan OK\n');
    return;
  }
  for (const finding of findings) {
    process.stderr.write(`${finding.path}:${finding.line} ${finding.rule_id} ${finding.sample}\n`);
  }
  process.stderr.write(`secret smoke scan failed: ${findings.length} finding(s)\n`);
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export {
  findSecretSmokeFindings,
  isApprovedFixtureSecretMatch,
  isApprovedSecretFixturePath,
  readTrackedTextFiles,
  trackedFiles,
};
