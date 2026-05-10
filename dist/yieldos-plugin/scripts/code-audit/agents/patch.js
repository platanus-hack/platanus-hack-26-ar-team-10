'use strict';

const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { restageFiles } = require('../git');

function parsePatchFiles(patch) {
  const files = new Set();
  for (const raw of String(patch || '').split(/\r?\n/)) {
    const diffMatch = /^diff --git a\/(.+) b\/(.+)$/.exec(raw);
    if (diffMatch) {
      files.add(normalizePatchPath(diffMatch[2]));
      continue;
    }

    const plusMatch = /^\+\+\+ b\/(.+)$/.exec(raw);
    if (plusMatch) files.add(normalizePatchPath(plusMatch[1]));
  }
  files.delete('/dev/null');
  return Array.from(files);
}

function applyAgentPatch(projectRoot, patch, allowedFiles) {
  const files = parsePatchFiles(patch);
  if (files.length === 0) throw new Error('agent patch did not include any files');
  validatePatchFiles(files, allowedFiles);

  execFileSync('git', ['apply', '--check', '-'], {
    cwd: projectRoot,
    input: patch,
    encoding: 'utf8',
    stdio: ['pipe', 'ignore', 'pipe'],
  });
  execFileSync('git', ['apply', '-'], {
    cwd: projectRoot,
    input: patch,
    encoding: 'utf8',
    stdio: ['pipe', 'ignore', 'pipe'],
  });
  restageFiles(projectRoot, files);
  return { fixed: true, files };
}

function validatePatchFiles(files, allowedFiles) {
  const allowed = new Set((allowedFiles || []).map(normalizePatchPath));
  for (const file of files) {
    if (!allowed.has(file)) {
      throw new Error(`agent patch touches ${file} outside audited files`);
    }
  }
}

function normalizePatchPath(file) {
  const normalized = String(file || '').replace(/\\/g, '/');
  if (!normalized || normalized === '/dev/null') return normalized;
  if (path.isAbsolute(normalized) || normalized.split('/').includes('..')) {
    throw new Error(`unsafe patch path: ${file}`);
  }
  return normalized.replace(/^\.\//, '');
}

module.exports = {
  parsePatchFiles,
  applyAgentPatch,
  validatePatchFiles,
};
