'use strict';

const npm = require('./npm');

const COMMAND_RE = /(?:^|\s)pnpm\s+(?:install|i|add)\b/;
const FLAG_RE = /^(--?[\w-]+)(?:=(.+))?$/;

function match(cmd) {
  if (!COMMAND_RE.test(cmd)) return [];
  const tokens = cmd.trim().split(/\s+/);
  const idx = tokens.findIndex((t) => t === 'pnpm');
  if (idx === -1) return [];
  const verb = tokens[idx + 1];
  if (!['install', 'i', 'add'].includes(verb)) return [];
  const positionals = tokens.slice(idx + 2).filter((t) => !FLAG_RE.test(t));
  if (positionals.length === 0) return [];
  return positionals
    .map(npm.parsePackageSpec)
    .filter(Boolean)
    .map((p) => ({
      type: p.exotic ? 'vendored-code' : 'library',
      name: p.name,
      version: p.version,
      source: 'npm',
      manager: 'pnpm',
      exotic: p.exotic === true,
    }));
}

module.exports = { match };
