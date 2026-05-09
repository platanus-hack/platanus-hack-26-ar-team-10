'use strict';

const { collectStagedDiff, collectPushDiff } = require('./git');
const { redTeam } = require('./red-team');
const { blueTeam } = require('./blue-team');
const { verifyFix } = require('./verify');
const { writeAuditState, readAuditState, verifyAuditState, buildAuditState } = require('./state');
const agents = require('./agents');
const { applyAgentPatch } = require('./agents/patch');
const { attachCdscArtifacts } = require('../oracles/cdsc/missing-auth-contract');

const MAX_FIX_ITERATIONS = 3;
const PATCHABLE_SEVERITIES = ['critical', 'high', 'medium'];
const PUSH_BLOCKING_SEVERITIES = ['critical', 'high', 'medium'];

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

  for (const segment of splitShellSegments(stripQuotedText(command || ''))) {
    const tokens = segment.trim().split(/\s+/).filter(Boolean);
    const subcommand = gitSubcommandFromTokens(tokens);
    if (subcommand) return subcommand;
  }
  return null;
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
  let index = 0;
  while (tokens[index] && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index])) index += 1;
  if (tokens[index] === 'env') {
    index += 1;
    while (tokens[index] && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index])) index += 1;
  }
  if (tokens[index] === 'command') index += 1;

  const gitToken = tokens[index] || '';
  if (gitToken !== 'git' && !/\/git$/.test(gitToken)) return null;
  index += 1;

  while (tokens[index] && tokens[index].startsWith('-')) {
    const flag = tokens[index];
    index += 1;
    if (flag === '-C' || flag === '-c' || flag === '--git-dir' || flag === '--work-tree') {
      index += 1;
    }
  }

  return tokens[index] === 'commit' || tokens[index] === 'push' ? tokens[index] : null;
}

function auditGitCommand(projectRoot, command, options = {}) {
  const mode = isGitPush(command) ? 'push' : 'commit';
  const input = mode === 'push' ? collectPushDiff(projectRoot) : collectStagedDiff(projectRoot);
  const agentOptions = resolveAgentOptions(options.agent);
  const agentMeta = makeAgentMeta(agentOptions);

  if (input.files.length === 0 || !input.diff) {
    return result('code-audit-clean', 'allow', mode, input, [], null, 'yieldOS code-audit: no code changes to audit', null, { maxIterations: 0, agent: agentMeta });
  }

  if (mode === 'push') {
    return attachCdscArtifacts(projectRoot, auditPush(projectRoot, input, agentOptions, agentMeta));
  }

  return attachCdscArtifacts(projectRoot, auditCommit(projectRoot, input, options, agentOptions, agentMeta));
}

function auditPush(projectRoot, input, agentOptions, agentMeta) {
  const findings = collectFindings(projectRoot, input, agentOptions, agentMeta);
  if (agentAuditFailed(agentMeta)) {
    return result('code-audit-verification-failed', 'block', 'push', input, findings, null, agentFailureMessage(agentMeta), null, { maxIterations: 0, agent: agentMeta });
  }
  if (findings.length === 0) {
    return result('code-audit-clean', 'allow', 'push', input, [], null, 'yieldOS code-audit: clean', null, { maxIterations: 0, agent: agentMeta });
  }

  const highest = highestSeverity(findings);
  if (PUSH_BLOCKING_SEVERITIES.includes(highest)) {
    return result('code-audit-blocked', 'block', 'push', input, findings, null, `yieldOS code-audit blocked unresolved ${highest}-risk code before push`, null, { maxIterations: 0, agent: agentMeta });
  }

  return result('code-audit-warning', 'allow', 'push', input, findings, null, 'yieldOS code-audit found low-risk code; see log', null, { maxIterations: 0, agent: agentMeta });
}

function auditCommit(projectRoot, initialInput, options, agentOptions, agentMeta) {
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
      return result('code-audit-verification-failed', 'block', 'commit', input, findings, patch, verificationFailureMessage(patch), verification, { maxIterations, agent: agentMeta });
    }
    if (agentAuditFailed(agentMeta)) {
      return result('code-audit-verification-failed', 'block', 'commit', input, findings, patch, agentFailureMessage(agentMeta), verification, { maxIterations, agent: agentMeta });
    }
    return result('code-audit-fix-applied', 'block', 'commit', input, findings, patch, fixAppliedMessage(patch), verification, { maxIterations, agent: agentMeta });
  }

  if (agentAuditFailed(agentMeta)) {
    return result('code-audit-verification-failed', 'block', 'commit', input, findings, null, agentFailureMessage(agentMeta), null, { maxIterations, agent: agentMeta });
  }

  if (findings.length === 0) {
    return result('code-audit-clean', 'allow', 'commit', input, [], null, 'yieldOS code-audit: clean', null, { maxIterations, agent: agentMeta });
  }

  const highest = highestSeverity(findings);
  if (highest === 'critical' || highest === 'high') {
    return result('code-audit-blocked', 'block', 'commit', input, findings, null, `yieldOS code-audit blocked unresolved ${highest}-risk code`, null, { maxIterations, agent: agentMeta });
  }

  return result('code-audit-warning', 'allow', 'commit', input, findings, null, `yieldOS code-audit found ${highest}-risk code; see log`, null, { maxIterations, agent: agentMeta });
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
  stripQuotedText,
  redTeam,
  MAX_FIX_ITERATIONS,
  writeAuditState,
  readAuditState,
  verifyAuditState,
};
