#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const policyFetcher = require('./policy-fetcher');
const credentialsScanner = require('./credentials-scanner');
const terminalArt = require('./terminal-art');
const logger = require('./logger');

const AUTH_TTL_MS = 30 * 60 * 1000;

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
  const filePath = authFlagPath(projectRoot);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify({
    authorized_at: new Date().toISOString(),
    ttl_ms: AUTH_TTL_MS,
  }, null, 2)}\n`);
  return filePath;
}

function writeJsonAndExit(payload, exitCode) {
  process.stdout.write(JSON.stringify(payload), () => process.exit(exitCode));
}

function buildCredentialsWarning(findings) {
  const art = terminalArt.randomAlertArt();
  const summary = findings.map((finding) => {
    const sample = finding.sample ? terminalArt.redactCredential(finding.sample) : '[redacted]';
    return `${finding.id} x${finding.count} -> ${sample}`;
  });

  return [
    '```diff',
    '- ╔════════════════════════════════════════════════════════════════╗',
    '- ║   🛡  yieldOS  ·  CREDENCIAL DETECTADA EN EL PROMPT            ║',
    '- ╚════════════════════════════════════════════════════════════════╝',
    '-',
    ...art.split('\n').map((line) => `- ${line}`),
    '-',
    '- Patrones detectados:',
    ...summary.map((line) => `-   ${line}`),
    '-',
    '- yieldOS bloqueó tu prompt antes de que llegara al modelo.',
    '- El valor NO fue registrado en el log ni enviado al agente.',
    '-',
    '- Para reenviar el pedido, reemplazá el secreto por una referencia.',
    '- Ejemplo: usá $OPENAI_API_KEY en vez de pegar el valor real.',
    '-',
    '- Si necesitás que el agente lea credenciales desde un archivo local,',
    '- autorizá la lectura con la frase exacta:',
    '+   AUTORIZO A LEER LAS CREDENCIALES',
    '```',
  ].join('\n');
}

async function main() {
  const input = parseInput(readStdinSync());
  const projectRoot = projectCwd(input);
  const prompt = input.prompt || input.user_prompt || input.message || '';

  try {
    if (policyFetcher.isRuntimeCacheStale()) {
      await policyFetcher.refreshFromOrigin();
    }
  } catch (_) { /* ignore */ }

  if (credentialsScanner.authorizationPhraseDetected(prompt)) {
    try {
      const filePath = writeAuthFlag(projectRoot);
      logger.appendEntry(projectRoot, 'Credentials Read Authorization Granted', {
        File: filePath,
        'Valid for': '30 minutes',
        Reason: 'user typed the exact authorization phrase',
      });
      process.stderr.write(`${terminalArt.statusLine('[yieldOS] Autorización para leer credenciales registrada (válida 30 min)', 'success')}\n`);
      process.stderr.write('[yieldOS:verdict] credentials-read-authorized\n');
    } catch (error) {
      process.stderr.write(`[yieldOS] no se pudo registrar la autorización: ${error.message}\n`);
    }
    process.exit(0);
  }

  const { findings } = credentialsScanner.scan(prompt);
  if (findings.length > 0) {
    logger.appendEntry(projectRoot, 'Blocked Prompt (credentials in user input)', {
      Patterns: findings.map((finding) => `${finding.id} (x${finding.count})`),
      Note: 'values were not logged for safety; only pattern IDs',
    });
    process.stderr.write(`${terminalArt.alertLine(`prompt bloqueado: contiene credenciales (${findings.map((finding) => finding.id).join(', ')})`)}\n`);
    process.stderr.write('[yieldOS:verdict] prompt-credentials-blocked\n');
    writeJsonAndExit({
      decision: 'block',
      reason: 'yieldOS blocked the user prompt because it appears to contain credentials.',
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: buildCredentialsWarning(findings),
      },
    }, 2);
    return;
  }

  process.exit(0);
}

main().catch((error) => {
  process.stderr.write(`[yieldOS:fatal] ${error.message}\n`);
  process.exit(0);
});
