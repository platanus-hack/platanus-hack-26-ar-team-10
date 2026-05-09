'use strict';

const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const ECOSYSTEM_MAP = {
  npm: 'npm',
  pnpm: 'npm',
  yarn: 'npm',
  bun: 'npm',
  pip: 'PyPI',
  poetry: 'PyPI',
  uv: 'PyPI',
  cargo: 'crates.io',
  go: 'Go',
};

function cacheDir() {
  return path.join(os.homedir(), '.claude', 'plugins', 'yieldos', '.osv-cache');
}

function cacheKey(ecosystem, name, version) {
  return `${ecosystem}__${name.replace(/[^A-Za-z0-9_.@\-/]/g, '_')}__${version}`;
}

function readCacheEntry(key, ttlMs) {
  const fp = path.join(cacheDir(), `${key}.json`);
  try {
    const stat = fs.statSync(fp);
    if (Date.now() - stat.mtimeMs > ttlMs) return null;
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch (_) {
    return null;
  }
}

function writeCacheEntry(key, value) {
  fs.mkdirSync(cacheDir(), { recursive: true });
  fs.writeFileSync(path.join(cacheDir(), `${key}.json`), JSON.stringify(value));
}

function postJson(url, body, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const u = new URL(url);
    const req = https.request({
      method: 'POST',
      hostname: u.hostname,
      path: u.pathname,
      port: u.port || 443,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      timeout: timeoutMs,
    }, (res) => {
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { buf += c; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`OSV HTTP ${res.statusCode}`));
          return;
        }
        try { resolve(JSON.parse(buf)); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('OSV timeout')));
    req.write(data);
    req.end();
  });
}

async function checkPackage(manager, name, version, opts = {}) {
  const ecosystem = ECOSYSTEM_MAP[manager];
  if (!ecosystem) return { vulnerabilities: [], skipped: true, reason: `unsupported manager: ${manager}` };

  const ttlMs = (opts.ttlSeconds || 3600) * 1000;
  const key = cacheKey(ecosystem, name, version);
  const cached = readCacheEntry(key, ttlMs);
  if (cached) return cached;

  try {
    const body = {
      package: { name, ecosystem },
      version: version === 'latest' || version === 'unspecified' ? undefined : version,
    };
    const apiUrl = opts.apiUrl || 'https://api.osv.dev/v1/query';
    const result = await postJson(apiUrl, body, opts.timeoutMs || 5000);
    const out = {
      vulnerabilities: (result.vulns || []).map((v) => ({
        id: v.id,
        summary: v.summary,
        severity: deriveSeverity(v),
        aliases: v.aliases || [],
      })),
      skipped: false,
    };
    writeCacheEntry(key, out);
    return out;
  } catch (err) {
    return { vulnerabilities: [], skipped: true, reason: err.message };
  }
}

function deriveSeverity(vuln) {
  if (!vuln.severity || vuln.severity.length === 0) return 'unknown';
  const cvss = vuln.severity.find((s) => /^CVSS/.test(s.type));
  if (!cvss) return 'unknown';
  const score = Number((cvss.score || '').match(/\d+\.\d+/)?.[0] || 0);
  if (score >= 9) return 'critical';
  if (score >= 7) return 'high';
  if (score >= 4) return 'medium';
  return 'low';
}

function tierForVulns(vulns) {
  if (!vulns || vulns.length === 0) return 'clean';
  if (vulns.some((v) => v.severity === 'critical' || v.severity === 'high')) return 'tier1';
  if (vulns.some((v) => v.severity === 'medium')) return 'tier3';
  return 'tier3';
}

module.exports = { checkPackage, tierForVulns, ECOSYSTEM_MAP };
