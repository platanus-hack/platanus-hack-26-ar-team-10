'use strict';

const pip = require('./pip');

const COMMAND_RE = /(?:^|\s)poetry\s+add\b/;

function match(cmd) {
  if (!COMMAND_RE.test(cmd)) return [];
  const tokens = cmd.trim().split(/\s+/);
  const idx = tokens.findIndex((t) => t === 'poetry');
  if (idx === -1 || tokens[idx + 1] !== 'add') return [];
  const positionals = tokens.slice(idx + 2).filter((t) => !t.startsWith('-'));
  return positionals
    .map(pip.parsePypiSpec)
    .filter(Boolean)
    .map((p) => ({
      type: p.exotic ? 'vendored-code' : 'library',
      name: p.name,
      version: p.version,
      source: 'pypi',
      manager: 'poetry',
      exotic: p.exotic === true,
    }));
}

module.exports = { match };
