'use strict';

// Patterns of well-known secret formats. Each entry:
//   id          → stable identifier for logging/telemetry
//   regex       → detection regex
//   redact      → replacement when redacting (preserves prefix so user can identify)
const SECRET_PATTERNS = [
  { id: 'aws-access-key',     regex: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/g,                     redact: '[REDACTED:aws-access-key]' },
  { id: 'aws-secret',         regex: /aws_secret_access_key\s*[:=]\s*[A-Za-z0-9/+=]{40}/gi, redact: 'aws_secret_access_key=[REDACTED]' },
  { id: 'github-pat',         regex: /\bghp_[A-Za-z0-9]{30,}\b/g,                         redact: '[REDACTED:github-token]' },
  { id: 'github-oauth',       regex: /\b(gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b/g,           redact: '[REDACTED:github-token]' },
  { id: 'github-fine-grained',regex: /\bgithub_pat_[A-Za-z0-9_]{50,}\b/g,                 redact: '[REDACTED:github-token]' },
  { id: 'openai',             regex: /\bsk-(?!ant-)[A-Za-z0-9-]{20,}\b/g,                 redact: '[REDACTED:openai-key]' },
  { id: 'openai-proj',        regex: /\bsk-proj-[A-Za-z0-9_-]{30,}\b/g,                   redact: '[REDACTED:openai-project-key]' },
  { id: 'anthropic',          regex: /\bsk-ant-[A-Za-z0-9_-]{30,}\b/g,                    redact: '[REDACTED:anthropic-key]' },
  { id: 'stripe-live',        regex: /\b(sk|pk|rk)_live_[A-Za-z0-9]{20,}\b/g,             redact: '[REDACTED:stripe-live]' },
  { id: 'stripe-test',        regex: /\b(sk|pk|rk)_test_[A-Za-z0-9]{20,}\b/g,             redact: '[REDACTED:stripe-test]' },
  { id: 'slack-token',        regex: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,                 redact: '[REDACTED:slack-token]' },
  { id: 'slack-webhook',      regex: /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]+/g, redact: '[REDACTED:slack-webhook]' },
  { id: 'google-api',         regex: /\bAIza[0-9A-Za-z\-_]{35}\b/g,                       redact: '[REDACTED:google-api-key]' },
  { id: 'gcp-service-account',regex: /"type":\s*"service_account"[^}]*"private_key":\s*"-----BEGIN/gs, redact: '[REDACTED:gcp-service-account]' },
  { id: 'azure-connection',   regex: /AccountKey=[A-Za-z0-9+/=]{40,}/g,                   redact: 'AccountKey=[REDACTED]' },
  { id: 'jwt',                regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, redact: '[REDACTED:jwt]' },
  { id: 'bearer-token',       regex: /\bBearer\s+[A-Za-z0-9._\-]{20,}\b/g,                redact: 'Bearer [REDACTED]' },
  { id: 'rsa-private-key',    regex: /-----BEGIN (?:RSA |OPENSSH |EC |DSA |ENCRYPTED |PGP )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA |OPENSSH |EC |DSA |ENCRYPTED |PGP )?PRIVATE KEY-----/g, redact: '[REDACTED:private-key-block]' },
  { id: 'db-url-creds',       regex: /\b(?:postgres|postgresql|mysql|mongodb|redis|amqp)(?:\+[a-z]+)?:\/\/[^:\s/@]+:[^@\s]+@[^\s/]+/g, redact: '[REDACTED:db-url-with-credentials]' },
  { id: 'env-line',           regex: /^\s*([A-Z][A-Z0-9_]{3,})\s*=\s*['"]?([A-Za-z0-9+/=._-]{16,})['"]?\s*$/gm, redact: '$1=[REDACTED]' },
  // Catch-all: any KEY-looking variable assigned a non-trivial value, even with
  // unicode / special chars in the value. Matches inline (not just full lines)
  // so it also fires on prompts like: "use ANTHROPIC_API_KEY=... and run".
  { id: 'secret-named-var',   regex: /\b([A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|PWD|API|AUTH|CRED|CREDENTIAL|PRIVATE)[A-Z0-9_]*)\s*=\s*['"]?([^\s'"`]{12,})['"]?/g, redact: '$1=[REDACTED]' },
  // Inline assignment of common credential tokens regardless of variable name:
  // detects "key=foobar", "token = abc...", etc. when the value has high entropy.
  { id: 'inline-secret-assign', regex: /\b(?:api[_-]?key|access[_-]?token|secret[_-]?key|password|passwd)\s*[:=]\s*['"]?([A-Za-z0-9._\-+/=]{16,})['"]?/gi, redact: '[KEY]=[REDACTED]' },
];

function scan(text) {
  if (typeof text !== 'string' || text.length === 0) return { findings: [], redacted: text };
  const findings = [];
  let redacted = text;
  for (const p of SECRET_PATTERNS) {
    const matches = text.match(p.regex);
    if (matches && matches.length > 0) {
      findings.push({
        id: p.id,
        count: matches.length,
        sample: String(matches[0]).slice(0, 60),
      });
      redacted = redacted.replace(p.regex, p.redact);
    }
  }
  return { findings, redacted };
}

const AUTHORIZATION_PHRASE = 'AUTORIZO A LEER LAS CREDENCIALES';

function authorizationPhraseDetected(text) {
  if (typeof text !== 'string') return false;
  return text.includes(AUTHORIZATION_PHRASE);
}

const ENV_PATH_RE = /(?:^|\/)\.env(?:\.[\w.-]+)?$/i;
const SENSITIVE_PATH_RE = /(?:^|\/)\.(?:npmrc|aws|ssh|gnupg|kube|gcloud|docker)(?:\/|$)|credentials(?:\.[\w]+)?$|secrets(?:\.[\w]+)?$/i;

function isCredentialsPath(filepath) {
  if (typeof filepath !== 'string') return false;
  return ENV_PATH_RE.test(filepath) || SENSITIVE_PATH_RE.test(filepath);
}

module.exports = {
  scan,
  AUTHORIZATION_PHRASE,
  authorizationPhraseDetected,
  isCredentialsPath,
  SECRET_PATTERNS,
};
