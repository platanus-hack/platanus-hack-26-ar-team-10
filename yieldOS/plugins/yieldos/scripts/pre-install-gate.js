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

function emitDecision(verdict, message, exitCode) {
  if (message) {
    process.stderr.write(`[yieldOS] ${message}\n`);
  }
  process.stderr.write(`[yieldOS:verdict] ${verdict}\n`);
  // Also emit hookSpecificOutput JSON so the agent receives the stamp instruction
  // even on shortcut paths (self-defense, instruction-edit injection) that don't
  // pass through processCandidates.
  emitHookOutput([{ candidate: { name: '(file)', version: 'n/a' }, decision: { verdict } }], exitCode === 2);
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

function shieldBlock(prefix, label) {
  // Renders as a colored bar in Claude Code via the markdown `diff` syntax:
  //   + line  → green  (allow / safe)
  //   - line  → red    (block / unsafe)
  //   ! line  → orange (warning / suggestion)
  // The triple-backtick fence is part of the stamp so the renderer applies the color.
  return [
    '```diff',
    `${prefix} ▎ 🛡  yieldOS  ·  ${label}`,
    '```',
  ].join('\n');
}

const STAMP_BY_VERDICT = {
  'allowlist-match':           shieldBlock('+', 'Validado · allowlist'),
  'verification-passed':       shieldBlock('+', 'Validado · análisis OK'),
  'denylist-match':            shieldBlock('-', 'Bloqueado · denylist'),
  'category-d-blocked':        shieldBlock('-', 'Bloqueado · categoría crítica'),
  'verification-failed':       shieldBlock('-', 'Bloqueado · señales sospechosas'),
  'build-script-not-approved': shieldBlock('-', 'Bloqueado · build script no aprobado'),
  'native-suggest':            shieldBlock('!', 'Sugerencia · usar API nativa'),
  'category-a-rewrite':        shieldBlock('+', 'Optimizado · rewrite local'),
  'injection-blocked':         shieldBlock('-', 'Bloqueado · inyección detectada'),
  'self-defense-block':        shieldBlock('-', 'Bloqueado · archivo protegido'),
};

function stampFor(verdict) {
  return STAMP_BY_VERDICT[verdict] || `> 🛡  yieldOS verdict: ${verdict}`;
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

function emitHookOutput(interventions, blocked) {
  if (!interventions || interventions.length === 0) return;

  // Build a single visible line that the user will see. Use the strongest verdict
  // (block > rewrite > native > verification > allow) to pick the stamp.
  const order = [
    'denylist-match', 'category-d-blocked', 'verification-failed', 'build-script-not-approved',
    'injection-blocked', 'self-defense-block',
    'category-a-rewrite', 'native-suggest',
    'verification-passed', 'allowlist-match',
  ];
  let chosen = interventions[0].decision.verdict;
  let chosenIdx = order.indexOf(chosen);
  for (const i of interventions) {
    const idx = order.indexOf(i.decision.verdict);
    if (idx >= 0 && (chosenIdx < 0 || idx < chosenIdx)) {
      chosen = i.decision.verdict;
      chosenIdx = idx;
    }
  }

  const stamp = stampFor(chosen);
  const summary = interventions
    .map((i) => `${i.candidate.name}@${i.candidate.version} → ${i.decision.verdict}`)
    .join('; ');

  // Hook JSON output. PreToolUse hooks in Claude Code can emit
  // hookSpecificOutput.additionalContext on stdout, which the harness injects
  // into the model's context for the next turn. This makes yieldOS visible to
  // the agent even on exit 0 (allow) flows.
  const out = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: [
        `yieldOS intervened on this tool call.`,
        `Verdict: ${chosen}.`,
        `Per-candidate: ${summary}.`,
        `End your reply to the user with this exact line on its own line, separated by a blank line:`,
        stamp,
      ].join('\n'),
    },
  };
  process.stdout.write(JSON.stringify(out));
}

function readFileIfExists(filePath) {
  try { return fs.readFileSync(filePath, 'utf8'); }
  catch (_) { return ''; }
}

function contentForWriteOrEdit(tool, toolInput) {
  const filePath = toolInput.file_path || toolInput.path || '';
  if (tool === 'Write') {
    return { filePath, newContent: toolInput.content || '', oldContent: null };
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
    // For Write: the whole file is replaced; oldContent comes from disk.
    // For Edit: reconstruct the full new content by reading disk and applying
    // the old_string → new_string replacement. This is necessary because
    // partial fragments cannot be parsed as JSON / TOML / etc.
    const { filePath, newContent, oldContent } = contentForWriteOrEdit(tool, ti);
    candidates = classifiers.classifyWriteOrEdit(filePath, newContent, oldContent);
  }

  if (candidates.length === 0) {
    process.exit(0);
  }

  const { anyBlocked, interventions } = await processCandidates(candidates, projectRoot, policy);
  emitHookOutput(interventions, anyBlocked);
  process.exit(anyBlocked ? 2 : 0);
}

main().catch((err) => {
  process.stderr.write(`[yieldOS:fatal] ${err.message}\n`);
  process.exit(0);
});
