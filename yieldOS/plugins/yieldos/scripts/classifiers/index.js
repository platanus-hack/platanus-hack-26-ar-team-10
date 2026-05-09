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
const manifests = require('./manifests');

const ALL = [npm, pnpm, yarn, bun, pip, poetry, uv, cargo, go, skills, vendoring, binaries];
const MANIFEST_FILENAMES = /^(?:package\.json|requirements.*\.txt|pyproject\.toml|Pipfile|Cargo\.toml|go\.mod)$/i;

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

function classifyWriteOrEdit(filePath, content = '', oldContent = null) {
  if (!filePath) return [];
  const base = filePath.split('/').pop();

  if (/^CLAUDE\.md$/i.test(base) || /^AGENTS\.md$/i.test(base) || /^\.cursorrules$/i.test(base)) {
    return [{
      type: 'instruction-file',
      name: base,
      version: 'unknown',
      source: filePath,
      manager: 'instruction',
      content,
      requested_by: 'agent',
    }];
  }

  if (MANIFEST_FILENAMES.test(base)) {
    return manifests.diffManifest(filePath, content, oldContent).map((pkg) => ({
      type: pkg.exotic ? 'vendored-code' : 'library',
      name: pkg.name,
      version: pkg.version,
      source: pkg.source,
      manager: pkg.manager,
      exotic: pkg.exotic === true,
      command: `manifest-edit:${base}`,
      requested_by: 'agent',
    }));
  }

  return [];
}

module.exports = {
  classifyBashCommand,
  classifyWriteOrEdit,
  splitChained,
};
