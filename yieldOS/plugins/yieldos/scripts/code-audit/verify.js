'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { collectStagedDiff } = require('./git');
const { redTeam } = require('./red-team');

const DEFAULT_BLOCKING_SEVERITIES = ['critical', 'high'];

function verifyFix(projectRoot, options = {}) {
  const blockingSeverities = options.blockingSeverities || DEFAULT_BLOCKING_SEVERITIES;
  const input = collectStagedDiff(projectRoot);
  const remaining = redTeam(input);
  const blockingFindings = remaining.filter((finding) => blockingSeverities.includes(finding.severity));

  const checks = blockingFindings.length === 0 ? runDetectedChecks(projectRoot) : {
    ok: false,
    ran: false,
    checks: [],
    reason: 'red-team rescan still has blocking findings',
  };

  return {
    ok: blockingFindings.length === 0 && checks.ok,
    remaining,
    blockingFindings,
    checks,
  };
}

function detectProjectChecks(projectRoot) {
  const packageJson = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(packageJson)) return [];

  try {
    const pkg = JSON.parse(fs.readFileSync(packageJson, 'utf8'));
    const testScript = pkg.scripts && pkg.scripts.test;
    if (typeof testScript !== 'string') return [];
    if (/no test specified|exit 1/i.test(testScript)) return [];
    return [{ name: 'npm test', command: 'npm', args: ['test'] }];
  } catch (_) {
    return [];
  }
}

function runDetectedChecks(projectRoot) {
  const checks = detectProjectChecks(projectRoot);
  if (checks.length === 0) {
    return { ok: true, ran: false, checks: [], reason: 'no project checks detected' };
  }

  const results = checks.map((check) => {
    const result = spawnSync(check.command, check.args, {
      cwd: projectRoot,
      encoding: 'utf8',
      timeout: 30000,
      env: { ...process.env, CI: '1' },
    });
    return {
      name: check.name,
      status: result.status,
      ok: result.status === 0,
      error: result.error ? result.error.message : '',
      stdout: trimOutput(result.stdout),
      stderr: trimOutput(result.stderr),
    };
  });

  return {
    ok: results.every((result) => result.ok),
    ran: true,
    checks: results,
  };
}

function trimOutput(value) {
  if (!value) return '';
  return String(value).slice(0, 2000);
}

module.exports = { verifyFix, detectProjectChecks, runDetectedChecks };
