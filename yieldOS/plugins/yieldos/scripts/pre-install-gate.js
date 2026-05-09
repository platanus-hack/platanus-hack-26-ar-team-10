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

const STAMP_BY_VERDICT = {
  'allowlist-match': '> 🛡  Validado por yieldOS',
  'verification-passed': '> 🛡  Validado por yieldOS (análisis OK)',
  'denylist-match': '> ⛔ Bloqueado por yieldOS — denylist',
  'category-d-blocked': '> ⛔ Bloqueado por yieldOS — categoría crítica',
  'verification-failed': '> ⛔ Bloqueado por yieldOS — señales sospechosas',
  'build-script-not-approved': '> ⛔ Bloqueado por yieldOS — build script no aprobado',
  'native-suggest': '> 💡 yieldOS sugiere usar API nativa',
  'category-a-rewrite': '> ✨ yieldOS optimizó la instalación',
  'injection-blocked': '> ⛔ Bloqueado por yieldOS — inyección detectada',
  'self-defense-block': '> ⛔ Bloqueado por yieldOS — archivo protegido',
};

const VERDICT_PRIORITY = [
  'denylist-match',
  'category-d-blocked',
  'verification-failed',
  'build-script-not-approved',
  'injection-blocked',
  'self-defense-block',
  'category-a-rewrite',
  'native-suggest',
  'verification-passed',
  'allowlist-match',
];

function stampFor(verdict) {
  return STAMP_BY_VERDICT[verdict] || `> 🛡  yieldOS verdict: ${verdict}`;
}

function strongestVerdict(interventions) {
  let chosen = interventions[0]?.decision?.verdict || 'verification-passed';
  let chosenIdx = VERDICT_PRIORITY.indexOf(chosen);

  for (const item of interventions) {
    const verdict = item?.decision?.verdict;
    const idx = VERDICT_PRIORITY.indexOf(verdict);
    if (idx >= 0 && (chosenIdx < 0 || idx < chosenIdx)) {
      chosen = verdict;
      chosenIdx = idx;
    }
  }

  return chosen;
}

function formatCandidate(candidate = {}) {
  const name = candidate.name || candidate.type || 'tool-call';
  const version = candidate.version && candidate.version !== 'unknown' ? `@${candidate.version}` : '';
  return `${name}${version}`;
}

function emitHookOutput(interventions) {
  if (!interventions || interventions.length === 0) return;

  const chosen = strongestVerdict(interventions);
  const stamp = stampFor(chosen);
  const summary = interventions
    .map((item) => `${formatCandidate(item.candidate)} -> ${item.decision.verdict}`)
    .join('; ');

  const output = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: [
        'yieldOS processed this tool call.',
        `Verdict: ${chosen}.`,
        `Per-candidate: ${summary}.`,
        'End your reply to the user with this exact line on its own line, separated by a blank line:',
        stamp,
      ].join('\n'),
    },
  };

  process.stdout.write(JSON.stringify(output));
}

function readFileIfExists(filePath) {
  try { return fs.readFileSync(filePath, 'utf8'); }
  catch (_) { return ''; }
}

function contentForWriteOrEdit(tool, toolInput) {
  const filePath = toolInput.file_path || toolInput.path || '';
  if (tool === 'Write') {
    return {
      filePath,
      newContent: toolInput.content || '',
      oldContent: null,
    };
  }

  const oldString = toolInput.old_string || '';
  const newString = toolInput.new_string || '';
  const oldContent = readFileIfExists(filePath);
  if (oldString && oldContent.includes(oldString)) {
    return {
      filePath,
      newContent: oldContent.replace(oldString, newString),
      oldContent,
    };
  }

  return {
    filePath,
    newContent: toolInput.content || newString,
    oldContent: oldString || oldContent || null,
  };
}

function emitDecision(verdict, message, exitCode) {
  if (message) {
    process.stderr.write(`[yieldOS] ${message}\n`);
  }
  process.stderr.write(`[yieldOS:verdict] ${verdict}\n`);
  emitHookOutput([{
    candidate: { type: 'hook', name: 'yieldOS', version: 'unknown' },
    decision: { verdict },
  }]);
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
  const interventions = [];

  for (const candidate of candidates) {
    const decision = await decide(candidate, policy, {
      thresholds: DEFAULTS.thresholds,
      minAgeDays: DEFAULTS.audit.transitive_min_age_days,
      osv: true,
      ttlSeconds: DEFAULTS.audit.osv_cache_ttl_seconds,
    });

    interventions.push({ candidate, decision });

    switch (decision.action) {
      case 'allow':
        if (decision.verdict === 'allowlist-match') logger.logAllowed(projectRoot, candidate);
        else logger.logVerified(projectRoot, candidate, decision.meta?.findings || []);
        if (decision.message) {
          process.stderr.write(`[yieldOS] ${decision.message}\n`);
        }
        // Always emit machine-readable verdict so downstream tools (logs, benches,
        // QA harnesses) can identify what happened, even when the human-facing
        // message is intentionally silent.
        process.stderr.write(`[yieldOS:verdict] ${decision.verdict}\n`);
        break;

      case 'block-with-suggestion':
      case 'block':
        logger.logBlocked(projectRoot, candidate, decision.verdict, { findings: decision.meta?.findings });
        process.stderr.write(`[yieldOS] ${decision.message || 'blocked'}\n`);
        process.stderr.write(`[yieldOS:verdict] ${decision.verdict}\n`);
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
          process.stderr.write(`[yieldOS] ${decision.message}\n`);
          process.stderr.write(`[yieldOS:verdict] ${decision.verdict}\n`);
          process.stderr.write(`[yieldOS:rewrite-target] ${scaffold.dir}\n`);
        } catch (err) {
          process.stderr.write(`[yieldOS] error generating rewrite scaffold: ${err.message}\n`);
        }
        anyBlocked = true;
        break;
      }
    }
  }
  return { anyBlocked, interventions };
}

async function main() {
  const raw = readStdinSync();
  const input = parseInput(raw);
  const projectRoot = projectCwd(input);
  const tool = input.tool_name;
  const ti = input.tool_input || {};

  await handleSelfDefense(input, projectRoot);

  let policyResult;
  try {
    policyResult = await policyFetcher.getPolicy({ forceRefresh: false });
  } catch (err) {
    process.stderr.write(`[yieldOS] policy fetch failed: ${err.message}\n`);
    policyResult = { source: 'unavailable', policy: null };
  }
  const policy = policyResult.policy || {};

  const handled = await handleInstructionEdit(input, projectRoot, policy);
  if (handled) return;

  let candidates = [];
  if (tool === 'Bash') {
    candidates = classifiers.classifyBashCommand(ti.command || '');
  } else if (tool === 'Write' || tool === 'Edit') {
    const edit = contentForWriteOrEdit(tool, ti);
    candidates = classifiers.classifyWriteOrEdit(edit.filePath, edit.newContent, edit.oldContent);
  }

  if (candidates.length === 0) {
    process.exit(0);
  }

  const { anyBlocked, interventions } = await processCandidates(candidates, projectRoot, policy);
  emitHookOutput(interventions);
  process.exit(anyBlocked ? 2 : 0);
}

main().catch((err) => {
  process.stderr.write(`[yieldOS:fatal] ${err.message}\n`);
  process.exit(0);
});
