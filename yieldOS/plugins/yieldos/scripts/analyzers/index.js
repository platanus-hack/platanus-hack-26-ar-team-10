'use strict';

const https = require('node:https');
const path = require('node:path');

const manifestDiff = require('./manifest-diff');
const lockfileValidator = require('./lockfile-validator');
const settingsValidator = require('./settings-validator');
const scriptDetector = require('./script-detector');
const staticPatterns = require('./static-patterns');
const versionComparator = require('./version-comparator');
const osvChecker = require('./osv-checker');
const obfuscationDetector = require('./obfuscation-detector');
const binaryDetector = require('./binary-detector');

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
        try { resolve(JSON.parse(buf)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
  });
}

async function fetchNpmMetadata(name, version) {
  const encoded = encodeURIComponent(name).replace(/^%40/, '@');
  try {
    if (version === 'latest' || version === 'unspecified' || version === undefined) {
      return await fetchJson(`https://registry.npmjs.org/${encoded}`);
    }
    return await fetchJson(`https://registry.npmjs.org/${encoded}/${version}`);
  } catch (_) {
    return null;
  }
}

async function fetchPypiMetadata(name, version) {
  const encoded = encodeURIComponent(name);
  try {
    if (version === 'latest' || version === 'unspecified' || version === undefined) {
      return await fetchJson(`https://pypi.org/pypi/${encoded}/json`);
    }
    return await fetchJson(`https://pypi.org/pypi/${encoded}/${encodeURIComponent(version)}/json`);
  } catch (_) {
    return null;
  }
}

function pickHighestTier(tiers) {
  if (tiers.includes('tier1')) return 'tier1';
  if (tiers.includes('tier2')) return 'tier2';
  if (tiers.includes('tier3')) return 'tier3';
  return 'clean';
}

async function analyzePackage(candidate, opts = {}) {
  const findings = [];
  const tiers = [];

  const SUPPORTED_NPM = candidate.manager === 'npm' || candidate.manager === 'pnpm' || candidate.manager === 'yarn' || candidate.manager === 'bun';
  const SUPPORTED_PY = candidate.manager === 'pip' || candidate.manager === 'poetry' || candidate.manager === 'uv';

  let metadata = null;
  if (SUPPORTED_NPM) {
    metadata = await fetchNpmMetadata(candidate.name, candidate.version);
  } else if (SUPPORTED_PY) {
    metadata = await fetchPypiMetadata(candidate.name, candidate.version);
  } else {
    // Manager not supported by analyzers (cargo, go, etc.). Skip deep analysis;
    // allowlist/denylist/category-D already ran upstream, so reaching here means
    // the package is not in any list. Allow with a tier3 note.
    return {
      tier: 'tier3',
      findings: [{ id: 'analyzer-unsupported-manager', severity: 'tier3', note: `analyzer does not support manager: ${candidate.manager}` }],
      verdict: 'inconclusive',
    };
  }

  if (!metadata) {
    return {
      tier: 'tier1',
      findings: [{ id: 'metadata-unavailable', severity: 'tier1', note: 'package metadata could not be fetched (registry returned no data)' }],
      verdict: 'flagged',
    };
  }

  let scriptResult = { hasRiskyScripts: false, scripts: {} };
  if (metadata.scripts || (metadata.versions && Object.values(metadata.versions)[0]?.scripts)) {
    const pkgJson = metadata.scripts ? metadata : (metadata.versions ? Object.values(metadata.versions).pop() : metadata);
    scriptResult = scriptDetector.detectScripts(pkgJson || {});
    if (scriptResult.hasRiskyScripts) {
      findings.push({
        id: 'risky-lifecycle-scripts',
        severity: 'tier2',
        note: 'package declares preinstall/install/postinstall/prepare scripts',
        scripts: scriptResult.scripts,
      });
      tiers.push('tier2');
    }
  }

  const releaseDate = pickReleaseDate(metadata, candidate);
  if (releaseDate) {
    const ageDays = Math.floor((Date.now() - releaseDate.getTime()) / 86400000);
    const minAge = opts.minAgeDays ?? 10;
    if (ageDays < minAge) {
      findings.push({
        id: 'version-too-young',
        severity: 'tier3',
        note: `package version published ${ageDays} days ago, minimum required is ${minAge}`,
      });
      tiers.push('tier3');
    }
  }

  let osvResult = { vulnerabilities: [] };
  if (opts.osv !== false) {
    osvResult = await osvChecker.checkPackage(candidate.manager, candidate.name, candidate.version, opts);
    if (osvResult.vulnerabilities.length > 0) {
      const tier = osvChecker.tierForVulns(osvResult.vulnerabilities);
      tiers.push(tier);
      findings.push({
        id: 'osv-vulnerabilities',
        severity: tier,
        note: `OSV reported ${osvResult.vulnerabilities.length} vulnerabilities`,
        vulnerabilities: osvResult.vulnerabilities,
      });
    }
  }

  if (metadata.dist && metadata.dist.unpackedSize) {
    const sizeMb = metadata.dist.unpackedSize / (1024 * 1024);
    if (sizeMb > 50) {
      findings.push({
        id: 'oversized-package',
        severity: 'tier3',
        note: `unpacked size is ${sizeMb.toFixed(1)} MB`,
      });
      tiers.push('tier3');
    }
  }

  return {
    tier: pickHighestTier(tiers),
    findings,
    verdict: tiers.length === 0 ? 'clean' : 'flagged',
    metadata: {
      version: metadata.version || candidate.version,
      maintainers: metadata.maintainers,
      releaseDate: releaseDate?.toISOString(),
    },
  };
}

function pickReleaseDate(metadata, candidate) {
  if (metadata.time && candidate.version && metadata.time[candidate.version]) {
    return new Date(metadata.time[candidate.version]);
  }
  if (metadata.releases && candidate.version && metadata.releases[candidate.version]?.[0]?.upload_time_iso_8601) {
    return new Date(metadata.releases[candidate.version][0].upload_time_iso_8601);
  }
  if (metadata.upload_time_iso_8601) return new Date(metadata.upload_time_iso_8601);
  return null;
}

module.exports = {
  analyzePackage,
  pickHighestTier,
  manifestDiff,
  lockfileValidator,
  settingsValidator,
  scriptDetector,
  staticPatterns,
  versionComparator,
  osvChecker,
  obfuscationDetector,
  binaryDetector,
};
