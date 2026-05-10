'use strict';

const COMMAND_RES = [
  /(?:^|\s)claude\s+mcp\s+add\s+(\S+)/,
  /(?:^|\s)claude\s+mcp\s+add-json\s+(\S+)/,
];

function normalizeName(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  return value.startsWith('mcp:') ? value : `mcp:${value}`;
}

function match(cmd) {
  const out = [];
  for (const re of COMMAND_RES) {
    const m = cmd.match(re);
    if (!m) continue;
    const name = normalizeName(m[1]);
    if (!name) continue;
    out.push({
      type: 'mcp',
      name,
      version: 'latest',
      source: 'claude-mcp',
      manager: 'mcp',
      exotic: false,
    });
  }
  return out;
}

module.exports = { match, normalizeName };
