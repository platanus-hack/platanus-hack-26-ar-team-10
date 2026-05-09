#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { sanitize } = require('./logger');

const DEFAULT_BASE = 'origin/main';
const AUDIT_LOG = path.join('security', 'audit-events.md');

function parseArgs(argv = []) {
  const parsed = {
    command: 'run',
    mode: 'diff',
    base: DEFAULT_BASE,
    agent: null,
    full: false,
  };
  let scopeFlag = null;

  const args = [...argv];
  if (args[0] === 'setup' || args[0] === 'status') {
    parsed.command = args.shift();
  }

  while (args.length > 0) {
    const arg = args.shift();
    if (arg === '--base') {
      setScopeFlag(scopeFlag, arg);
      scopeFlag = arg;
      parsed.base = requireValue(arg, args.shift());
      parsed.mode = 'diff';
    } else if (arg === '--staged') {
      setScopeFlag(scopeFlag, arg);
      scopeFlag = arg;
      parsed.mode = 'staged';
    } else if (arg === '--working') {
      setScopeFlag(scopeFlag, arg);
      scopeFlag = arg;
      parsed.mode = 'working';
    } else if (arg === '--full') {
      setScopeFlag(scopeFlag, arg);
      scopeFlag = arg;
      parsed.mode = 'full';
      parsed.full = true;
    } else if (arg === '--agent') {
      parsed.agent = requireValue(arg, args.shift());
      if (!['codex', 'claude'].includes(parsed.agent)) {
        throw new Error('--agent must be codex or claude');
      }
    } else if (arg === '-h' || arg === '--help') {
      parsed.command = 'help';
    } else {
      throw new Error(`unknown audit option: ${arg}`);
    }
  }

  return parsed;
}

function setScopeFlag(current, next) {
  if (current && current !== next) {
    throw new Error(`${next} cannot be combined with ${current}`);
  }
}

function requireValue(flag, value) {
  if (!value || value.startsWith('--')) throw new Error(`${flag} needs a value`);
  return value;
}

function buildDeepsecSteps(parsed, commentOut) {
  if (parsed.full) {
    return [
      { args: ['scan'] },
      { args: addProcessOptions(['process'], parsed, commentOut) },
    ];
  }

  if (parsed.mode === 'staged') {
    return [{ args: addProcessOptions(['process', '--diff-staged'], parsed, commentOut) }];
  }
  if (parsed.mode === 'working') {
    return [{ args: addProcessOptions(['process', '--diff-working'], parsed, commentOut) }];
  }
  return [{ args: addProcessOptions(['process', '--diff', parsed.base], parsed, commentOut) }];
}

function addProcessOptions(args, parsed, commentOut) {
  const out = [...args];
  if (parsed.agent) out.push('--agent', parsed.agent);
  if (commentOut) out.push('--comment-out', commentOut);
  return out;
}

function runAudit(projectRoot, argv = process.argv.slice(2), options = {}) {
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (err) {
    return { verdict: 'error', exitCode: 2, message: `yieldOS audit error: ${err.message}` };
  }

  if (parsed.command === 'help') return { verdict: 'help', exitCode: 0, message: usage() };
  if (parsed.command === 'setup') return setupResult(projectRoot, options);
  if (parsed.command === 'status') return statusResult(projectRoot, options);

  const deepsec = options.deepsec || findDeepsec(projectRoot, options.env || process.env);
  if (!deepsec) {
    return { verdict: 'setup-required', exitCode: 2, message: setupGuidance() };
  }

  const securityDir = path.join(projectRoot, 'security');
  fs.mkdirSync(securityDir, { recursive: true });
  const commentOut = path.join(securityDir, 'deepsec-audit-comment.md');
  const steps = buildDeepsecSteps(parsed, commentOut);
  const runner = options.spawnSync || spawnSync;
  const env = { ...process.env, ...(options.env || {}) };

  if (parsed.full && typeof options.onNotice === 'function') {
    options.onNotice('yieldOS audit full scan requested; this can be expensive.');
  }

  let runtimeError = null;
  let findingExit = false;
  for (const step of steps) {
    const result = runner(deepsec.command, [...(deepsec.argsPrefix || []), ...step.args], {
      cwd: deepsec.cwd,
      env,
      encoding: 'utf8',
      stdio: options.stdio || 'inherit',
    });
    const status = typeof result.status === 'number' ? result.status : 1;
    if (status === 1 && step.args[0] === 'process') {
      findingExit = true;
      continue;
    }
    if (status !== 0) {
      runtimeError = `deepsec exited with status ${status}`;
      break;
    }
  }

  const codeReview = runtimeError ? { available: false } : runOptionalCodeReview(projectRoot, parsed);
  const reviewFindings = codeReview.findings || [];
  const verdict = runtimeError ? 'error' : findingExit || reviewFindings.length > 0 ? 'findings' : 'clean';
  const exitCode = runtimeError ? 2 : verdict === 'findings' ? 1 : 0;
  const message = resultMessage(verdict, runtimeError, codeReview);
  appendAuditLog(projectRoot, { parsed, deepsec, verdict, exitCode, commentOut, codeReview, runtimeError });
  return { verdict, exitCode, message, commentOut, codeReview };
}

function resultMessage(verdict, runtimeError, codeReview = {}) {
  const reviewSummary = formatCodeReviewSummary(codeReview);
  if (verdict === 'clean') return 'yieldOS audit clean';
  if (verdict === 'findings') {
    return ['yieldOS audit found findings; see Deepsec output/artifacts', reviewSummary].filter(Boolean).join('\n');
  }
  return `yieldOS audit failed: ${runtimeError}`;
}

function formatCodeReviewSummary(codeReview) {
  const findings = codeReview.findings || [];
  if (findings.length === 0) return '';
  const shown = findings.slice(0, 5).map((finding) => {
    const id = finding.ruleId || finding.title || 'finding';
    const file = finding.file || 'unknown';
    return `${finding.severity}:${id} (${file})`;
  });
  const suffix = findings.length > shown.length ? `; +${findings.length - shown.length} more` : '';
  return `yieldOS code-review high/critical: ${shown.join('; ')}${suffix}`;
}

function setupResult(projectRoot, options) {
  const deepsec = findDeepsec(projectRoot, options.env || process.env);
  if (!deepsec) return { verdict: 'setup-required', exitCode: 2, message: setupGuidance() };
  return { verdict: 'ready', exitCode: 0, message: `yieldOS audit setup OK (${deepsec.source})` };
}

function statusResult(projectRoot, options) {
  const deepsec = findDeepsec(projectRoot, options.env || process.env);
  const last = readLastAuditEvent(projectRoot);
  return {
    verdict: 'status',
    exitCode: 0,
    message: [
      `yieldOS audit deepsec: ${deepsec ? `ready (${deepsec.source})` : 'not installed'}`,
      `yieldOS audit last: ${last || 'none'}`,
    ].join('\n'),
  };
}

function findDeepsec(projectRoot, env = process.env) {
  const localBin = path.join(projectRoot, '.deepsec', 'node_modules', '.bin', 'deepsec');
  if (fs.existsSync(localBin)) {
    return { command: localBin, argsPrefix: [], cwd: path.join(projectRoot, '.deepsec'), source: '.deepsec' };
  }
  const found = findOnPath('deepsec', env.PATH || process.env.PATH || '');
  if (found) return { command: found, argsPrefix: [], cwd: projectRoot, source: 'PATH' };
  return null;
}

function findOnPath(command, pathValue) {
  for (const dir of String(pathValue || '').split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(dir, command);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function runOptionalCodeReview(projectRoot, parsed) {
  try {
    const { redTeam } = require('./code-audit/red-team');
    const git = require('./code-audit/git');
    if (typeof redTeam !== 'function') return { available: false };
    const input = collectCodeAuditInput(projectRoot, parsed, git);
    if (!input) return { available: true, skipped: true, findings: [] };
    const findings = redTeam(input).filter((f) => f.severity === 'critical' || f.severity === 'high');
    return { available: true, findings };
  } catch (_) {
    return { available: false };
  }
}

function collectCodeAuditInput(projectRoot, parsed, git) {
  if (parsed.mode === 'staged' && typeof git.collectStagedDiff === 'function') return git.collectStagedDiff(projectRoot);
  if (parsed.mode === 'diff' && typeof git.collectBaseDiff === 'function') return git.collectBaseDiff(projectRoot, parsed.base, 'audit');
  return null;
}

function appendAuditLog(projectRoot, event) {
  const file = path.join(projectRoot, AUDIT_LOG);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const command = [event.deepsec.command, ...(event.deepsec.argsPrefix || [])].join(' ');
  const lines = [
    '',
    `## ${new Date().toISOString()} - Audit Command`,
    '',
    `- Mode: ${event.parsed.mode}`,
    `- Base: ${event.parsed.mode === 'diff' ? event.parsed.base : ''}`,
    `- Deepsec: ${sanitize(command)}`,
    `- Verdict: ${event.verdict}`,
    `- Exit status: ${event.exitCode}`,
    `- Artifact: ${path.relative(projectRoot, event.commentOut)}`,
    `- Code review: ${event.codeReview.available ? `${event.codeReview.findings.length} high/critical finding(s)` : 'unavailable'}`,
    '',
  ];
  fs.appendFileSync(file, lines.join('\n'));
  return file;
}

function readLastAuditEvent(projectRoot) {
  const file = path.join(projectRoot, AUDIT_LOG);
  if (!fs.existsSync(file)) return null;
  const headings = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((line) => line.startsWith('## '));
  return headings.length ? headings[headings.length - 1].replace(/^## /, '') : null;
}

function setupGuidance() {
  return [
    'yieldOS audit needs Deepsec setup.',
    'Run:',
    '  npx deepsec init',
    '  cd .deepsec',
    '  pnpm install',
    'Then complete .deepsec/data/<id>/INFO.md.',
  ].join('\n');
}

function usage() {
  return [
    'Usage: yieldos-audit [setup|status] [--base <ref>] [--staged|--working|--full] [--agent codex|claude]',
    '',
    'Default: deepsec process --diff origin/main',
  ].join('\n');
}

function main() {
  const result = runAudit(process.cwd(), process.argv.slice(2), {
    onNotice(message) {
      process.stdout.write(`${message}\n`);
    },
  });
  process.stdout.write(`${result.message}\n`);
  process.exit(result.exitCode);
}

if (require.main === module) main();

module.exports = {
  parseArgs,
  buildDeepsecSteps,
  runAudit,
  findDeepsec,
  setupGuidance,
  usage,
};
