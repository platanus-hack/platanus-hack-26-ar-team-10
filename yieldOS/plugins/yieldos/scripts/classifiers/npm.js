'use strict';

const COMMAND_RE = /(?:^|\s)npm\s+(?:install|i|add)\b/;
const FLAG_RE = /^(--?[\w-]+)(?:=(.+))?$/;

function tokenize(cmd) {
  return cmd.trim().split(/\s+/);
}

function isBareInstall(tokens) {
  // `npm install` / `npm i` with no positional → reads package.json, no new candidate
  const pkgArgs = tokens.slice(2).filter((t) => !FLAG_RE.test(t) && t !== 'install' && t !== 'i' && t !== 'add');
  return pkgArgs.length === 0;
}

function parsePackageSpec(spec) {
  // Examples: lodash, lodash@4.17.21, @types/node, @types/node@18.0.0,
  // file:./local, github:user/repo, ./relative, /abs, https://url
  if (!spec) return null;
  if (spec.startsWith('file:') || spec.startsWith('./') || spec.startsWith('/') ||
      spec.startsWith('http://') || spec.startsWith('https://')) {
    return { name: spec, version: 'local-or-remote', exotic: true };
  }
  if (spec.startsWith('github:') || spec.startsWith('git+')) {
    return { name: spec, version: 'git-ref', exotic: true };
  }
  let name;
  let version = 'latest';
  if (spec.startsWith('@')) {
    const idx = spec.indexOf('@', 1);
    if (idx === -1) {
      name = spec;
    } else {
      name = spec.slice(0, idx);
      version = spec.slice(idx + 1) || 'latest';
    }
  } else {
    const idx = spec.indexOf('@');
    if (idx === -1) {
      name = spec;
    } else {
      name = spec.slice(0, idx);
      version = spec.slice(idx + 1) || 'latest';
    }
  }
  return { name, version, exotic: false };
}

function match(cmd) {
  if (!COMMAND_RE.test(cmd)) return [];
  const tokens = tokenize(cmd);
  // Skip if not actually npm at the start (avoid false positives in env vars)
  const npmIdx = tokens.findIndex((t) => t === 'npm');
  if (npmIdx === -1) return [];
  const verb = tokens[npmIdx + 1];
  if (!['install', 'i', 'add'].includes(verb)) return [];
  if (isBareInstall(tokens)) return [];
  const positionals = tokens.slice(npmIdx + 2).filter((t) => !FLAG_RE.test(t));
  return positionals
    .map(parsePackageSpec)
    .filter(Boolean)
    .map((p) => ({
      type: p.exotic ? 'vendored-code' : 'library',
      name: p.name,
      version: p.version,
      source: 'npm',
      manager: 'npm',
      exotic: p.exotic === true,
    }));
}

module.exports = { match, parsePackageSpec };
