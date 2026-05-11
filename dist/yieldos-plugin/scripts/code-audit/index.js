'use strict';

const path = require('node:path');

const { collectStagedDiff, collectPushDiff, git } = require('./git');
const { redTeam } = require('./red-team');
const { blueTeam } = require('./blue-team');
const { verifyFix } = require('./verify');
const { writeAuditState, readAuditState, verifyAuditState, buildAuditState } = require('./state');
const agents = require('./agents');
const { applyAgentPatch } = require('./agents/patch');
const { attachCdscArtifacts } = require('../oracles/cdsc/missing-auth-contract');

const MAX_FIX_ITERATIONS = 3;
const PATCHABLE_SEVERITIES = ['critical', 'high', 'medium'];
const BLOCKING_BY_RUNTIME_MODE = {
  monitor: ['critical'],
  standard: ['critical', 'high'],
  strict: ['critical', 'high', 'medium'],
  enterprise: ['critical', 'high', 'medium'],
};

function isGitCommit(command) {
  return gitSubcommand(command) === 'commit';
}

function isGitPush(command) {
  return gitSubcommand(command) === 'push';
}

function isGitAuditCommand(command) {
  return isGitCommit(command) || isGitPush(command);
}

function gitSubcommand(command) {
  for (const innerCommand of extractShellEvalCommands(command || '')) {
    const subcommand = gitSubcommand(innerCommand);
    if (subcommand) return subcommand;
  }

  return findGitCommand(command || '')?.subcommand || null;
}

function extractShellEvalCommands(command) {
  const out = [];
  const re = /(?:^|[;&|]\s*)(?:(?:sudo|command)\s+)*(?:env(?:\s+[A-Za-z_][A-Za-z0-9_]*=\S+)*\s+)?(?:(?:\/usr\/bin\/env\s+)?(?:bash|sh|zsh|\/bin\/bash|\/bin\/sh|\/bin\/zsh))\s+(?:-[A-Za-z]*\s+)*-[A-Za-z]*c[A-Za-z]*\s+(["'])([\s\S]*?)\1/g;
  let match;
  while ((match = re.exec(String(command))) !== null) {
    out.push(match[2]);
  }
  return out;
}

function stripQuotedText(command) {
  let out = '';
  let inSingle = false;
  let inDouble = false;
  let escaped = false;

  for (const ch of String(command)) {
    if (escaped) {
      out += inSingle || inDouble ? ' ' : ch;
      escaped = false;
      continue;
    }
    if (ch === '\\' && !inSingle) {
      escaped = true;
      out += inDouble ? ' ' : ch;
      continue;
    }
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      out += ' ';
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      out += ' ';
      continue;
    }
    out += inSingle || inDouble ? ' ' : ch;
  }

  return out;
}

function splitShellSegments(command) {
  return String(command)
    .split(/(?:&&|\|\||;|\n)/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function gitSubcommandFromTokens(tokens) {
  return gitInfoFromTokens(tokens)?.subcommand || null;
}

function gitInfoFromTokens(tokens, cwd = null) {
  let index = 0;
  while (tokens[index] && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index])) index += 1;
  if (tokens[index] === 'env') {
    index += 1;
    while (tokens[index] && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index])) index += 1;
  }
  if (tokens[index] === 'sudo') index += 1;
  if (tokens[index] === 'command') index += 1;

  const gitToken = tokens[index] || '';
  if (gitToken !== 'git' && !/\/git$/.test(gitToken)) return null;
  index += 1;

  let gitCwd = cwd;
  let unsupported = null;
  while (tokens[index] && tokens[index].startsWith('-')) {
    const flag = tokens[index];
    index += 1;
    if (flag === '-C') {
      if (gitCwd && tokens[index]) gitCwd = path.resolve(gitCwd, tokens[index]);
      index += 1;
    } else if (flag === '-c') {
      index += 1;
    } else if (flag === '--git-dir' || flag === '--work-tree') {
      unsupported = flag;
      index += 1;
    }
  }

  return tokens[index] === 'commit' || tokens[index] === 'push'
    ? { subcommand: tokens[index], cwd: gitCwd, unsupported }
    : null;
}

function findGitCommand(command, initialCwd = null) {
  for (const innerCommand of extractShellEvalCommands(command || '')) {
    const info = findGitCommand(innerCommand, initialCwd);
    if (info) return info;
  }

  let cwd = initialCwd ? path.resolve(initialCwd) : null;
  for (const segment of splitShellSegments(command || '')) {
    const tokens = shellTokens(segment);
    if (tokens.length === 0) continue;
    if (tokens[0] === 'cd' && tokens[1] && cwd) {
      cwd = path.resolve(cwd, tokens[1]);
      continue;
    }
    const info = gitInfoFromTokens(tokens, cwd);
    if (info) return info;
  }
  return null;
}

function shellTokens(segment) {
  const tokens = [];
  let current = '';
  let quote = '';

  const source = String(segment || '');
  for (let index = 0; index < source.length; index += 1) {
    const ch = source[index];
    if (ch === '\\' && quote !== "'") {
      const next = source[index + 1];
      if (next && shouldEscapeShellChar(next, quote)) {
        current += next;
        index += 1;
      } else {
        current += ch;
      }
      continue;
    }
    if (quote) {
      if (ch === quote) quote = '';
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current) tokens.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (current) tokens.push(current);
  return tokens;
}

function shouldEscapeShellChar(ch, quote) {
  if (quote === '"') return ch === '"' || ch === '\\' || ch === '$' || ch === '`' || ch === '\n';
  return /\s/.test(ch) || ch === '"' || ch === "'" || ch === '\\' || ch === ';' || ch === '&' || ch === '|' || ch === '<' || ch === '>' || ch === '(' || ch === ')';
}

function resolveGitAuditProjectRoot(projectRoot, command) {
  const info = findGitCommand(command, projectRoot);
  if (!info) return path.resolve(projectRoot);
  if (info.unsupported) {
    throw new Error(`unsupported git audit option: ${info.unsupported}`);
  }
  const targetCwd = info.cwd || path.resolve(projectRoot);
  return path.resolve(git(targetCwd, ['rev-parse', '--show-toplevel']));
}

function auditGitCommand(projectRoot, command, options = {}) {
  const mode = isGitPush(command) ? 'push' : 'commit';
  const auditRoot = resolveGitAuditProjectRoot(projectRoot, command);
  const input = mode === 'push' ? collectPushDiff(auditRoot) : collectStagedDiff(auditRoot);
  const agentOptions = resolveAgentOptions(options.agent);
  const agentMeta = makeAgentMeta(agentOptions);

  if (input.files.length === 0 || !input.diff) {
    return result('code-audit-clean', 'allow', mode, input, [], null, 'yieldOS code-audit: no code changes to audit', null, { maxIterations: 0, agent: agentMeta, projectRoot: auditRoot });
  }

  if (mode === 'push') {
    return attachCdscArtifacts(auditRoot, auditPush(auditRoot, input, agentOptions, agentMeta, auditRoot, options));
  }

  return attachCdscArtifacts(auditRoot, auditCommit(auditRoot, input, options, agentOptions, agentMeta, auditRoot));
}

function auditPush(projectRoot, input, agentOptions, agentMeta, auditRoot = projectRoot, options = {}) {
  const findings = collectFindings(projectRoot, input, agentOptions, agentMeta);
  if (agentAuditFailed(agentMeta)) {
    return result('code-audit-verification-failed', 'block', 'push', input, findings, null, agentFailureMessage(agentMeta), null, { maxIterations: 0, agent: agentMeta, projectRoot: auditRoot });
  }
  if (findings.length === 0) {
    return result('code-audit-clean', 'allow', 'push', input, [], null, 'yieldOS code-audit: clean', null, { maxIterations: 0, agent: agentMeta, projectRoot: auditRoot });
  }

  const highest = highestSeverity(findings);
  if (blockingSeveritiesForRuntime(options.runtimeConfig).includes(highest)) {
    return result('code-audit-blocked', 'block', 'push', input, findings, null, `yieldOS code-audit blocked unresolved ${highest}-risk code before push`, null, { maxIterations: 0, agent: agentMeta, projectRoot: auditRoot });
  }

  return result('code-audit-warning', 'allow', 'push', input, findings, null, 'yieldOS code-audit found low-risk code; see log', null, { maxIterations: 0, agent: agentMeta, projectRoot: auditRoot });
}

function auditCommit(projectRoot, initialInput, options, agentOptions, agentMeta, auditRoot = projectRoot) {
  let input = initialInput;
  let findings = collectFindings(projectRoot, input, agentOptions, agentMeta);
  const maxIterations = options.maxFixIterations || MAX_FIX_ITERATIONS;
  const patches = [];

  while (findings.length > 0 && patches.length < maxIterations) {
    const highest = highestSeverity(findings);
    if (!PATCHABLE_SEVERITIES.includes(highest)) break;

    const scopedFindings = findings.filter((finding) => finding.severity === highest);
    const patch = patchFindings(projectRoot, input, scopedFindings, agentOptions, agentMeta);
    if (!patch.fixed) break;

    patches.push(patch);
    input = collectStagedDiff(projectRoot);
    findings = collectFindings(projectRoot, input, agentOptions, agentMeta);
  }

  if (patches.length > 0) {
    const patch = combinePatches(patches);
    patch.limitReached = findings.length > 0 && patches.length >= maxIterations;
    const verification = verifyFix(projectRoot);
    if (!verification.ok) {
      return result('code-audit-verification-failed', 'block', 'commit', input, findings, patch, verificationFailureMessage(patch), verification, { maxIterations, agent: agentMeta, projectRoot: auditRoot });
    }
    if (agentAuditFailed(agentMeta)) {
      return result('code-audit-verification-failed', 'block', 'commit', input, findings, patch, agentFailureMessage(agentMeta), verification, { maxIterations, agent: agentMeta, projectRoot: auditRoot });
    }
    return result('code-audit-fix-applied', 'block', 'commit', input, findings, patch, fixAppliedMessage(patch), verification, { maxIterations, agent: agentMeta, projectRoot: auditRoot });
  }

  if (agentAuditFailed(agentMeta)) {
    return result('code-audit-verification-failed', 'block', 'commit', input, findings, null, agentFailureMessage(agentMeta), null, { maxIterations, agent: agentMeta, projectRoot: auditRoot });
  }

  if (findings.length === 0) {
    return result('code-audit-clean', 'allow', 'commit', input, [], null, 'yieldOS code-audit: clean', null, { maxIterations, agent: agentMeta, projectRoot: auditRoot });
  }

  const highest = highestSeverity(findings);
  if (blockingSeveritiesForRuntime(options.runtimeConfig).includes(highest)) {
    return result('code-audit-blocked', 'block', 'commit', input, findings, null, `yieldOS code-audit blocked unresolved ${highest}-risk code`, null, { maxIterations, agent: agentMeta, projectRoot: auditRoot });
  }

  return result('code-audit-warning', 'allow', 'commit', input, findings, null, `yieldOS code-audit found ${highest}-risk code; see log`, null, { maxIterations, agent: agentMeta, projectRoot: auditRoot });
}

function collectFindings(projectRoot, input, agentOptions, agentMeta) {
  const findings = redTeam(input);
  if (!agents.isAgentReviewEnabled(agentOptions)) return findings;

  try {
    agentMeta.runs += 1;
    const agentFindings = agents.runAgentRedTeam(projectRoot, input, agentOptions);
    agentMeta.findings += agentFindings.length;
    return dedupeFindings([...findings, ...agentFindings]);
  } catch (err) {
    agentMeta.errors.push(err.message);
    return findings;
  }
}

function patchFindings(projectRoot, input, findings, agentOptions, agentMeta) {
  const deterministicPatch = blueTeam(projectRoot, findings);
  if (deterministicPatch.fixed) {
    return { ...deterministicPatch, source: 'deterministic' };
  }

  if (!agents.isAgentFixEnabled(agentOptions)) return deterministicPatch;

  try {
    agentMeta.runs += 1;
    const agentPatch = agents.runAgentBlueTeam(projectRoot, input, findings, agentOptions);
    if (!agentPatch.patch) return deterministicPatch;
    const applied = applyAgentPatch(projectRoot, agentPatch.patch, input.files);
    agentMeta.patchApplied = true;
    return {
      fixed: true,
      files: applied.files,
      appliedFindings: unique(findings.map((finding) => finding.ruleId)),
      source: 'agent',
    };
  } catch (err) {
    agentMeta.errors.push(err.message);
    return deterministicPatch;
  }
}

function highestSeverity(findings) {
  const order = ['info', 'low', 'medium', 'high', 'critical'];
  return findings.reduce((highest, finding) => (
    order.indexOf(finding.severity) > order.indexOf(highest) ? finding.severity : highest
  ), 'info');
}

function blockingSeveritiesForRuntime(runtimeConfig = {}) {
  return BLOCKING_BY_RUNTIME_MODE[runtimeConfig?.mode] || BLOCKING_BY_RUNTIME_MODE.standard;
}

function combinePatches(patches) {
  return {
    fixed: patches.some((patch) => patch.fixed),
    iterations: patches.length,
    files: unique(patches.flatMap((patch) => patch.files || [])),
    appliedFindings: unique(patches.flatMap((patch) => patch.appliedFindings || [])),
    sources: unique(patches.map((patch) => patch.source).filter(Boolean)),
  };
}

function fixAppliedMessage(patch) {
  return `yieldOS code-audit applied ${patch.iterations} security fix pass(es); rerun git commit`;
}

function verificationFailureMessage(patch) {
  if (patch.limitReached) {
    return `yieldOS code-audit reached the ${patch.iterations}-pass fix limit before verification was clean`;
  }
  return 'yieldOS code-audit fix did not verify cleanly';
}

function unique(items) {
  return Array.from(new Set(items));
}

function result(verdict, action, mode, input, findings, patch, message, verification = null, meta = {}) {
  return {
    handled: true,
    verdict,
    action,
    mode,
    diffSource: input.diffSource,
    diffHash: input.diffHash,
    range: input.range,
    files: input.files,
    findings,
    patch,
    verification,
    maxIterations: meta.maxIterations || 0,
    agent: meta.agent || makeAgentMeta(resolveAgentOptions()),
    projectRoot: meta.projectRoot || null,
    message,
  };
}

function resolveAgentOptions(optionOverrides) {
  const base = agents.agentOptionsFromEnv(process.env);
  if (process.env.YIELDOS_AGENT_CHILD === '1') return base;
  return { ...base, ...(optionOverrides || {}) };
}

function makeAgentMeta(agentOptions) {
  return {
    mode: agentOptions.mode,
    provider: agentOptions.provider,
    enabled: agents.isAgentReviewEnabled(agentOptions),
    runs: 0,
    findings: 0,
    patchApplied: false,
    errors: [],
  };
}

function agentAuditFailed(agentMeta) {
  return Boolean(agentMeta.enabled && agentMeta.errors.length > 0);
}

function agentFailureMessage(agentMeta) {
  return `yieldOS code-audit agent review failed: ${agentMeta.errors[0]}`;
}

function dedupeFindings(findings) {
  const seen = new Set();
  return findings.filter((finding) => {
    const key = [finding.ruleId, finding.file, finding.line].join('\0');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

module.exports = {
  auditGitCommand,
  agentOptionsFromEnv: agents.agentOptionsFromEnv,
  buildAuditState,
  collectStagedDiff,
  collectPushDiff,
  highestSeverity,
  isGitAuditCommand,
  isGitCommit,
  isGitPush,
  gitSubcommand,
  resolveGitAuditProjectRoot,
  stripQuotedText,
  redTeam,
  blockingSeveritiesForRuntime,
  MAX_FIX_ITERATIONS,
  writeAuditState,
  readAuditState,
  verifyAuditState,
};
