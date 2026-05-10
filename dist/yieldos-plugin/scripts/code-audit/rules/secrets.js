'use strict';

const { findDocsExampleSecret, isDocsExampleFile } = require('../doc-secrets');
const {
  addedTextForFile,
  isJavaScriptLikeFile,
  isRuntimeCodeFile,
  makeFinding,
} = require('./shared');

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
  const consoleLog = /\bconsole\.(?:log|debug|info|warn|error)\s*\(/.test(item.code)
    && /(process\.env|token|secret|password|passwd|api[_-]?key|authorization|bearer)/i.test(item.code);
  const mobileLog = isMobileLogCall(item) && hasSensitiveMobileLogPayload(item.code);
  if (!consoleLog && !mobileLog) return null;
  return makeFinding(item, 'sensitive-logging', 'high', 'Sensitive value logged', {
    attackerControlledInput: 'Runtime secrets, credentials, speech transcripts, messages, contacts, or action URLs can enter app context.',
    vulnerableSink: 'Application log output.',
    exploitPath: 'An attacker or insider with log access can recover sensitive values emitted by this statement.',
    impact: 'Credential or PII disclosure and possible account, infrastructure, or user privacy compromise.',
    fixStrategy: 'remove-line',
  });
}

function isMobileLogCall(item) {
  const file = String(item.file || '');
  if (!/\.(?:kt|java)$/i.test(file)) return false;
  return /\b(?:Timber(?:\.tag\s*\([^)]*\))?\s*\.\s*(?:v|d|i|w|e)|Log\s*\.\s*(?:v|d|i|w|e))\s*\(/.test(item.code);
}

function hasSensitiveMobileLogPayload(code) {
  const line = String(code || '');
  if (!/[,$]|\$\{/.test(line)) return false;
  return /(token|secret|password|passwd|api[_-]?key|authorization|bearer|text|message|uri|url|phone|contact|email|address|location|stt|tts|speech|transcript|voice|command\.text|normalizedText|spec\.uri|canonicalName|pendingMessage)/i.test(line);
}

function hardcodedSecret(item) {
  if (item.sign !== '+') return null;
  const secretName = '(?:api[_-]?key|private[_-]?key|encryption[_-]?key|secret|token|password|passwd)';
  const quotedSecret = new RegExp(`${secretName}\\s*[:=]\\s*['"][^'"]{12,}['"]`, 'i');
  const envLikeSecret = new RegExp(`['"][A-Z0-9_]*${secretName.replace(/\\/g, '\\\\')}\\s*=\\s*([A-Za-z0-9._~+/=-]{24,})['"]`, 'i');
  const providerToken = /['"](?:sk|ghp|xox[abprs])-?[A-Za-z0-9_-]{16,}['"]/;
  const envMatch = envLikeSecret.exec(item.code);
  const hasEnvSecret = envMatch && !isPlaceholderSecretLiteral(envMatch[1]);
  if (!quotedSecret.test(item.code) && !providerToken.test(item.code) && !hasEnvSecret) return null;
  return makeFinding(item, 'hardcoded-secret', 'critical', 'Hardcoded secret introduced', {
    attackerControlledInput: 'The committed source tree is readable by anyone with repository access.',
    vulnerableSink: 'Secret literal in source code.',
    exploitPath: 'A repository reader can copy the credential directly from the commit.',
    impact: 'Credential compromise; the secret must be rotated.',
    fixStrategy: 'manual',
  });
}

function weakSecretDefault(item) {
  if (item.sign !== '+') return null;
  if (!isRuntimeCodeFile(item.file)) return null;
  const credentialName = /(?:(?:jwt|session|cookie|signing|auth|admin|api|access|gateway|webhook).{0,50}(?:secret|token|key)|(?:secret|token|key).{0,50}(?:jwt|session|cookie|signing|auth|admin|api|access|gateway|webhook))/i;
  if (!credentialName.test(item.code)) return null;

  const defaultMatch = /(?:=\s*|\.default\s*\(\s*|default\s*=\s*|SecretStr\s*\(\s*)['"]([^'"]{4,})['"]/.exec(item.code);
  if (!defaultMatch || !isKnownWeakSecretLiteral(defaultMatch[1])) return null;

  return makeFinding(item, 'security-misconfiguration', 'high', 'Known default credential protects authentication', {
    attackerControlledInput: 'A deployment can start without setting the runtime JWT, session, cookie, admin token, or signing secret.',
    vulnerableSink: 'Authentication, admin API, or session signing configuration.',
    exploitPath: 'An attacker who knows the committed default can forge or validate security tokens when production inherits the fallback.',
    impact: 'Authentication bypass or session forgery if the environment secret is missing or misconfigured.',
    fixStrategy: 'manual',
  });
}

function isKnownWeakSecretLiteral(value) {
  const normalized = String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!normalized || normalized.length < 4) return false;
  if (/^(dev|test|demo|dummy|sample|example|default|changeme|change-me|please-change|your-secret|secret|password|insecure)(?:-|$)/.test(normalized)) {
    return true;
  }
  return /(?:dev-only|change-me|changeme|do-not-use|not-for-prod|replace-me|super-secret|supersecret)/.test(normalized);
}

function isPlaceholderSecretLiteral(value) {
  const normalized = String(value || '').toLowerCase();
  if (!normalized) return true;
  if (/(redacted|your[_-]?|placeholder|example|dummy|fake|test|change[_-]?me)/i.test(normalized)) return true;
  const compact = normalized.replace(/[^a-z0-9]/g, '');
  if (compact.length < 24) return true;
  return /^(x+|0+|1+|a+|abc123+)$/.test(compact);
}

function failOpenWebhookSignature(item, input) {
  if (item.sign !== '+') return null;
  const file = String(item.file || '').replace(/\\/g, '/');
  if (!isJavaScriptLikeFile(file)) return null;
  if (!/(?:webhook|callback)/i.test(file)) return null;
  if (!/(?:accepting unsigned|skip(?:ping)? verification|without signature|unsigned payload|no signature required)/i.test(item.code)) {
    return null;
  }

  const sameFileAdded = addedTextForFile(input, item.file);
  if (!/\b[A-Z0-9_]*WEBHOOK[A-Z0-9_]*(?:SECRET|SIGNING|SIGNATURE)|webhook[_-]?secret|signing[_-]?secret/i.test(sameFileAdded)) {
    return null;
  }
  if (hasProductionWebhookFailClosed(sameFileAdded)) return null;

  return makeFinding(item, 'security-misconfiguration', 'high', 'Webhook signature check fails open', {
    attackerControlledInput: 'An external HTTP client can send provider-style webhook payloads when the signing secret is unset.',
    vulnerableSink: 'Webhook handler that accepts unsigned payloads instead of failing closed.',
    exploitPath: 'A misconfigured deployment without the webhook secret processes forged callbacks, messages, or status updates.',
    impact: 'Unauthorized state changes, fake provider events, message injection, or callback abuse.',
    fixStrategy: 'manual',
  });
}

function hasProductionWebhookFailClosed(text) {
  return /if\s*\(\s*!\s*[^)]*(?:WEBHOOK[A-Z0-9_]*(?:SECRET|SIGNING|SIGNATURE)|webhookSecret|signingSecret)[^)]*\)[\s\S]{0,180}(?:500|503|throw|not configured|missing webhook secret|missing signing secret)/i.test(text);
}

module.exports = {
  docsExampleSecret,
  failOpenWebhookSignature,
  hardcodedSecret,
  sensitiveLogging,
  weakSecretDefault,
};
