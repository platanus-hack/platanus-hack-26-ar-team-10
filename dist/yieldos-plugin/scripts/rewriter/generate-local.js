'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function buildHeader({ candidate, sourceUrl, contentBody }) {
  const date = new Date().toISOString();
  return [
    '/**',
    ' * yieldOS-rewrite',
    ` * source: ${candidate.manager}:${candidate.name}@${candidate.version}`,
    ` * source-url: ${sourceUrl || 'unknown'}`,
    ` * generated-at: ${date}`,
    ` * content-hash: sha256:${sha256(contentBody)}`,
    ' */',
    '',
  ].join('\n');
}

function placeholderImplementation(candidate) {
  // Minimal scaffold only. The agent (via the dependency-gate skill) is expected
  // to read the source of truth and produce the actual implementation. This file
  // exists so that yieldOS has a known marker even before the agent fills it in.
  const safeName = candidate.name.replace(/[^A-Za-z0-9_]/g, '_');
  return `module.exports = (function ${safeName}_yieldos_rewrite() {\n  throw new Error('yieldOS rewrite scaffold for ${candidate.name} — agent must populate this file with the rewritten implementation per the dependency-gate skill.');\n})();\n`;
}

function targetDir(projectRoot, candidate) {
  return path.join(projectRoot, 'src', 'lib', 'yieldos', sanitize(candidate.name));
}

function sanitize(name) {
  return name.replace(/[^A-Za-z0-9_/@-]/g, '_').replace(/^@/, '');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeScaffold(projectRoot, candidate, sourceUrl) {
  const dir = targetDir(projectRoot, candidate);
  ensureDir(dir);
  const indexPath = path.join(dir, 'index.js');
  const body = placeholderImplementation(candidate);
  const header = buildHeader({ candidate, sourceUrl, contentBody: body });
  fs.writeFileSync(indexPath, header + body);
  return { dir, indexPath, contentHash: extractContentHash(header) };
}

function extractContentHash(header) {
  const m = header.match(/content-hash:\s*sha256:([a-f0-9]+)/);
  return m ? m[1] : null;
}

function updateIndex(projectRoot, candidate, sourceUrl, files, contentHash) {
  const indexPath = path.join(projectRoot, 'security', 'yieldos-rewrites.json');
  fs.mkdirSync(path.dirname(indexPath), { recursive: true });
  let data = { rewrites: [] };
  if (fs.existsSync(indexPath)) {
    try { data = JSON.parse(fs.readFileSync(indexPath, 'utf8')); }
    catch (_) { data = { rewrites: [] }; }
  }
  if (!Array.isArray(data.rewrites)) data.rewrites = [];
  const entry = {
    package: `${candidate.manager}:${candidate.name}`,
    version: candidate.version,
    source_url: sourceUrl || null,
    files,
    generated_at: new Date().toISOString(),
    content_hash: contentHash,
    user_modified: false,
  };
  const existingIdx = data.rewrites.findIndex((r) => r.package === entry.package);
  if (existingIdx >= 0) data.rewrites[existingIdx] = entry;
  else data.rewrites.push(entry);
  fs.writeFileSync(indexPath, JSON.stringify(data, null, 2));
  return indexPath;
}

function userMessage(candidate) {
  return `yieldOS realizó una optimización de la instalación de ${candidate.name}`;
}

module.exports = { writeScaffold, updateIndex, userMessage, sha256, buildHeader, targetDir };
