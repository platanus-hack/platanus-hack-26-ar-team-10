#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const classifiers = require('./classifiers');
const policyFetcher = require('./policy-fetcher');
const decide = require('./decide').decide;
const logger = require('./logger');
const selfDefense = require('./self-defense');
const injectionScanner = require('./injection-scanner');
const codeAudit = require('./code-audit');
const ui = require('./ui');

const DEFAULTS = require(path.join(__dirname, '..', 'config', 'defaults.json'));

function readStdinSync() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch (_) {
    return '';
  }
}

function parseInput(raw) {
  if (!raw) return {};
  try { return JSON.parse(raw); }
  catch (_) { return {}; }
}

function projectCwd(input) {
  return input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

function emitDecision(verdict, message, exitCode) {
  ui.writeDecision({ verdict, action: exitCode === 2 ? 'block' : 'allow', message });
  process.exit(exitCode);
}

async function handleSelfDefense(input, projectRoot) {
  const tool = input.tool_name;
  const ti = input.tool_input || {};
  if (tool === 'Write' || tool === 'Edit') {
    const target = ti.file_path || ti.path;
    if (target && selfDefense.isProtectedPath(target)) {
      logger.logSelfDefense(projectRoot, { action: tool, target });
      emitDecision('self-defense-block', `yieldOS bloqueó modificación de archivo protegido: ${path.basename(target)}`, 2);
    }
  }
  if (tool === 'Bash') {
    const cmd = ti.command || '';
    if (/rm\s+-rf\s+.*\.claude(?:-plugin)?[\/\\]/.test(cmd)) {
      logger.logSelfDefense(projectRoot, { action: 'Bash:rm', target: cmd });
      emitDecision('self-defense-block', 'yieldOS bloqueó eliminación de archivos protegidos', 2);
    }
  }
}

async function handleInstructionEdit(input, projectRoot, policy) {
  const ti = input.tool_input || {};
  const target = ti.file_path || ti.path;
  if (!target) return false;
  const base = path.basename(target);
  if (!/^(?:CLAUDE\.md|AGENTS\.md|\.cursorrules)$/i.test(base)) return false;
  const content = ti.content || ti.new_string || '';
  if (typeof content !== 'string' || content.length === 0) return false;
  const findings = injectionScanner.scan(content, (policy['injection-patterns.json'] || {}).patterns);
  if (findings.length === 0) return false;
  const tier = injectionScanner.tierFromInjectionFindings(findings);
  if (tier === 'tier1' || tier === 'tier2') {
    logger.appendEntry(projectRoot, 'Blocked Instruction File Edit (injection)', {
      File: target,
      Findings: findings.map((f) => `${f.id} (${f.severity}): ${f.sample}`),
    });
    emitDecision('injection-blocked', `yieldOS bloqueó edición de ${base}: detectó intento de inyección`, 2);
    return true;
  }
  return false;
}

async function processCandidates(candidates, projectRoot, policy) {
  let anyBlocked = false;
  for (const candidate of candidates) {
    const decision = await decide(candidate, policy, {
      thresholds: DEFAULTS.thresholds,
      minAgeDays: DEFAULTS.audit.transitive_min_age_days,
      osv: true,
      ttlSeconds: DEFAULTS.audit.osv_cache_ttl_seconds,
    });

    switch (decision.action) {
      case 'allow':
        if (decision.verdict === 'allowlist-match') logger.logAllowed(projectRoot, candidate);
        else logger.logVerified(projectRoot, candidate, decision.meta?.findings || []);
        // Always emit machine-readable verdict so downstream tools (logs, benches,
        // QA harnesses) can identify what happened, even when the human-facing
        // message is intentionally silent.
        ui.writeDecision(decision);
        break;

      case 'block-with-suggestion':
      case 'block':
        logger.logBlocked(projectRoot, candidate, decision.verdict, { findings: decision.meta?.findings });
        ui.writeDecision({ ...decision, message: decision.message || 'blocked' });
        anyBlocked = true;
        break;

      case 'block-and-rewrite': {
        const sourceUrl = decision.meta?.metadata?.repository?.url || decision.meta?.metadata?.homepage || null;
        const rewriter = require('./rewriter');
        try {
          const scaffold = rewriter.writeScaffold(projectRoot, candidate, sourceUrl);
          rewriter.updateRewriteIndex(projectRoot, candidate, sourceUrl, [scaffold.indexPath], scaffold.contentHash);
          logger.logRewritten(projectRoot, candidate, {
            justification: decision.meta?.reason || 'category A',
            files: [scaffold.indexPath],
            api: 'see scaffold; agent must populate via dependency-gate skill',
            marker: scaffold.indexPath,
          });
          ui.writeDecision(decision);
          process.stderr.write(`${ui.formatRewriteTarget(scaffold.dir)}\n`);
        } catch (err) {
          ui.writeMessage(`error generating rewrite scaffold: ${err.message}`);
        }
        anyBlocked = true;
        break;
      }
    }
  }
  return anyBlocked;
}

function handleCodeAuditCommand(projectRoot, command) {
  if (!codeAudit.isGitAuditCommand(command)) return false;
  let audit;
  try {
    audit = codeAudit.auditGitCommand(projectRoot, command);
  } catch (err) {
    audit = {
      handled: true,
      verdict: 'code-audit-verification-failed',
      action: 'block',
      mode: /^\s*git\s+push/.test(command) ? 'push' : 'commit',
      files: [],
      findings: [],
      patch: null,
      message: `yieldOS code-audit failed: ${err.message}`,
    };
  }

  if (audit.files && audit.files.length > 0) {
    try {
      const shouldStageState = audit.mode === 'commit' || (audit.mode === 'push' && audit.action !== 'block');
      const stateWrite = codeAudit.writeAuditState(projectRoot, audit, { stage: shouldStageState });
      if (audit.mode === 'push' && audit.action !== 'block' && !stateWrite.committed) {
        audit = {
          ...audit,
          verdict: 'code-audit-blocked',
          action: 'block',
          message: 'yieldOS code-audit wrote verification state; commit security/code-audit-state.json and rerun git push',
        };
      }
    } catch (err) {
      audit = {
        ...audit,
        verdict: 'code-audit-verification-failed',
        action: 'block',
        message: `yieldOS code-audit could not write verification state: ${err.message}`,
      };
    }
  }

  logger.logCodeAudit(projectRoot, audit);
  ui.writeAudit(audit);
  process.exit(audit.action === 'block' ? 2 : 0);
}

async function main() {
  const raw = readStdinSync();
  const input = parseInput(raw);
  const projectRoot = projectCwd(input);
  const tool = input.tool_name;
  const ti = input.tool_input || {};

  await handleSelfDefense(input, projectRoot);

  if (tool === 'Bash') {
    handleCodeAuditCommand(projectRoot, ti.command || '');
  }

  let policyResult;
  try {
    policyResult = await policyFetcher.getPolicy({ forceRefresh: false });
  } catch (err) {
    ui.writeMessage(`policy fetch failed: ${err.message}`);
    policyResult = { source: 'unavailable', policy: null };
  }
  const policy = policyResult.policy || {};

  const handled = await handleInstructionEdit(input, projectRoot, policy);
  if (handled) return;

  let candidates = [];
  if (tool === 'Bash') {
    candidates = classifiers.classifyBashCommand(ti.command || '');
  } else if (tool === 'Write' || tool === 'Edit') {
    candidates = classifiers.classifyWriteOrEdit(ti.file_path || ti.path || '', ti.content || ti.new_string || '');
  }

  if (candidates.length === 0) {
    process.exit(0);
  }

  const blocked = await processCandidates(candidates, projectRoot, policy);
  process.exit(blocked ? 2 : 0);
}

main().catch((err) => {
  process.stderr.write(`[yieldOS:fatal] ${err.message}\n`);
  process.exit(0);
});
