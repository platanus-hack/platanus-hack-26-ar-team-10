'use strict';

const https = require('node:https');

function fetchJson(url, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: timeoutMs, headers: { 'User-Agent': 'yieldos' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return resolve(fetchJson(res.headers.location, timeoutMs));
      }
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

function deriveSourceUrl(metadata) {
  if (!metadata) return null;
  const repo = metadata.repository;
  if (typeof repo === 'string') return normalizeRepo(repo);
  if (repo && typeof repo === 'object') return normalizeRepo(repo.url);
  if (metadata.homepage) return metadata.homepage;
  if (metadata.info && metadata.info.project_urls) {
    const p = metadata.info.project_urls;
    return p.Source || p.Repository || p.Homepage || null;
  }
  return null;
}

function normalizeRepo(url) {
  if (!url) return null;
  let cleaned = url.replace(/^git\+/, '').replace(/\.git$/, '').replace(/^ssh:\/\/git@/, 'https://').replace(/^git:\/\//, 'https://');
  if (cleaned.startsWith('github:')) cleaned = `https://github.com/${cleaned.slice(7)}`;
  return cleaned;
}

async function fetchPackageMetadata(candidate) {
  if (candidate.manager === 'npm' || candidate.manager === 'pnpm' || candidate.manager === 'yarn' || candidate.manager === 'bun') {
    const encoded = candidate.name.startsWith('@') ? `@${encodeURIComponent(candidate.name.slice(1))}` : encodeURIComponent(candidate.name);
    return fetchJson(`https://registry.npmjs.org/${encoded}`);
  }
  if (candidate.manager === 'pip' || candidate.manager === 'poetry' || candidate.manager === 'uv') {
    return fetchJson(`https://pypi.org/pypi/${encodeURIComponent(candidate.name)}/json`);
  }
  return null;
}

async function describePackage(candidate) {
  let metadata;
  try { metadata = await fetchPackageMetadata(candidate); }
  catch (_) { metadata = null; }

  return {
    name: candidate.name,
    version: candidate.version,
    description: metadata?.description || metadata?.info?.summary || null,
    sourceUrl: deriveSourceUrl(metadata) || deriveSourceUrl(metadata?.info),
    license: metadata?.license || metadata?.info?.license,
    keywords: metadata?.keywords || metadata?.info?.keywords?.split(',') || [],
    metadata,
  };
}

module.exports = { describePackage, deriveSourceUrl, fetchPackageMetadata };
