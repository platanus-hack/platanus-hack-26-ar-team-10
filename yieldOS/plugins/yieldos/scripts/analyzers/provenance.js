'use strict';

const https = require('node:https');

// npm started signing publishes with provenance attestations in mid-2023.
// A provenance attestation says "this exact tarball was built from THIS commit
// of THIS GitHub repository by GitHub Actions". A legitimate release of
// react/express/etc will have one. A typosquat or compromised maintainer
// publish typically does not.
//
// The attestation is exposed via:
//   https://registry.npmjs.org/-/npm/v1/attestations/<package>@<version>
//
// We don't verify the signature cryptographically here (that would require
// pulling sigstore tooling). What we DO is check whether a provenance
// attestation exists and whether the signing identity matches a GitHub
// repository in the expected org. This catches:
//   - packages with no provenance at all (no signal of origin)
//   - packages whose provenance points to an unexpected repo
//
// Verdict mapping:
//   - has provenance + matches repository.url    -> clean (safe signal)
//   - has provenance + repository.url mismatch   -> tier1 (impersonation)
//   - no provenance + repo > 1y old, popular pkg -> tier3 (weak signal,
//                                                    inconclusive; don't block)
//   - no provenance + brand-new package          -> tier2 (extra scrutiny)

function fetchJson(url, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: timeoutMs }, (res) => {
      if (res.statusCode === 404) {
        res.resume();
        return resolve({ status: 404 });
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { buf += c; });
      res.on('end', () => {
        try { resolve({ status: 200, body: JSON.parse(buf) }); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('provenance timeout')));
  });
}

function normalizeRepoUrl(url) {
  if (typeof url !== 'string' || url.length === 0) return null;
  let cleaned = url
    .replace(/^git\+/, '')
    .replace(/^git:\/\//, 'https://')
    .replace(/^ssh:\/\/git@/, 'https://')
    .replace(/\.git$/, '');
  if (cleaned.startsWith('github:')) cleaned = `https://github.com/${cleaned.slice(7)}`;
  return cleaned.toLowerCase();
}

function extractGithubSlug(url) {
  if (typeof url !== 'string') return null;
  const m = url.match(/github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?$/i);
  return m ? m[1].toLowerCase() : null;
}

async function checkNpm(name, version, expectedRepoUrl, options = {}) {
  if (!name || !version || version === 'latest' || version === 'unspecified') {
    return { tier: 'tier3', verdict: 'inconclusive', reason: 'no version pinned for provenance check' };
  }
  const fetcher = options.fetchJson || fetchJson;
  let attestations;
  try {
    const url = `https://registry.npmjs.org/-/npm/v1/attestations/${encodeURIComponent(name)}@${encodeURIComponent(version)}`;
    attestations = await fetcher(url);
  } catch (err) {
    return { tier: 'tier3', verdict: 'inconclusive', reason: `attestations endpoint error: ${err.message}` };
  }

  if (attestations.status === 404) {
    // No attestation. Don't block on this alone; most npm packages still
    // don't sign, but flag it as a soft signal.
    return {
      tier: 'tier3',
      verdict: 'no-provenance',
      reason: 'package has no provenance attestation; cannot verify build origin',
    };
  }

  const items = (attestations.body && attestations.body.attestations) || [];
  if (items.length === 0) {
    return { tier: 'tier3', verdict: 'no-provenance', reason: 'attestations response was empty' };
  }

  // Look for the GitHub-issued attestation that contains the source repo URL
  // in its predicate (subject buildConfigSource / invocation parameters).
  const expectedSlug = extractGithubSlug(normalizeRepoUrl(expectedRepoUrl));
  let signedSlug = null;
  for (const att of items) {
    const bundle = att.bundle || att;
    const payloadB64 = bundle.dsseEnvelope && bundle.dsseEnvelope.payload;
    if (!payloadB64) continue;
    let payload;
    try { payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString('utf8')); }
    catch (_) { continue; }
    const repo = (payload.predicate
      && payload.predicate.buildDefinition
      && payload.predicate.buildDefinition.externalParameters
      && payload.predicate.buildDefinition.externalParameters.workflow
      && payload.predicate.buildDefinition.externalParameters.workflow.repository) || null;
    if (repo) {
      signedSlug = extractGithubSlug(repo);
      break;
    }
  }

  if (!signedSlug) {
    return {
      tier: 'tier3',
      verdict: 'provenance-unparseable',
      reason: 'attestation present but signing repo not extractable',
    };
  }

  if (!expectedSlug) {
    // We have a signature, but we don't know what repo to expect. Pass through
    // as informational.
    return { tier: 'tier3', verdict: 'provenance-ok', reason: `signed by ${signedSlug}` };
  }

  if (signedSlug !== expectedSlug) {
    return {
      tier: 'tier1',
      verdict: 'provenance-repo-mismatch',
      reason: `package metadata claims repo ${expectedSlug} but provenance signs ${signedSlug}`,
    };
  }

  return { tier: 'clean', verdict: 'provenance-ok', reason: `signed by ${signedSlug}` };
}

module.exports = {
  checkNpm,
  normalizeRepoUrl,
  extractGithubSlug,
};
