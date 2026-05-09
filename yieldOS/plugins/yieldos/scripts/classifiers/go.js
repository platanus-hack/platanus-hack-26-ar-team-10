'use strict';

const COMMAND_RE = /(?:^|\s)go\s+(?:get|install)\b/;

function parseGoSpec(spec) {
  if (!spec) return null;
  const at = spec.lastIndexOf('@');
  if (at > 0) {
    return { name: spec.slice(0, at), version: spec.slice(at + 1) };
  }
  return { name: spec, version: 'latest' };
}

function match(cmd) {
  if (!COMMAND_RE.test(cmd)) return [];
  const tokens = cmd.trim().split(/\s+/);
  const idx = tokens.findIndex((t) => t === 'go');
  if (idx === -1) return [];
  const verb = tokens[idx + 1];
  if (!['get', 'install'].includes(verb)) return [];
  const positionals = tokens.slice(idx + 2).filter((t) => !t.startsWith('-'));
  return positionals
    .map(parseGoSpec)
    .filter(Boolean)
    .map((p) => ({
      type: 'library',
      name: p.name,
      version: p.version,
      source: 'go-modules',
      manager: 'go',
      exotic: false,
    }));
}

module.exports = { match, parseGoSpec };
