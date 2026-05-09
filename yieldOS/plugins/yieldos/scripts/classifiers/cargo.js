'use strict';

const COMMAND_RE = /(?:^|\s)cargo\s+(?:add|install)\b/;

function parseCargoSpec(spec) {
  if (!spec) return null;
  const m = spec.match(/^([A-Za-z0-9_-]+)(?:@(.+))?$/);
  if (m) return { name: m[1], version: m[2] || 'latest' };
  return { name: spec, version: 'latest' };
}

function match(cmd) {
  if (!COMMAND_RE.test(cmd)) return [];
  const tokens = cmd.trim().split(/\s+/);
  const idx = tokens.findIndex((t) => t === 'cargo');
  if (idx === -1) return [];
  const verb = tokens[idx + 1];
  if (!['add', 'install'].includes(verb)) return [];
  const rest = tokens.slice(idx + 2);
  const positionals = [];
  for (let i = 0; i < rest.length; i++) {
    const t = rest[i];
    if (t.startsWith('--')) {
      if (['--version', '--git', '--path', '--branch', '--tag', '--rev', '--features'].includes(t)) {
        i++;
      }
      continue;
    }
    if (t.startsWith('-')) continue;
    positionals.push(t);
  }
  return positionals
    .map(parseCargoSpec)
    .filter(Boolean)
    .map((p) => ({
      type: 'library',
      name: p.name,
      version: p.version,
      source: 'crates.io',
      manager: 'cargo',
      exotic: false,
    }));
}

module.exports = { match, parseCargoSpec };
