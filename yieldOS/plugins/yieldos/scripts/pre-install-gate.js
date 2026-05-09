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
const credentialsScanner = require('./credentials-scanner');
const terminalArt = require('./terminal-art');

const DEFAULTS = require(path.join(__dirname, '..', 'config', 'defaults.json'));
const AUTH_TTL_MS = 30 * 60 * 1000;

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

function shieldBlock(prefix, label) {
  return [
    '```diff',
    `${prefix} ▎ 🛡  yieldOS  ·  ${label}`,
    '```',
  ].join('\n');
}

const STAMP_BY_VERDICT = {
  'allowlist-match': shieldBlock('+', 'Validado · allowlist'),
  'verification-passed': shieldBlock('+', 'Validado · análisis OK'),
  'denylist-match': shieldBlock('-', 'Bloqueado · denylist'),
  'category-d-blocked': shieldBlock('-', 'Bloqueado · categoría crítica'),
  'verification-failed': shieldBlock('-', 'Bloqueado · señales sospechosas'),
  'build-script-not-approved': shieldBlock('-', 'Bloqueado · build script no aprobado'),
  'native-suggest': shieldBlock('!', 'Sugerencia · usar API nativa'),
  'category-a-rewrite': shieldBlock('+', 'Optimizado · rewrite local'),
  'injection-blocked': shieldBlock('-', 'Bloqueado · inyección detectada'),
  'self-defense-block': shieldBlock('-', 'Bloqueado · archivo protegido'),
  'credentials-read-blocked': shieldBlock('-', 'Bloqueado · lectura de credenciales sin autorización'),
  'credentials-read-authorized': shieldBlock('+', 'Validado · lectura de credenciales autorizada'),
};

const VERDICT_PRIORITY = [
  'credentials-read-blocked',
  'denylist-match',
  'category-d-blocked',
  'verification-failed',
  'build-script-not-approved',
  'injection-blocked',
  'self-defense-block',
  'category-a-rewrite',
  'native-suggest',
  'credentials-read-authorized',
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

function authFlagPath(projectRoot) {
  return path.join(projectRoot, 'security', '.yieldos-credentials-authorized');
}

function isAuthorizationActive(projectRoot) {
  const filePath = authFlagPath(projectRoot);
  if (!fs.existsSync(filePath)) return false;

  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const authorizedAt = new Date(data.authorized_at).getTime();
    const ttl = Number(data.ttl_ms || AUTH_TTL_MS);
    return Number.isFinite(authorizedAt) && Number.isFinite(ttl) && Date.now() - authorizedAt < ttl;
  } catch (_) {
    return false;
  }
}

function buildCredentialsReadWarning() {
  const art = terminalArt.randomAlertArt();
  return [
    '```diff',
    '- ╔════════════════════════════════════════════════════════════════╗',
    '- ║   🛡  yieldOS  ·  LECTURA DE CREDENCIALES BLOQUEADA            ║',
    '- ╚════════════════════════════════════════════════════════════════╝',
    '-',
    ...art.split('\n').map((line) => `- ${line}`),
    '-',
    '- El agente intentó leer un archivo de credenciales (.env / .ssh / .aws / etc).',
    '- Riesgo concreto si autorizás:',
    '-   - El agente puede ver claves de API, tokens y contraseñas.',
    '-   - Esos valores pueden quedar en el contexto del modelo.',
    '-   - Un prompt-injection posterior podría exfiltrarlas.',
    '-',
    '- Para autorizar la lectura por 30 minutos en este proyecto, respondé',
    '- EXACTAMENTE con esta frase, sin nada antes ni después:',
    '+   AUTORIZO A LEER LAS CREDENCIALES',
    '-',
    '- Si no querés autorizar, seguí la conversación normalmente.',
    '```',
  ].join('\n');
}

function writeJsonAndExit(payload, exitCode) {
  process.stdout.write(JSON.stringify(payload), () => process.exit(exitCode));
}

async function handleCredentialsRead(input, projectRoot) {
  const tool = input.tool_name;
  const toolInput = input.tool_input || {};
  if (tool !== 'Read') return false;

  const target = toolInput.file_path || toolInput.path || '';
  if (!credentialsScanner.isCredentialsPath(target)) return false;

  if (isAuthorizationActive(projectRoot)) {
    logger.appendEntry(projectRoot, 'Credentials Read Allowed (under active authorization)', {
      File: target,
      Note: 'agent read a credentials file with active user authorization',
    });
    process.stderr.write(`${terminalArt.statusLine('[yieldOS] lectura de credenciales autorizada (ventana activa)', 'success')}\n`);
    process.stderr.write('[yieldOS:verdict] credentials-read-authorized\n');
    writeJsonAndExit({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        additionalContext: [
          'yieldOS allowed a credentials-file Read under active user authorization.',
          'Verdict: credentials-read-authorized.',
          'End your reply to the user with this exact line on its own line, separated by a blank line:',
          STAMP_BY_VERDICT['credentials-read-authorized'],
        ].join('\n'),
      },
    }, 0);
    return true;
  }

  logger.appendEntry(projectRoot, 'Credentials Read Blocked (no authorization)', {
    File: target,
    'Required action': 'user must reply with the exact phrase "AUTORIZO A LEER LAS CREDENCIALES"',
    'Authorization TTL': '30 minutes once granted',
  });
  process.stderr.write(`${terminalArt.alertLine(`lectura bloqueada: ${path.basename(target)} requiere autorización explícita`)}\n`);
  process.stderr.write('[yieldOS:verdict] credentials-read-blocked\n');

  writeJsonAndExit({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: [
        'yieldOS blocked a credentials-file Read.',
        'Verdict: credentials-read-blocked.',
        'Surface this warning to the user verbatim:',
        '',
        buildCredentialsReadWarning(),
        '',
        'Then append this yieldOS stamp on a separate final block:',
        STAMP_BY_VERDICT['credentials-read-blocked'],
        '',
        'Do not retry the Read until the user replies with the exact phrase: AUTORIZO A LEER LAS CREDENCIALES',
      ].join('\n'),
    },
  }, 2);
  return true;
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
  if (await handleCredentialsRead(input, projectRoot)) return;

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
