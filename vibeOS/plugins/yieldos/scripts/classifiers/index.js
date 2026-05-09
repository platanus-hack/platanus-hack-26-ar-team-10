'use strict';

const npm = require('./npm');
const pnpm = require('./pnpm');
const yarn = require('./yarn');
const bun = require('./bun');
const pip = require('./pip');
const poetry = require('./poetry');
const uv = require('./uv');
const cargo = require('./cargo');
const go = require('./go');
const skills = require('./skills');
const vendoring = require('./vendoring');
const binaries = require('./binaries');

const ALL = [npm, pnpm, yarn, bun, pip, poetry, uv, cargo, go, skills, vendoring, binaries];

function classifyBashCommand(command) {
  if (typeof command !== 'string' || command.trim().length === 0) {
    return [];
  }

  const segments = splitChained(command);
  const candidates = [];

  for (const segment of segments) {
    for (const classifier of ALL) {
      const matched = classifier.match(segment);
      if (matched && matched.length > 0) {
        for (const c of matched) {
          candidates.push({
            ...c,
            command: segment.trim(),
            requested_by: 'agent',
          });
        }
        break;
      }
    }
  }

  return candidates;
}

function splitChained(cmd) {
  const out = [];
  let buf = '';
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];
    const next = cmd[i + 1];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    if (!inSingle && !inDouble) {
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      if (depth === 0) {
        if ((ch === '&' && next === '&') || (ch === '|' && next === '|')) {
          out.push(buf);
          buf = '';
          i++;
          continue;
        }
        if (ch === ';') {
          out.push(buf);
          buf = '';
          continue;
        }
      }
    }
    buf += ch;
  }
  if (buf.trim().length > 0) out.push(buf);
  return out;
}

function classifyWriteOrEdit(filePath, content = '') {
  // Only instruction files are actionable on Write/Edit.
  // Manifest edits (package.json, requirements.txt, Cargo.toml, go.mod, etc.) are
  // intentionally NOT classified here: they have no reliable package name to look up,
  // and the actual install command (npm install, pip install, etc.) is gated separately
  // when the agent runs it via Bash. Adding a dep to a manifest without running install
  // is a no-op until that install fires, so we let the file edit pass through.
  if (!filePath) return [];
  const base = filePath.split('/').pop();
  const candidates = [];
  if (/^CLAUDE\.md$/i.test(base) || /^AGENTS\.md$/i.test(base) || /^\.cursorrules$/i.test(base)) {
    candidates.push({ type: 'instruction-file', name: base, version: 'unknown', source: filePath, manager: 'instruction' });
  }
  return candidates.map((c) => ({ ...c, content, requested_by: 'agent' }));
}

module.exports = {
  classifyBashCommand,
  classifyWriteOrEdit,
  splitChained,
};
