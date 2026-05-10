'use strict';

const fs = require('node:fs');
const path = require('node:path');

const logger = require('../logger');
const credentialsScanner = require('../credentials-scanner');
const credentialAuth = require('../credential-auth');
const terminalArt = require('../terminal-art');

function buildCredentialsReadWarning(authorizationPhrase) {
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
    '- Para autorizar la lectura por 30 minutos para esta ruta, respondé',
    '- EXACTAMENTE con esta frase, sin nada antes ni después:',
    `+   ${authorizationPhrase}`,
    '-',
    '- Si no querés autorizar, seguí la conversación normalmente.',
    '```',
  ].join('\n');
}

function writeJsonAndExit(payload, exitCode) {
  process.stdout.write(JSON.stringify(payload), () => process.exit(exitCode));
}

function readTargetForCredentialsCheck(target) {
  if (credentialsScanner.isCredentialsPath(target)) return target;
  try {
    const realTarget = fs.realpathSync.native(target);
    return credentialsScanner.isCredentialsPath(realTarget) ? realTarget : null;
  } catch (_) {
    return null;
  }
}

async function handleCredentialsRead(input, projectRoot, options = {}) {
  const stampByVerdict = options.stampByVerdict || {};
  const tool = input.tool_name;
  const toolInput = input.tool_input || {};
  if (tool !== 'Read') return false;

  const target = toolInput.file_path || toolInput.path || '';
  const credentialTarget = readTargetForCredentialsCheck(target);
  if (!credentialTarget) return false;

  if (credentialAuth.isCredentialReadAuthorized({
    projectRoot,
    targetPath: credentialTarget,
    sessionId: input.session_id,
    transcriptPath: input.transcript_path,
    nowMs: Date.now(),
  })) {
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
          stampByVerdict['credentials-read-authorized'],
        ].join('\n'),
      },
    }, 0);
    return true;
  }

  const challenge = credentialAuth.createCredentialChallenge({
    projectRoot,
    targetPath: credentialTarget,
    sessionId: input.session_id,
  });
  logger.appendEntry(projectRoot, 'Credentials Read Blocked (no authorization)', {
    File: target,
    'Required action': 'user must reply with the exact nonce phrase shown in hook output',
    'Authorization proof': 'matching latest user prompt in the Claude transcript',
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
        buildCredentialsReadWarning(challenge.expectedResponse),
        '',
        'Then append this yieldOS stamp on a separate final block:',
        stampByVerdict['credentials-read-blocked'],
        '',
        `Do not retry the Read until the user replies with the exact phrase: ${challenge.expectedResponse}`,
      ].join('\n'),
    },
  }, 2);
  return true;
}

module.exports = {
  buildCredentialsReadWarning,
  handleCredentialsRead,
  readTargetForCredentialsCheck,
};
