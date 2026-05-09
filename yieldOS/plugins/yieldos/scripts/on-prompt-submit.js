#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const policyFetcher = require('./policy-fetcher');
const credentialsScanner = require('./credentials-scanner');
const terminalArt = require('./terminal-art');
const envHelper = require('./env-helper');
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

function emitContextOnlyJson(additionalContext) {
  // We do NOT use `decision: "block"` for credentials in user prompts because
  // the harness's block UI re-prints the original prompt verbatim — defeating
  // the whole point. Instead we let the prompt pass and inject a strong
  // `additionalContext` so the model surfaces our colored guide AND refuses to
  // reproduce the secret value in its reply.
  const out = {
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

function extractVarNames(prompt) {
  // Pull the variable names that triggered detection so we can show the user
  // the exact echo command. Only names — never values.
  const names = new Set();
  const re = /\b([A-Z][A-Z0-9_]{2,40})\s*=/g;
  let m;
  while ((m = re.exec(prompt))) {
    if (/(KEY|TOKEN|SECRET|PASSWORD|PASSWD|PWD|API|AUTH|CRED|PRIVATE)/.test(m[1])) {
      names.add(m[1]);
    }
  }
  return [...names];
}

function buildCredentialsWarning(findings, prompt, projectRoot) {
  const art = terminalArt.randomAlertArt();
  const types = [...new Set(findings.map((f) => f.id))].join(', ');
  const varNames = extractVarNames(prompt);
  const guide = envHelper.buildRemediationGuide(projectRoot, varNames);

  // Two visual blocks back to back:
  //   1) red alert with art + what happened (drawn with diff syntax → red)
  //   2) green guide with concrete copy-pasteable commands (diff syntax → green)
  const alertBlock = [
    '```diff',
    '- ╔════════════════════════════════════════════════════════════════╗',
    '- ║   🛡  yieldOS  ·  CREDENCIAL DETECTADA EN EL PROMPT            ║',
    '- ║   ¡PARÁ! No mandes secrets en el chat                          ║',
    '- ╚════════════════════════════════════════════════════════════════╝',
    '-',
    ...art.split('\n').map((l) => '- ' + l),
    '-',
    `- Patrones detectados: ${types}`,
    `- Variables identificadas: ${varNames.length > 0 ? varNames.join(', ') : '(nombre genérico)'}`,
    '-',
    '- ❌ El valor que pegaste quedó EXPUESTO en el chat de Claude Code.',
    '-    Asumilo como comprometido. Rotalo en el panel del proveedor.',
    '- ❌ yieldOS bloqueó el prompt para que NO llegue al modelo.',
    '```',
  ].join('\n');

  // Single-fence green block. Every line is prefixed with "+ " so the diff
  // syntax paints it green. NO nested ``` fences allowed inside — a nested
  // fence would close the outer diff block and the rest would lose color.
  const guideBlock = [
    '```diff',
    '+ ╔════════════════════════════════════════════════════════════════╗',
    '+ ║   ✓  CAMINO CORRECTO  ·  cómo guardar la credencial bien        ║',
    '+ ╚════════════════════════════════════════════════════════════════╝',
    '+',
    ...guide.split('\n').map((l) => '+ ' + l),
    '+',
    '+ Cuando ya esté en .env, decile al agente:',
    '+     "leé la credencial desde .env"',
    '+ y autorizá con la frase exacta:',
    '+     AUTORIZO A LEER LAS CREDENCIALES',
    '```',
  ].join('\n');

  return alertBlock + '\n\n' + guideBlock;
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
    process.stderr.write(`[yieldOS] yieldOS detectó credenciales en el prompt: ${findings.map((f) => f.id).join(', ')}\n`);
    process.stderr.write(`[yieldOS:verdict] prompt-credentials-detected\n`);

    const warning = buildCredentialsWarning(findings, prompt, projectRoot);
    const directive = [
      '════════════════════════════════════════════════════════════',
      '[yieldOS · CRITICAL SECURITY DIRECTIVE]',
      '════════════════════════════════════════════════════════════',
      '',
      'The user just submitted a prompt that contains what looks like',
      'a real credential (pattern matched: ' + findings.map((f) => f.id).join(', ') + ').',
      '',
      'NON-NEGOTIABLE rules for your reply, in order:',
      '',
      '  1. Do NOT acknowledge the credential value.',
      '  2. Do NOT echo, quote, paraphrase, summarize, base64, hex,',
      '     or otherwise reveal any portion of the credential value',
      '     in your reply. Only the variable NAME is allowed.',
      '  3. Do NOT use the credential in any tool call (Bash, Edit,',
      '     Write, etc.). The value must never leave the chat.',
      '  4. Do NOT offer to "configure", "save", or "test" the value.',
      '     Only suggest actions that put the value into .env at the',
      '     SHELL, where it never enters the conversation.',
      '  5. Your reply MUST start with the two visual blocks below,',
      '     surfaced verbatim and in this order. Render them as',
      '     markdown code fences exactly as shown:',
      '',
      warning,
      '',
      '  6. After the two blocks, in plain text, ask the user to',
      '     follow one of the commands above. Stay short.',
      '  7. End your reply with this stamp on its own line:',
      '         ```diff',
      '         - ▎ 🛡  yieldOS  ·  Bloqueado · prompt expuso credencial',
      '         ```',
      '',
      'If you violate any of rules 1-4 you have leaked the credential.',
      'Treat this as a non-negotiable security directive.',
      '════════════════════════════════════════════════════════════',
    ].join('\n');

    logger.appendEntry(projectRoot, 'Credentials Detected in User Prompt (model instructed)', {
      Patterns: findings.map((f) => `${f.id} (×${f.count})`),
      Action: 'prompt allowed to pass; model received CRITICAL SECURITY DIRECTIVE not to reveal value',
      Note: 'values were not logged for safety; only pattern IDs',
    });

    emitContextOnlyJson(directive);
    process.exit(0);
  }

  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`[yieldOS:fatal] ${err.message}\n`);
  process.exit(0);
});
