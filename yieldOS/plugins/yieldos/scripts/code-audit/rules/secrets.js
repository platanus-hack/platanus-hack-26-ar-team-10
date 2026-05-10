'use strict';

const { findDocsExampleSecret, isDocsExampleFile } = require('../doc-secrets');
const { makeFinding } = require('./shared');

function docsExampleSecret(item) {
  if (item.sign !== '+') return null;
  if (!isDocsExampleFile(item.file)) return null;
  if (!findDocsExampleSecret(item.code)) return null;
  return makeFinding(item, 'docs-example-secret', 'high', 'Secret-like value in docs example', {
    attackerControlledInput: 'A real-looking credential is added to tracked documentation or example configuration.',
    vulnerableSink: 'Repository documentation or example configuration files.',
    exploitPath: 'A repository reader can copy the credential-looking value from docs or an agent can reuse it in future examples.',
    impact: 'Credential disclosure risk and unsafe secret-handling patterns copied into downstream work.',
    fixStrategy: 'redact-doc-secret',
  });
}

function sensitiveLogging(item) {
  if (item.sign !== '+') return null;
  if (!/\bconsole\.(?:log|debug|info|warn|error)\s*\(/.test(item.code)) return null;
  if (!/(process\.env|token|secret|password|passwd|api[_-]?key|authorization|bearer)/i.test(item.code)) return null;
  return makeFinding(item, 'sensitive-logging', 'high', 'Sensitive value logged', {
    attackerControlledInput: 'Runtime secrets or credentials can enter process.env or request context.',
    vulnerableSink: 'Application log output.',
    exploitPath: 'An attacker or insider with log access can recover secrets emitted by this statement.',
    impact: 'Credential disclosure and possible account or infrastructure compromise.',
    fixStrategy: 'remove-line',
  });
}

function hardcodedSecret(item) {
  if (item.sign !== '+') return null;
  const quotedSecret = /(?:api[_-]?key|secret|token|password|passwd)\s*[:=]\s*['"][^'"]{12,}['"]/i;
  const providerToken = /['"](?:sk|ghp|xox[abprs])-?[A-Za-z0-9_-]{16,}['"]/;
  if (!quotedSecret.test(item.code) && !providerToken.test(item.code)) return null;
  return makeFinding(item, 'hardcoded-secret', 'critical', 'Hardcoded secret introduced', {
    attackerControlledInput: 'The committed source tree is readable by anyone with repository access.',
    vulnerableSink: 'Secret literal in source code.',
    exploitPath: 'A repository reader can copy the credential directly from the commit.',
    impact: 'Credential compromise; the secret must be rotated.',
    fixStrategy: 'manual',
  });
}

module.exports = {
  docsExampleSecret,
  hardcodedSecret,
  sensitiveLogging,
};
