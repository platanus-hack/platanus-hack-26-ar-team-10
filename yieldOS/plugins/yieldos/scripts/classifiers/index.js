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
const manifests = require('./manifests');

const MANIFEST_FILENAMES = /^(?:package\.json|pnpm-workspace\.ya?ml|requirements.*\.txt|pyproject\.toml|Pipfile|Cargo\.toml|go\.mod)$/;

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

  // Instruction files: handled by handleInstructionEdit / injection scanner upstream.
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

  // Manifest files: parse the diff and return only NEWLY-added packages as candidates.
  // Each new package goes through the full decide flow exactly as if the user had run
  // `npm install <pkg>` or `pip install <pkg>`.
  if (MANIFEST_FILENAMES.test(base)) {
    const added = manifests.diffManifest(filePath, content, oldContent);
    return added.map((p) => ({
      type: 'library',
      name: p.name,
      version: p.version,
      source: p.source,
      manager: p.manager,
      exotic: false,
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
