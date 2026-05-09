'use strict';

const fs = require('node:fs');
const path = require('node:path');

function cleanNpmVersion(raw) {
  const value = String(raw || '').trim();
  if (!value || value === '*') return { version: 'latest', exotic: false };
  if (/^(?:file:|link:|workspace:|git\+|github:|https?:)/i.test(value)) {
    return { version: 'local-or-remote', exotic: true };
  }
  return { version: value.replace(/^[~^=v]+/, '').trim() || 'latest', exotic: false };
}

function cleanPlainVersion(raw) {
  const value = String(raw || '').trim();
  if (!value || value === '*') return 'latest';
  return value.replace(/^[~^=v]+/, '').trim() || 'latest';
}

function parsePythonSpec(spec, manager = 'pip') {
  const value = String(spec || '').split(';')[0].trim();
  if (!value) return null;
  if (/^(?:-|git\+|hg\+|svn\+|https?:|ftp:|file:|\.\/|\/)/i.test(value)) return null;
  const match = value.match(/^([A-Za-z0-9_.-]+)(?:\[[^\]]+\])?\s*(?:==|>=|<=|~=|!=|>|<)?\s*([A-Za-z0-9_.+!*,-]+)?/);
  if (!match) return null;
  return {
    name: match[1],
    version: cleanPlainVersion(match[2]),
    manager,
    source: 'pypi',
    exotic: false,
  };
}

function parseRequirementsTxt(content) {
  if (typeof content !== 'string') return [];
  const out = [];
  for (const rawLine of content.split(/\r?\n/)) {
    const parsed = parsePythonSpec(rawLine.split('#')[0], 'pip');
    if (parsed) out.push(parsed);
  }
  return out;
}

function parsePackageJson(content) {
  if (typeof content !== 'string') return [];
  let pkg;
  try { pkg = JSON.parse(content); } catch (_) { return []; }
  const out = [];
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    const deps = pkg[field];
    if (!deps || typeof deps !== 'object' || Array.isArray(deps)) continue;
    for (const [name, rawVersion] of Object.entries(deps)) {
      const cleaned = cleanNpmVersion(rawVersion);
      out.push({
        name,
        version: cleaned.version,
        manager: 'npm',
        source: 'npm',
        exotic: cleaned.exotic,
      });
    }
  }
  return out;
}

function parseTomlDependencyBlocks(content, blockNames, manager) {
  const out = [];
  const blocks = content.match(/\[[^\]]+\][\s\S]*?(?=\n\[|\s*$)/g) || [];
  for (const block of blocks) {
    const header = (block.match(/^\[([^\]]+)\]/) || [])[1];
    if (!blockNames.includes(header)) continue;
    for (const line of block.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z0-9_.-]+)\s*=\s*(.+?)\s*(?:#.*)?$/);
      if (!match || match[1] === 'python') continue;
      const raw = match[2].trim();
      const versionMatch = raw.match(/version\s*=\s*"([^"]+)"/) || raw.match(/^"([^"]+)"/);
      if (!versionMatch) continue;
      out.push({
        name: match[1],
        version: cleanPlainVersion(versionMatch[1]),
        manager,
        source: manager === 'cargo' ? 'crates.io' : 'pypi',
        exotic: /\b(?:path|git)\s*=/.test(raw),
      });
    }
  }
  return out;
}

function parsePep621Dependencies(content) {
  const out = [];
  const depsMatch = content.match(/(?:^|\n)\s*dependencies\s*=\s*\[([\s\S]*?)\]/);
  if (!depsMatch) return out;
  const quoted = depsMatch[1].match(/"([^"]+)"/g) || [];
  for (const item of quoted) {
    const parsed = parsePythonSpec(item.slice(1, -1), 'pip');
    if (parsed) out.push(parsed);
  }
  return out;
}

function parsePyprojectToml(content) {
  if (typeof content !== 'string') return [];
  return [
    ...parseTomlDependencyBlocks(content, ['tool.poetry.dependencies', 'tool.poetry.dev-dependencies'], 'poetry'),
    ...parsePep621Dependencies(content),
  ];
}

function parsePipfile(content) {
  if (typeof content !== 'string') return [];
  return parseTomlDependencyBlocks(content, ['packages', 'dev-packages'], 'pip');
}

function parseCargoToml(content) {
  if (typeof content !== 'string') return [];
  return parseTomlDependencyBlocks(content, ['dependencies', 'dev-dependencies', 'build-dependencies'], 'cargo');
}

function parseGoMod(content) {
  if (typeof content !== 'string') return [];
  const out = [];
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:require\s+)?([\w./-]+)\s+v([A-Za-z0-9_.+-]+)/);
    if (!match || !match[1].includes('/')) continue;
    out.push({
      name: match[1],
      version: match[2],
      manager: 'go',
      source: 'go-modules',
      exotic: false,
    });
  }
  return out;
}

function parseManifest(filePath, content) {
  const base = path.basename(filePath || '');
  if (base === 'package.json') return parsePackageJson(content);
  if (/^requirements.*\.txt$/i.test(base)) return parseRequirementsTxt(content);
  if (base === 'pyproject.toml') return parsePyprojectToml(content);
  if (base === 'Pipfile') return parsePipfile(content);
  if (base === 'Cargo.toml') return parseCargoToml(content);
  if (base === 'go.mod') return parseGoMod(content);
  return [];
}

function readPrevious(filePath) {
  try { return fs.readFileSync(filePath, 'utf8'); }
  catch (_) { return ''; }
}

function diffManifest(filePath, newContent, oldContent = null) {
  const previous = oldContent === null ? readPrevious(filePath) : oldContent;
  const oldPackages = new Map(parseManifest(filePath, previous).map((pkg) => [`${pkg.manager}:${pkg.name}`, pkg]));
  const addedOrChanged = [];

  for (const pkg of parseManifest(filePath, newContent)) {
    const key = `${pkg.manager}:${pkg.name}`;
    const oldPkg = oldPackages.get(key);
    if (!oldPkg || oldPkg.version !== pkg.version || oldPkg.exotic !== pkg.exotic) {
      addedOrChanged.push(pkg);
    }
  }

  return addedOrChanged;
}

module.exports = {
  parseManifest,
  parseRequirementsTxt,
  parsePackageJson,
  parsePyprojectToml,
  parsePipfile,
  parseCargoToml,
  parseGoMod,
  diffManifest,
  readPrevious,
};
