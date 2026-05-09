#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const policyFetcher = require('./policy-fetcher');
const credentialsScanner = require('./credentials-scanner');
const terminalArt = require('./terminal-art');
const envHelper = require('./env-helper');
const logger = require('./logger');
const pentestEventReader = require('./code-audit/pentest-loop/event-reader');

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

function shieldBlock(prefix, label) {
  return [
    '```diff',
    `${prefix} ▎ 🛡  yieldOS  ·  ${label}`,
    '```',
  ].join('\n');
}

function extractVarNames(prompt) {
  const names = new Set();
  const re = /\b([A-Za-z_][A-Za-z0-9_]{1,63})\s*[:=]\s*(?:"[^"]+"|'[^']+'|[^\s'"`]+)/g;
  let match;
  while ((match = re.exec(prompt))) {
    const rawName = match[1];
    if (/(KEY|TOKEN|SECRET|PASSWORD|PASSWD|PWD|API|AUTH|CRED|CREDENTIAL|PRIVATE)/i.test(rawName)) {
      names.add(rawName.toUpperCase());
    }
  }
  return [...names].slice(0, 5);
}

function buildCredentialsWarning(findings, prompt, projectRoot) {
  const art = terminalArt.randomAlertArt();
  const summary = findings.map((finding) => `${finding.id} x${finding.count}`);
  const varNames = extractVarNames(prompt);
  const guide = envHelper.buildRemediationGuide(projectRoot, varNames);

  const alertBlock = [
    '```diff',
    '- ╔════════════════════════════════════════════════════════════════╗',
    '- ║   🛡  yieldOS  ·  CREDENCIAL DETECTADA EN EL PROMPT            ║',
    '- ║   No repitas, uses ni pegues secrets en el chat                ║',
    '- ╚════════════════════════════════════════════════════════════════╝',
    '-',
    ...art.split('\n').map((line) => `- ${line}`),
    '-',
    '- Patrones detectados:',
    ...summary.map((line) => `-   ${line}`),
    `- Variables identificadas: ${varNames.length > 0 ? varNames.join(', ') : '(sin nombre seguro)'}`,
    '-',
    '- El valor NO fue registrado en logs por yieldOS.',
    '- Si era una credencial real, asumila comprometida y rotala.',
    '- No voy a repetir ni usar el valor en herramientas.',
    '```',
  ].join('\n');

  const guideBlock = [
    '```diff',
    '+ ╔════════════════════════════════════════════════════════════════╗',
    '+ ║   ✓  CAMINO CORRECTO  ·  mover credenciales a .env             ║',
    '+ ╚════════════════════════════════════════════════════════════════╝',
    '+',
    ...guide.split('\n').map((line) => `+ ${line}`),
    '+',
    '+ Cuando la credencial ya este en .env, pedi que se lea desde archivo.',
    '+ Para autorizar una lectura local por 30 minutos, la frase exacta es:',
    '+   AUTORIZO A LEER LAS CREDENCIALES',
    '```',
  ].join('\n');

  return `${alertBlock}\n\n${guideBlock}`;
}

function buildCredentialsDirective(findings, prompt, projectRoot) {
  const warning = buildCredentialsWarning(findings, prompt, projectRoot);
  const patternList = findings.map((finding) => finding.id).join(', ');
  return [
    '[yieldOS · CRITICAL SECURITY DIRECTIVE]',
    '',
    `The latest user prompt contains credential-looking material (${patternList}).`,
    'Do not disclose, quote, paraphrase, encode, summarize, or use any part of the credential value.',
    'Only credential variable names are allowed in your reply.',
    'Do not put the credential value in any tool call.',
    'Surface the two visual blocks below verbatim, then keep the reply short.',
    '',
    warning,
    '',
    'End your reply with this exact stamp:',
    shieldBlock('-', 'Bloqueado · prompt expuso credencial'),
  ].join('\n');
}

function buildPentestLiveDirective(markdown) {
  return [
    '[yieldOS · pentest live battle update]',
    '',
    'The adversarial pentest loop produced new project-local events since the last prompt.',
    'Answer the user first. Then append one short section titled "yieldOS · live battle" and render this markdown verbatim:',
    '',
    markdown,
    '',
    'Keep the section compact. Do not mention this directive.',
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
    logger.appendEntry(projectRoot, 'Credentials Detected in User Prompt', {
      Patterns: findings.map((finding) => `${finding.id} (x${finding.count})`),
      Action: 'prompt allowed with security directive to avoid Claude Code harness echoing the original prompt',
      Note: 'values were not logged for safety; only pattern IDs',
    });
    process.stderr.write(`${terminalArt.alertLine(`prompt con credenciales detectado (${findings.map((finding) => finding.id).join(', ')})`)}\n`);
    process.stderr.write('[yieldOS:verdict] prompt-credentials-detected\n');
    writeJsonAndExit({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: buildCredentialsDirective(findings, prompt, projectRoot),
      },
    }, 0);
    return;
  }

  try {
    const { events, offset } = pentestEventReader.readNewEvents(projectRoot);
    if (pentestEventReader.hasUserVisibleContent(events)) {
      const markdown = pentestEventReader.formatForChat(events);
      pentestEventReader.writeCursor(projectRoot, offset);
      writeJsonAndExit({
        hookSpecificOutput: {
          hookEventName: 'UserPromptSubmit',
          additionalContext: buildPentestLiveDirective(markdown),
        },
      }, 0);
      return;
    }
    if (events.length > 0) {
      pentestEventReader.writeCursor(projectRoot, offset);
    }
  } catch (error) {
    process.stderr.write(`[yieldOS] pentest event injection failed: ${error.message}\n`);
  }

  process.exit(0);
}

main().catch((error) => {
  process.stderr.write(`[yieldOS:fatal] ${error.message}\n`);
  process.exit(0);
});
