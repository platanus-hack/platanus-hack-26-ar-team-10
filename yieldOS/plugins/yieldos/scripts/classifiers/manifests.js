'use strict';

const fs = require('node:fs');

// Parsers per manifest format. Each returns an array of {name, version, manager, source}.

function parseRequirementsTxt(content) {
  if (typeof content !== 'string') return [];
  const out = [];
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.split('#')[0].trim();
    if (!line) continue;
    if (line.startsWith('-') || line.startsWith('git+') || line.startsWith('http') || line.startsWith('./') || line.startsWith('/')) continue;
    const m = line.match(/^([A-Za-z0-9_.\-]+)(?:\[[^\]]+\])?(?:\s*(==|>=|<=|~=|!=|>|<)\s*([A-Za-z0-9_.\-+!]+))?/);
    if (!m) continue;
    out.push({
      name: m[1],
      version: m[3] || 'latest',
      manager: 'pip',
      source: 'pypi',
    });
  }
  return out;
}

function parsePackageJson(content) {
  if (typeof content !== 'string') return [];
  let pkg;
  try { pkg = JSON.parse(content); } catch (_) { return []; }
  const out = [];
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    const map = pkg[field];
    if (!map || typeof map !== 'object') continue;
    for (const [name, raw] of Object.entries(map)) {
      const cleaned = String(raw).replace(/^[~^=v]+/, '').trim();
      out.push({
        name,
        version: cleaned || 'latest',
        manager: 'npm',
        source: 'npm',
      });
    }
  }
  return out;
}

function parsePyprojectToml(content) {
  if (typeof content !== 'string') return [];
  // Minimal parser for Poetry / PEP 621 layouts. We only extract names.
  const out = [];
  const blockMatch = content.match(/\[(?:tool\.poetry\.dependencies|project\.dependencies|tool\.poetry\.dev-dependencies)\][\s\S]*?(?=\n\[|\n*$)/g) || [];
  for (const block of blockMatch) {
    for (const line of block.split(/\r?\n/)) {
      const eq = line.match(/^\s*([A-Za-z0-9_.\-]+)\s*=\s*"([^"]+)"/);
      if (eq) {
        out.push({
          name: eq[1],
          version: eq[2].replace(/^[~^=v]+/, ''),
          manager: 'poetry',
          source: 'pypi',
        });
      }
    }
  }
  return out;
}

function parseCargoToml(content) {
  if (typeof content !== 'string') return [];
  const out = [];
  const blockMatch = content.match(/\[(?:dependencies|dev-dependencies|build-dependencies)\][\s\S]*?(?=\n\[|\n*$)/g) || [];
  for (const block of blockMatch) {
    for (const line of block.split(/\r?\n/)) {
      const eq = line.match(/^\s*([A-Za-z0-9_-]+)\s*=\s*"([^"]+)"/);
      if (eq) {
        out.push({
          name: eq[1],
          version: eq[2].replace(/^[~^=v]+/, ''),
          manager: 'cargo',
          source: 'crates.io',
        });
      }
    }
  }
  return out;
}

function parseGoMod(content) {
  if (typeof content !== 'string') return [];
  const out = [];
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.\-/]+)\s+v([\w.\-+]+)/);
    if (m && /\//.test(m[1])) {
      out.push({
        name: m[1],
        version: m[2],
        manager: 'go',
        source: 'go-modules',
      });
    }
  }
  return out;
}

function parseManifest(filePath, content) {
  if (!filePath) return [];
  const base = filePath.split('/').pop();
  if (base === 'package.json') return parsePackageJson(content);
  if (/^requirements.*\.txt$/.test(base)) return parseRequirementsTxt(content);
  if (base === 'pyproject.toml' || base === 'Pipfile') return parsePyprojectToml(content);
  if (base === 'Cargo.toml') return parseCargoToml(content);
  if (base === 'go.mod') return parseGoMod(content);
  return [];
}

function readPrevious(filePath) {
  try { return fs.readFileSync(filePath, 'utf8'); }
  catch (_) { return ''; }
}

function diffManifest(filePath, newContent, oldContent = null) {
  // Compare new vs old content; return only the packages that are NEW.
  const prev = oldContent === null ? readPrevious(filePath) : oldContent;
  const oldPkgs = new Map(parseManifest(filePath, prev).map((p) => [`${p.manager}:${p.name}`, p]));
  const newPkgs = parseManifest(filePath, newContent);
  const added = [];
  for (const p of newPkgs) {
    const k = `${p.manager}:${p.name}`;
    if (!oldPkgs.has(k)) added.push(p);
  }
  return added;
}

module.exports = {
  parseManifest,
  parseRequirementsTxt,
  parsePackageJson,
  parsePyprojectToml,
  parseCargoToml,
  parseGoMod,
  diffManifest,
  readPrevious,
};
