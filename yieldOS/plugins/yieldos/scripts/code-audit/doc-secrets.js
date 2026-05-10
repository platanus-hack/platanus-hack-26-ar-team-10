'use strict';

const AUTH_HEADER_RE = /(\bAuthorization\s*:\s*(?:Bearer|Token)\s+)([A-Za-z0-9._~+/=-]{16,})/gi;
const SECRET_ASSIGNMENT_RE = /(\b[A-Za-z0-9_-]*(?:api[_-]?key|secret|token|password|passwd|authorization)\b\s*[:=]\s*['"]?)([A-Za-z0-9._~+/=-]{16,})/gi;
const PROVIDER_TOKEN_RE = /\b(?:sk-(?:proj-)?|ghp_|xox[abprs]-)[A-Za-z0-9_-]{16,}\b/g;

function isDocsExampleFile(file) {
  const normalized = String(file || '').replace(/\\/g, '/');
  return /(?:^|\/)(?:README|CHANGELOG|CONTRIBUTING|SETUP|USAGE)\.md$/i.test(normalized)
    || /\.(?:md|mdx|txt|http|rest)$/i.test(normalized)
    || /(?:^|\/)\.env\.example$/i.test(normalized)
    || /(?:^|\/)docs?\//i.test(normalized);
}

function findDocsExampleSecret(line) {
  return redactDocsExampleSecrets(line) === line ? null : { kind: 'docs-example-secret' };
}

function redactDocsExampleSecrets(line) {
  let out = String(line || '').replace(AUTH_HEADER_RE, (_match, prefix, value) => {
    return isPlaceholderSecret(value) ? `${prefix}${value}` : `${prefix}REDACTED`;
  });
  out = out.replace(SECRET_ASSIGNMENT_RE, (_match, prefix, value) => {
    return isPlaceholderSecret(value) ? `${prefix}${value}` : `${prefix}REDACTED`;
  });
  out = out.replace(PROVIDER_TOKEN_RE, (value) => {
    return isPlaceholderSecret(value) ? value : 'REDACTED';
  });
  return out;
}

function isPlaceholderSecret(value) {
  const normalized = String(value || '').toLowerCase();
  if (!normalized) return true;
  if (/(redacted|your[_-]?token|your[_-]?key|token[_-]?here|api[_-]?key[_-]?here|placeholder|example|dummy|fake|change[_-]?me)/i.test(normalized)) {
    return true;
  }
  const compact = normalized.replace(/[^a-z0-9]/g, '');
  if (compact.length < 16) return true;
  return /^(x+|0+|1+|a+|abc123+)$/.test(compact);
}

module.exports = {
  findDocsExampleSecret,
  isDocsExampleFile,
  redactDocsExampleSecrets,
};
