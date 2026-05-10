'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const https = require('node:https');

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const DEFAULTS = require(path.join(PLUGIN_ROOT, 'config', 'defaults.json'));
const policyManifest = require('./policy-manifest');

function expandHome(p) {
  return p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p;
}

const RUNTIME_DIR = expandHome(DEFAULTS.cache.runtime_dir);
const SHIPPED_DIR = path.join(PLUGIN_ROOT, 'policy-cache');
const TTL_MS = DEFAULTS.cache.ttl_seconds * 1000;
const MANIFEST_FILE = DEFAULTS.policy.manifest_file || policyManifest.MANIFEST_FILE;
const EXPECTED_MANIFEST_SHA256 = DEFAULTS.policy.manifest_sha256 || null;

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

async function refreshBundleFromOrigin({
  runtimeDir = RUNTIME_DIR,
  files = DEFAULTS.policy.files,
  manifestFile = MANIFEST_FILE,
  expectedManifestSha256 = EXPECTED_MANIFEST_SHA256,
  fetchText = async (file) => fetchUrl(buildUrl(file)),
} = {}) {
  const parent = path.dirname(runtimeDir);
  ensureDir(parent);
  const tempDir = path.join(parent, `${path.basename(runtimeDir)}.next-${process.pid}-${Date.now()}`);
  fs.rmSync(tempDir, { recursive: true, force: true });
  fs.mkdirSync(tempDir, { recursive: true, mode: 0o700 });

  try {
    const manifestBody = await fetchText(manifestFile);
    if (typeof manifestBody !== 'string') throw new Error(`empty response for ${manifestFile}`);
    fs.writeFileSync(path.join(tempDir, manifestFile), manifestBody);

    for (const file of files) {
      const body = await fetchText(file);
      if (typeof body !== 'string') throw new Error(`empty response for ${file}`);
      fs.writeFileSync(path.join(tempDir, file), body);
    }

    const loaded = policyManifest.readVerifiedPolicyBundle(tempDir, {
      files,
      expectedManifestSha256,
      manifestFile,
      baseLabel: 'online-policy',
    });
    if (!loaded) {
      const verification = policyManifest.verifyPolicyBundle(tempDir, {
        files,
        expectedManifestSha256,
        manifestFile,
        baseLabel: 'online-policy',
      });
      throw new Error(`policy integrity verification failed: ${verification.errors.join('; ')}`);
    }

    fs.rmSync(runtimeDir, { recursive: true, force: true });
    fs.renameSync(tempDir, runtimeDir);
    return loaded;
  } catch (error) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    throw error;
  }
}

async function refreshFromOrigin() {
  const loaded = await refreshBundleFromOrigin();
  return loaded.policy;
}

function loadFromPolicyDirectory(dir, {
  files = DEFAULTS.policy.files,
  manifestFile = MANIFEST_FILE,
  expectedManifestSha256 = EXPECTED_MANIFEST_SHA256,
} = {}) {
  const loaded = policyManifest.readVerifiedPolicyBundle(dir, {
    files,
    expectedManifestSha256,
    manifestFile,
    baseLabel: path.basename(dir),
  });
  return loaded ? loaded.policy : null;
}

function loadFromRuntimeCache() {
  if (!fs.existsSync(RUNTIME_DIR)) return null;
  return loadFromPolicyDirectory(RUNTIME_DIR);
}

function loadFromShippedCache() {
  return loadFromPolicyDirectory(SHIPPED_DIR);
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
    if (fresh) return { source: 'online', policy: fresh };
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
  refreshBundleFromOrigin,
  loadFromPolicyDirectory,
  loadFromRuntimeCache,
  loadFromShippedCache,
  isRuntimeCacheStale,
  RUNTIME_DIR,
  SHIPPED_DIR,
};
