'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SENTINEL_SCAN_LIMIT = 20000;
const SKIP_SENTINEL_DIRS = new Set([
  '.git',
  '.next',
  '.pytest_cache',
  '.turbo',
  '.venv',
  '__pycache__',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'target',
  'vendor',
  'venv',
]);

const SECRET_PATTERNS = [
  { id: 'openai-project-key', regex: /\bsk-proj-[A-Za-z0-9_-]{30,}\b/g, redact: '[REDACTED:openai-project-key]' },
  { id: 'anthropic-key', regex: /\bsk-ant-[A-Za-z0-9_-]{30,}\b/g, redact: '[REDACTED:anthropic-key]' },
  { id: 'openai-key', regex: /\bsk-(?!ant-|proj-)[A-Za-z0-9-]{20,}\b/g, redact: '[REDACTED:openai-key]' },
  { id: 'aws-access-key', regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, redact: '[REDACTED:aws-access-key]' },
  { id: 'aws-secret-key', regex: /\baws_secret_access_key\s*[:=]\s*[A-Za-z0-9/+=]{40}\b/gi, redact: 'aws_secret_access_key=[REDACTED]' },
  { id: 'github-token', regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b/g, redact: '[REDACTED:github-token]' },
  { id: 'github-fine-grained-token', regex: /\bgithub_pat_[A-Za-z0-9_]{50,}\b/g, redact: '[REDACTED:github-token]' },
  { id: 'stripe-live-key', regex: /\b(?:sk|pk|rk)_live_[A-Za-z0-9]{20,}\b/g, redact: '[REDACTED:stripe-live]' },
  { id: 'stripe-test-key', regex: /\b(?:sk|pk|rk)_test_[A-Za-z0-9]{20,}\b/g, redact: '[REDACTED:stripe-test]' },
  { id: 'slack-token', regex: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g, redact: '[REDACTED:slack-token]' },
  { id: 'slack-webhook', regex: /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]+/g, redact: '[REDACTED:slack-webhook]' },
  { id: 'google-api-key', regex: /\bAIza[0-9A-Za-z_-]{35}\b/g, redact: '[REDACTED:google-api-key]' },
  { id: 'gcp-service-account', regex: /"type"\s*:\s*"service_account"[\s\S]{0,3000}?"private_key"\s*:\s*"-----BEGIN/gi, redact: '[REDACTED:gcp-service-account]' },
  { id: 'azure-connection-string', regex: /\bAccountKey=[A-Za-z0-9+/=]{40,}/g, redact: 'AccountKey=[REDACTED]' },
  { id: 'jwt', regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, redact: '[REDACTED:jwt]' },
  { id: 'bearer-token', regex: /\bBearer\s+[A-Za-z0-9._-]{20,}\b/g, redact: 'Bearer [REDACTED]' },
  { id: 'private-key-block', regex: /-----BEGIN (?:RSA |OPENSSH |EC |DSA |ENCRYPTED |PGP )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA |OPENSSH |EC |DSA |ENCRYPTED |PGP )?PRIVATE KEY-----/g, redact: '[REDACTED:private-key-block]' },
  { id: 'database-url-with-password', regex: /\b(?:postgres|postgresql|mysql|mongodb|redis|amqp)(?:\+[a-z]+)?:\/\/[^:\s/@]+:[^@\s]+@[^\s/]+/g, redact: '[REDACTED:db-url-with-credentials]' },
  { id: 'env-secret-line', regex: /^\s*([A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASS|PRIVATE|CREDENTIAL|AUTH)[A-Z0-9_]*)\s*=\s*['"]?([A-Za-z0-9+/=._:-]{12,})['"]?\s*$/gm, redact: '$1=[REDACTED]' },
  { id: 'secret-named-var', regex: /\b([A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|PWD|API|AUTH|CRED|CREDENTIAL|PRIVATE)[A-Z0-9_]*)\s*[:=]\s*['"]?([^\s'"`]{12,})['"]?/g, redact: '$1=[REDACTED]' },
  { id: 'inline-secret-assign', regex: /\b(?:api[_-]?key|access[_-]?token|secret[_-]?key|password|passwd)\s*[:=]\s*['"]?([A-Za-z0-9._\-+/=]{16,})['"]?/gi, redact: '[KEY]=[REDACTED]' },
];

function scan(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return { findings: [], redacted: text || '' };
  }

  const findings = [];
  let redacted = text;

  for (const pattern of SECRET_PATTERNS) {
    pattern.regex.lastIndex = 0;
    const matches = [...text.matchAll(pattern.regex)].map((match) => match[0]);
    if (matches.length === 0) continue;

    findings.push({
      id: pattern.id,
      count: matches.length,
      sample: matches[0],
    });
    redacted = redacted.replace(pattern.regex, pattern.redact);
  }

  return { findings, redacted };
}

function isCredentialsPath(filePath) {
  if (typeof filePath !== 'string' || filePath.length === 0) return false;
  const normalized = filePath.replace(/\\/g, '/');
  const base = normalized.split('/').pop() || '';

  if (/^\.env(?:\.[\w.-]+)?$/i.test(base)) return true;
  if (/^\.(?:npmrc|pypirc|yarnrc|dockerconfigjson)$/i.test(base)) return true;
  if (/^(?:credentials|secrets)(?:\.[\w.-]+)?$/i.test(base)) return true;
  if (/^id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?$/i.test(base)) return true;
  if (/(?:^|\/)\.(?:aws|ssh|gnupg|kube|gcloud|docker)(?:\/|$)/i.test(normalized)) return true;

  return false;
}

function tokenLooksPathLike(token) {
  return /^(?:~\/|\.{1,2}\/|\/)/.test(token) || token.includes('/');
}

function shellPathTokens(command) {
  const tokens = [];
  const matches = String(command || '').matchAll(/[^\s"'`<>|;&(){}]+/g);
  for (const match of matches) {
    const token = match[0]
      .replace(/\\([./~-])/g, '$1')
      .replace(/^[=:,]+|[,:]+$/g, '');
    if (token) tokens.push(token);
  }
  return tokens;
}

function resolveShellPathToken(token, projectRoot) {
  if (token.startsWith('~/')) {
    return path.join(require('node:os').homedir(), token.slice(2));
  }
  return path.isAbsolute(token)
    ? token
    : path.resolve(projectRoot || process.cwd(), token);
}

function commandReferencesCredentialPath(command, projectRoot) {
  for (const token of shellPathTokens(command)) {
    if (isCredentialsPath(token)) return true;
    if (!tokenLooksPathLike(token)) continue;

    try {
      const realTarget = fs.realpathSync.native(resolveShellPathToken(token, projectRoot));
      if (isCredentialsPath(realTarget)) return true;
    } catch (_) {
      // Missing or generated paths are still covered by the literal token check.
    }
  }
  return false;
}

function projectHasCredentialSentinel(projectRoot) {
  if (typeof projectRoot !== 'string' || projectRoot.length === 0) return false;
  const stack = [path.resolve(projectRoot)];
  let scanned = 0;

  try {
    while (stack.length > 0) {
      const dir = stack.pop();
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        scanned += 1;
        if (scanned > SENTINEL_SCAN_LIMIT) return true;

        const fullPath = path.join(dir, entry.name);
        if (isCredentialsPath(fullPath)) return true;
        if (entry.isDirectory() && !SKIP_SENTINEL_DIRS.has(entry.name)) {
          stack.push(fullPath);
        }
      }
    }
    return false;
  } catch (_) {
    return false;
  }
}

module.exports = {
  SENTINEL_SCAN_LIMIT,
  SECRET_PATTERNS,
  commandReferencesCredentialPath,
  isCredentialsPath,
  projectHasCredentialSentinel,
  scan,
};
