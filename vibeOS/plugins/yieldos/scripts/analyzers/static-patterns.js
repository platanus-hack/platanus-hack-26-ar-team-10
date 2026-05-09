'use strict';

const TIER1_PATTERNS = [
  { id: 'eval-call', regex: /\beval\s*\(/g, severity: 'tier1', note: 'eval() usage' },
  { id: 'function-ctor', regex: /\bnew\s+Function\s*\(/g, severity: 'tier1', note: 'Function constructor' },
  { id: 'vm-runincontext', regex: /\bvm\s*\.\s*runIn(?:New|This)Context\s*\(/g, severity: 'tier1', note: 'vm dynamic execution' },
  { id: 'child-process-exec-shell', regex: /child_process\s*\.\s*(?:exec|execSync)\s*\(/g, severity: 'tier1', note: 'shell execution' },
  { id: 'spawn-shell-true', regex: /\.\s*spawn[^)]*shell\s*:\s*true/g, severity: 'tier1', note: 'spawn with shell:true' },
  { id: 'curl-pipe-shell', regex: /curl[^|]*\|\s*(?:sh|bash|zsh)/g, severity: 'tier1', note: 'curl|sh pattern in code' },
  { id: 'env-leak', regex: /process\s*\.\s*env(?:\[|\.[A-Z_]+)/g, severity: 'tier3', note: 'process.env access (possibly legitimate)' },
  { id: 'access-ssh', regex: /['"`](?:~|\$HOME|\/root)?\/\.ssh\//g, severity: 'tier1', note: 'access to ~/.ssh' },
  { id: 'access-aws', regex: /['"`](?:~|\$HOME|\/root)?\/\.aws\//g, severity: 'tier1', note: 'access to ~/.aws' },
  { id: 'access-npmrc', regex: /['"`](?:~|\$HOME|\/root)?\/\.npmrc/g, severity: 'tier1', note: 'access to ~/.npmrc' },
  { id: 'access-env-file', regex: /['"`]\.env(?:\.[a-z]+)?['"`]/g, severity: 'tier3', note: '.env reference' },
  { id: 'access-passwd', regex: /['"`]\/etc\/(?:passwd|shadow)['"`]/g, severity: 'tier1', note: '/etc/passwd or /etc/shadow' },
  { id: 'dns-exfiltration', regex: /dns\s*\.\s*resolve[A-Za-z]*\s*\(/g, severity: 'tier3', note: 'dns lookup (possibly exfiltration)' },
  { id: 'http-post-suspicious-host', regex: /https?:\/\/(?!github\.com|registry\.npmjs\.org|pypi\.org|registry\.yarnpkg\.com|crates\.io|proxy\.golang\.org)[a-zA-Z0-9.-]+\.(?:tk|ml|ga|cf|gq|info|biz|ru|cn|top|xyz)\b/g, severity: 'tier1', note: 'suspicious TLD' },
];

function scanCode(code) {
  if (typeof code !== 'string' || code.length === 0) return [];
  const findings = [];
  for (const p of TIER1_PATTERNS) {
    const matches = code.match(p.regex);
    if (matches && matches.length > 0) {
      findings.push({
        id: p.id,
        severity: p.severity,
        note: p.note,
        occurrences: matches.length,
        sample: matches[0].slice(0, 200),
      });
    }
  }
  return findings;
}

function aggregateTier(findings) {
  if (findings.some((f) => f.severity === 'tier1')) return 'tier1';
  if (findings.some((f) => f.severity === 'tier2')) return 'tier2';
  if (findings.some((f) => f.severity === 'tier3')) return 'tier3';
  return 'clean';
}

module.exports = { scanCode, aggregateTier, TIER1_PATTERNS };
