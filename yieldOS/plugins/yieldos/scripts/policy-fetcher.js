'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const https = require('node:https');

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const DEFAULTS = require(path.join(PLUGIN_ROOT, 'config', 'defaults.json'));

function expandHome(p) {
  return p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p;
}

const RUNTIME_DIR = expandHome(DEFAULTS.cache.runtime_dir);
const SHIPPED_DIR = path.join(PLUGIN_ROOT, 'policy-cache');
const TTL_MS = DEFAULTS.cache.ttl_seconds * 1000;

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJsonSafe(filepath) {
  try {
    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
  } catch (_) {
    return null;
  }
}

function fileAgeMs(filepath) {
  try {
    return Date.now() - fs.statSync(filepath).mtimeMs;
  } catch (_) {
    return Infinity;
  }
}

function fetchUrl(url, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: timeoutMs }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error(`Timeout fetching ${url}`));
    });
  });
}

function buildUrl(file) {
  return DEFAULTS.policy.raw_url_template
    .replace('{repo}', DEFAULTS.policy.repo)
    .replace('{branch}', DEFAULTS.policy.branch)
    .replace('{path}', DEFAULTS.policy.path)
    .replace('{file}', file);
}

async function refreshFromOrigin() {
  ensureDir(RUNTIME_DIR);
  const results = {};
  for (const file of DEFAULTS.policy.files) {
    const url = buildUrl(file);
    try {
      const body = await fetchUrl(url);
      const parsed = JSON.parse(body);
      fs.writeFileSync(path.join(RUNTIME_DIR, file), JSON.stringify(parsed, null, 2));
      results[file] = parsed;
    } catch (err) {
      results[file] = null;
    }
  }
  return results;
}

function loadFromRuntimeCache() {
  if (!fs.existsSync(RUNTIME_DIR)) return null;
  const result = {};
  for (const file of DEFAULTS.policy.files) {
    const data = readJsonSafe(path.join(RUNTIME_DIR, file));
    if (!data) return null;
    result[file] = data;
  }
  return result;
}

function loadFromShippedCache() {
  const result = {};
  for (const file of DEFAULTS.policy.files) {
    const data = readJsonSafe(path.join(SHIPPED_DIR, file));
    if (!data) return null;
    result[file] = data;
  }
  return result;
}

function isRuntimeCacheStale() {
  const versionFile = path.join(RUNTIME_DIR, 'version.json');
  return fileAgeMs(versionFile) > TTL_MS;
}

async function getPolicy({ forceRefresh = false } = {}) {
  if (!forceRefresh && !isRuntimeCacheStale()) {
    const cached = loadFromRuntimeCache();
    if (cached) return { source: 'runtime-cache', policy: cached };
  }

  try {
    const fresh = await refreshFromOrigin();
    const allFresh = Object.values(fresh).every((v) => v !== null);
    if (allFresh) return { source: 'online', policy: fresh };
  } catch (_) {
    // fall through
  }

  const runtime = loadFromRuntimeCache();
  if (runtime) return { source: 'runtime-cache-degraded', policy: runtime };

  const shipped = loadFromShippedCache();
  if (shipped) return { source: 'shipped-cache-degraded', policy: shipped };

  return { source: 'unavailable', policy: null };
}

module.exports = {
  getPolicy,
  refreshFromOrigin,
  loadFromRuntimeCache,
  loadFromShippedCache,
  isRuntimeCacheStale,
  RUNTIME_DIR,
  SHIPPED_DIR,
};
