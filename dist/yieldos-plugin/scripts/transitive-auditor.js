'use strict';

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

const osvChecker = require('./analyzers/osv-checker');

function readJsonSafe(fp) {
  try { return JSON.parse(fs.readFileSync(fp, 'utf8')); }
  catch (_) { return null; }
}

function fetchJson(url, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: timeoutMs }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { buf += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(buf)); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
  });
}

function readPackageLock(projectRoot) {
  const fp = path.join(projectRoot, 'package-lock.json');
  return readJsonSafe(fp);
}

function listPackageLockDeps(lock) {
  if (!lock || !lock.packages) return [];
  const out = [];
  for (const [pkgPath, info] of Object.entries(lock.packages)) {
    if (!pkgPath || pkgPath === '') continue;
    const m = pkgPath.match(/node_modules\/(.+)$/);
    if (!m) continue;
    const name = m[1];
    if (!info.version) continue;
    out.push({ name, version: info.version });
  }
  return out;
}

function readPnpmLock(projectRoot) {
  const fp = path.join(projectRoot, 'pnpm-lock.yaml');
  if (!fs.existsSync(fp)) return null;
  const content = fs.readFileSync(fp, 'utf8');
  const out = [];
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^\s*\/(@?[^@/]+(?:\/[^@/]+)?)@([^:]+):/);
    if (m) {
      out.push({ name: m[1], version: m[2] });
    }
  }
  return out.length > 0 ? out : null;
}

function readRequirementsLock(projectRoot) {
  for (const filename of ['requirements.txt', 'requirements.lock']) {
    const fp = path.join(projectRoot, filename);
    if (!fs.existsSync(fp)) continue;
    const out = [];
    const content = fs.readFileSync(fp, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const m = line.match(/^([A-Za-z0-9_.\-]+)==([^\s;]+)/);
      if (m) out.push({ name: m[1], version: m[2] });
    }
    if (out.length > 0) return out;
  }
  return null;
}

function listAllTransitives(projectRoot) {
  const npm = readPackageLock(projectRoot);
  if (npm) return { manager: 'npm', deps: listPackageLockDeps(npm) };
  const pnpm = readPnpmLock(projectRoot);
  if (pnpm) return { manager: 'pnpm', deps: pnpm };
  const py = readRequirementsLock(projectRoot);
  if (py) return { manager: 'pip', deps: py };
  return { manager: null, deps: [] };
}

async function fetchPublishDate(manager, name, version) {
  try {
    if (manager === 'npm' || manager === 'pnpm' || manager === 'yarn' || manager === 'bun') {
      const encoded = name.startsWith('@') ? `@${encodeURIComponent(name.slice(1))}` : encodeURIComponent(name);
      const data = await fetchJson(`https://registry.npmjs.org/${encoded}`);
      const ts = data?.time?.[version];
      return ts ? new Date(ts) : null;
    }
    if (manager === 'pip') {
      const data = await fetchJson(`https://pypi.org/pypi/${encodeURIComponent(name)}/${encodeURIComponent(version)}/json`);
      const ts = data?.urls?.[0]?.upload_time_iso_8601;
      return ts ? new Date(ts) : null;
    }
  } catch (_) {
    return null;
  }
  return null;
}

async function findLastVersionWithMinAge(manager, name, minAgeDays) {
  try {
    if (manager === 'npm' || manager === 'pnpm' || manager === 'yarn' || manager === 'bun') {
      const encoded = name.startsWith('@') ? `@${encodeURIComponent(name.slice(1))}` : encodeURIComponent(name);
      const data = await fetchJson(`https://registry.npmjs.org/${encoded}`);
      const times = data?.time || {};
      const cutoff = Date.now() - minAgeDays * 86400000;
      const eligible = Object.entries(times)
        .filter(([k]) => /^\d/.test(k))
        .filter(([, ts]) => new Date(ts).getTime() <= cutoff)
        .map(([v]) => v)
        .filter((v) => /^\d+\.\d+\.\d+$/.test(v));
      eligible.sort(semverCompareDesc);
      return eligible[0] || null;
    }
  } catch (_) { return null; }
  return null;
}

function semverCompareDesc(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pb[i] - pa[i];
  }
  return 0;
}

async function audit(projectRoot, parent, policy, opts = {}) {
  const minAgeDays = opts.minAgeDays ?? 10;
  const { manager, deps } = listAllTransitives(projectRoot);
  if (!manager || deps.length === 0) {
    return { complete: true, whitelisted: [], aged: [], downgraded: [], denylisted: [], cves: [] };
  }
  const allowSet = new Set((policy.allowlist?.entries || []).map((e) => e.key));
  const denySet = new Set((policy.denylist?.entries || []).map((e) => e.key));

  const audit = {
    complete: true,
    whitelisted: [],
    aged: [],
    downgraded: [],
    denylisted: [],
    cves: [],
  };

  const ecosystemPrefix = (manager === 'pip') ? 'python' : 'npm';
  const versionDelim = (manager === 'pip') ? '==' : '@';

  for (const dep of deps) {
    const fullKey = `${ecosystemPrefix}:${dep.name}${versionDelim}${dep.version}`;
    const nameKey = `${ecosystemPrefix}:${dep.name}`;

    if (denySet.has(fullKey) || denySet.has(nameKey)) {
      audit.denylisted.push(`${dep.name}@${dep.version}`);
      continue;
    }

    if (allowSet.has(fullKey)) {
      audit.whitelisted.push(`${dep.name}@${dep.version}`);
      continue;
    }

    const releasedAt = await fetchPublishDate(manager, dep.name, dep.version);
    if (releasedAt) {
      const ageDays = (Date.now() - releasedAt.getTime()) / 86400000;
      if (ageDays >= minAgeDays) {
        audit.aged.push(`${dep.name}@${dep.version}`);
      } else {
        const olderVersion = await findLastVersionWithMinAge(manager, dep.name, minAgeDays);
        audit.downgraded.push({ name: dep.name, from: dep.version, to: olderVersion });
        audit.complete = false;
      }
    } else {
      audit.complete = false;
    }

    if (opts.osv !== false) {
      const osv = await osvChecker.checkPackage(manager, dep.name, dep.version, opts);
      if (osv.vulnerabilities && osv.vulnerabilities.length > 0) {
        for (const v of osv.vulnerabilities) {
          audit.cves.push(`${dep.name}@${dep.version} → ${v.id} (${v.severity})`);
        }
      }
    }
  }

  return audit;
}

module.exports = { audit, listAllTransitives, fetchPublishDate, findLastVersionWithMinAge };
