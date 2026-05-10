'use strict';

const path = require('node:path');

const logger = require('../logger');
const selfDefense = require('../self-defense');
const auditEventCheckpoint = require('../audit-event-checkpoint');
const credentialsScanner = require('../credentials-scanner');
const credentialAuth = require('../credential-auth');
const terminalArt = require('../terminal-art');

async function handleSelfDefense(input, projectRoot, options = {}) {
  const emitDecision = options.emitDecision;
  if (typeof emitDecision !== 'function') throw new Error('handleSelfDefense requires emitDecision');

  const tool = input.tool_name;
  const ti = input.tool_input || {};
  if (tool === 'Read') {
    const target = ti.file_path || ti.path;
    if (target && selfDefense.isCredentialAuthProtectedPath(target)) {
      logger.logSelfDefense(projectRoot, { action: 'Read:credential-auth-cache', target });
      emitDecision('self-defense-block', 'yieldOS bloqueó lectura del cache de autorización de credenciales', 2);
    }
  }
  if (tool === 'Write' || tool === 'Edit') {
    const target = ti.file_path || ti.path;
    if (target && selfDefense.isProtectedPath(target)) {
      logger.logSelfDefense(projectRoot, { action: tool, target });
      emitDecision('self-defense-block', `yieldOS bloqueó modificación de archivo protegido: ${path.basename(target)}`, 2);
    }
  }
  if (tool === 'Bash') {
    const cmd = ti.command || '';
    if (credentialsScanner.commandReferencesCredentialPath(cmd, projectRoot)) {
      logger.appendEntry(projectRoot, 'Credentials Bash Blocked (credential path referenced)', {
        Command: cmd,
        Reason: 'Bash referenced a credential-looking path; use the Read tool credential authorization flow instead',
      });
      process.stderr.write(`${terminalArt.alertLine('bash bloqueado: el comando referencia una ruta de credenciales')}\n`);
      process.stderr.write('[yieldOS:verdict] credentials-read-blocked\n');
      emitDecision('credentials-read-blocked', 'yieldOS bloqueó Bash porque el comando referencia credenciales; usá el flujo Read con nonce', 2);
    }
    if (credentialsScanner.projectHasCredentialSentinel(projectRoot)) {
      logger.appendEntry(projectRoot, 'Credentials Bash Blocked (credential sentinel present)', {
        Command: cmd,
        Reason: 'Bash has unrestricted filesystem access; use the Read tool credential authorization flow instead',
      });
      process.stderr.write(`${terminalArt.alertLine('bash bloqueado: el proyecto contiene archivos de credenciales')}\n`);
      process.stderr.write('[yieldOS:verdict] credentials-read-blocked\n');
      emitDecision('credentials-read-blocked', 'yieldOS bloqueó Bash porque el proyecto contiene credenciales; usá el flujo Read con nonce', 2);
    }
    if (credentialAuth.commandReferencesCredentialAuth(cmd)) {
      logger.logSelfDefense(projectRoot, { action: 'Bash:credential-auth-cache', target: cmd });
      emitDecision('self-defense-block', 'yieldOS bloqueó acceso al cache de autorización de credenciales', 2);
    }
    if (auditEventCheckpoint.commandReferencesAuditEventCheckpoint(cmd)) {
      logger.logSelfDefense(projectRoot, { action: 'Bash:audit-event-checkpoint', target: cmd });
      emitDecision('self-defense-block', 'yieldOS bloqueó acceso al checkpoint de audit event', 2);
    }
    if (/rm\s+-rf\s+.*\.claude(?:-plugin)?[\/\\]/.test(cmd)) {
      logger.logSelfDefense(projectRoot, { action: 'Bash:rm', target: cmd });
      emitDecision('self-defense-block', 'yieldOS bloqueó eliminación de archivos protegidos', 2);
    }
    if (isProtectedBashMutation(cmd, projectRoot)) {
      logger.logSelfDefense(projectRoot, { action: 'Bash:protected-mutation', target: cmd });
      emitDecision('self-defense-block', 'yieldOS bloqueó modificación de evidencia protegida', 2);
    }
  }
}

function isProtectedBashMutation(command, projectRoot = process.cwd()) {
  const cmd = String(command || '').replace(/\\/g, '/');
  if (!referencesProtectedSecurityPath(cmd, projectRoot)) {
    return false;
  }
  return /(?:^|\s)(?:rm|mv|cp|tee|truncate|sed|dd)\b|>{1,2}|\b(?:writeFileSync|appendFileSync|createWriteStream|openSync|rmSync|unlinkSync|renameSync|copyFileSync|writeFile|appendFile|unlink|rename)\b|\bwrite_text\s*\(|\bopen\s*\([^)]*,\s*['"][wa]/.test(cmd);
}

function referencesProtectedSecurityPath(command, projectRoot) {
  const cmd = String(command || '').replace(/\\/g, '/');
  const protectedLeaf = '(?:oracles/|code-audit-state\\.json|code-audit-events\\.md|dependency-events\\.md|audit-events\\.md|yieldos-events\\.jsonl|\\.yieldos-events\\.lock|yieldos-rewrites\\.json|\\.yieldos-credentials-authorized)';
  const boundary = '(?:^|[\\s"\'`=:(])';
  const relativePattern = new RegExp(`${boundary}(?:\\./)?security/${protectedLeaf}`);
  if (relativePattern.test(cmd)) return true;

  const root = path.resolve(projectRoot || process.cwd()).replace(/\\/g, '/').replace(/\/+$/, '');
  if (root && cmd.includes(`${root}/security/`)) {
    const absoluteProjectPattern = new RegExp(escapeRegExp(`${root}/security/`) + protectedLeaf);
    if (absoluteProjectPattern.test(cmd)) return true;
  }

  const pathToken = '/[^\\s"\'`<>|;&]*';
  const absoluteSecurityPattern = new RegExp(`${boundary}${pathToken}/security/${protectedLeaf}`);
  return absoluteSecurityPattern.test(cmd);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  handleSelfDefense,
  isProtectedBashMutation,
  referencesProtectedSecurityPath,
};
