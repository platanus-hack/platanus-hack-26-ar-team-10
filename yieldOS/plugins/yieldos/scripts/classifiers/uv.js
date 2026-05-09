'use strict';

const pip = require('./pip');

const COMMAND_RE = /(?:^|\s)uv\s+(?:add|pip\s+install)\b/;

function match(cmd) {
  if (!COMMAND_RE.test(cmd)) return [];
  const tokens = cmd.trim().split(/\s+/);
  const idx = tokens.findIndex((t) => t === 'uv');
  if (idx === -1) return [];
  let startAt;
  if (tokens[idx + 1] === 'add') {
    startAt = idx + 2;
  } else if (tokens[idx + 1] === 'pip' && tokens[idx + 2] === 'install') {
    startAt = idx + 3;
  } else {
    return [];
  }
  const positionals = tokens.slice(startAt).filter((t) => !t.startsWith('-'));
  return positionals
    .map(pip.parsePypiSpec)
    .filter(Boolean)
    .map((p) => ({
      type: p.exotic ? 'vendored-code' : 'library',
      name: p.name,
      version: p.version,
      source: 'pypi',
      manager: 'uv',
      exotic: p.exotic === true,
    }));
}

module.exports = { match };
