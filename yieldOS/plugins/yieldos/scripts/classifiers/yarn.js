'use strict';

const npm = require('./npm');

const COMMAND_RE = /(?:^|\s)yarn\s+(?:add|install)\b/;
const FLAG_RE = /^(--?[\w-]+)(?:=(.+))?$/;

function match(cmd) {
  if (!COMMAND_RE.test(cmd)) return [];
  const tokens = cmd.trim().split(/\s+/);
  const idx = tokens.findIndex((t) => t === 'yarn');
  if (idx === -1) return [];
  const verb = tokens[idx + 1];
  if (!['add', 'install'].includes(verb)) return [];
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
      manager: 'yarn',
      exotic: p.exotic === true,
    }));
}

module.exports = { match };
