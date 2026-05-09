#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const policyFetcher = require('./policy-fetcher');
const credentialsScanner = require('./credentials-scanner');
const logger = require('./logger');

const AUTH_TTL_MS = 30 * 60 * 1000; // 30 minutes

function readStdinSync() {
  try { return fs.readFileSync(0, 'utf8'); }
  catch (_) { return ''; }
}

function parseInput(raw) {
  if (!raw) return {};
  try { return JSON.parse(raw); }
  catch (_) { return {}; }
}

function projectCwd(input) {
  return input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

function authFlagPath(projectRoot) {
  return path.join(projectRoot, 'security', '.yieldos-credentials-authorized');
}

function writeAuthFlag(projectRoot) {
  const fp = authFlagPath(projectRoot);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, JSON.stringify({
    authorized_at: new Date().toISOString(),
    ttl_ms: AUTH_TTL_MS,
  }, null, 2));
  return fp;
}

function emitBlockJson(reason, additionalContext) {
  // PreCompact / UserPromptSubmit can return JSON to control the prompt flow.
  // The harness understands `decision: "block"` to suppress the prompt entirely.
  const out = {
    decision: 'block',
    reason,
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext,
    },
  };
  process.stdout.write(JSON.stringify(out));
}

function shieldBlock(prefix, label) {
  return ['```diff', `${prefix} ▎ 🛡  yieldOS  ·  ${label}`, '```'].join('\n');
}

function buildCredentialsWarning(findings) {
  // Colored, prominent warning with the diff syntax red highlight.
  const types = findings.map((f) => f.id).join(', ');
  return [
    '```diff',
    '- ╭───────────────────────────────────────────────────────────────╮',
    '- │  🛡  yieldOS  ·  CREDENCIALES DETECTADAS EN EL PROMPT          │',
    '- ╰───────────────────────────────────────────────────────────────╯',
    `- Tipos detectados: ${types}`,
    '- yieldOS bloqueó el prompt antes de que llegara al modelo.',
    '- Las credenciales NO fueron registradas en el log ni enviadas al agente.',
    '- Si necesitás compartir contexto sensible, usá variables de entorno o',
    '  un secret manager y referenciá el nombre, no el valor.',
    '```',
  ].join('\n');
}

function buildEnvRiskExplanation(projectRoot) {
  // This is what shows when the agent tries to read .env without authorization.
  // Renders in red via the diff syntax.
  return [
    '```diff',
    '- ╭───────────────────────────────────────────────────────────────╮',
    '- │  🛡  yieldOS  ·  LECTURA DE CREDENCIALES BLOQUEADA             │',
    '- ╰───────────────────────────────────────────────────────────────╯',
    '- El agente quiso leer un archivo de credenciales (.env / .ssh / etc).',
    '- Riesgo concreto si autorizás:',
    '-   • El agente puede ver claves de API, tokens, contraseñas DB.',
    '-   • Esos valores pueden quedar en el contexto del modelo.',
    '-   • Si el contexto se exporta o se comparte, las credenciales viajan.',
    '-   • Un prompt-injection posterior podría exfiltrarlas.',
    '- Para autorizar (válido por 30 minutos en este proyecto), respondé',
    '  EXACTAMENTE con esta frase, en mayúsculas, sin nada antes ni después:',
    '+   AUTORIZO A LEER LAS CREDENCIALES',
    '- Si NO querés autorizar, simplemente continuá la conversación;',
    '  la lectura del archivo seguirá bloqueada.',
    '```',
  ].join('\n');
}

async function main() {
  const raw = readStdinSync();
  const input = parseInput(raw);
  const projectRoot = projectCwd(input);
  const prompt = input.prompt || input.user_prompt || '';

  // Refresh policy in the background; non-blocking.
  try {
    if (policyFetcher.isRuntimeCacheStale()) {
      await policyFetcher.refreshFromOrigin();
    }
  } catch (_) { /* ignore */ }

  // Feature 1: detect the explicit authorization phrase. If present, mark the
  // session as authorized to read credentials for the next AUTH_TTL_MS.
  if (credentialsScanner.authorizationPhraseDetected(prompt)) {
    try {
      const fp = writeAuthFlag(projectRoot);
      logger.appendEntry(projectRoot, 'Credentials Read Authorization Granted', {
        File: fp,
        'Granted at': new Date().toISOString(),
        'Valid for': '30 minutes',
        Reason: 'user typed the explicit authorization phrase in their prompt',
      });
      process.stderr.write(`[yieldOS] Autorización para leer credenciales registrada (válida 30 min)\n`);
      process.stderr.write(`[yieldOS:verdict] credentials-read-authorized\n`);
    } catch (err) {
      process.stderr.write(`[yieldOS] no se pudo registrar la autorización: ${err.message}\n`);
    }
    process.exit(0);
  }

  // Feature 2: scan the prompt for accidental credential leaks. Block the prompt
  // entirely if any high-confidence pattern matches; do NOT log the values.
  const { findings, redacted: _redacted } = credentialsScanner.scan(prompt);
  if (findings.length > 0) {
    logger.appendEntry(projectRoot, 'Blocked Prompt (credentials in user input)', {
      Patterns: findings.map((f) => `${f.id} (×${f.count})`),
      Note: 'values were not logged for safety; only pattern IDs',
    });
    process.stderr.write(`[yieldOS] yieldOS bloqueó el prompt: contiene credenciales (${findings.map((f) => f.id).join(', ')})\n`);
    process.stderr.write(`[yieldOS:verdict] prompt-credentials-blocked\n`);
    emitBlockJson(
      'yieldOS blocked the user prompt because it contains what looks like real credentials. Tell the user to retry without pasting secrets.',
      buildCredentialsWarning(findings),
    );
    process.exit(2);
  }

  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`[yieldOS:fatal] ${err.message}\n`);
  process.exit(0);
});
