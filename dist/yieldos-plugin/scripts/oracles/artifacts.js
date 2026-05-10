'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { canonicalJson } = require('./result');
const { redactValue } = require('./redact');

const ORACLE_ARTIFACT_PREFIX = 'security/oracles/';
const MAX_RESULT_BYTES = 16 * 1024;
const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_VERIFIED_ARTIFACT_BYTES = MAX_MANIFEST_BYTES;
const ARTIFACT_FILES = [
  ['manifest', 'manifest.json', MAX_MANIFEST_BYTES],
  ['contract', 'contract.json', MAX_RESULT_BYTES],
  ['replay', 'replay.json', MAX_RESULT_BYTES],
  ['baselineResult', 'baseline-result.json', MAX_RESULT_BYTES],
  ['fixedResult', 'fixed-result.json', MAX_RESULT_BYTES],
  ['proofManifest', 'proof-manifest.json', MAX_MANIFEST_BYTES],
];

function writeArtifactSet(projectRoot, artifactSet) {
  const id = validateId(artifactSet?.id);
  const dir = safeArtifactDir(projectRoot, id);
  fs.mkdirSync(dir, { recursive: true });
  assertNoSymlink(dir, 'oracle artifact directory');

  const artifacts = [];
  for (const [key, filename, maxBytes] of ARTIFACT_FILES) {
    if (artifactSet[key] === undefined) continue;
    const file = safeArtifactFile(projectRoot, id, filename);
    const content = renderArtifact(artifactSet[key], maxBytes);
    fs.writeFileSync(file.absolutePath, content);
    artifacts.push({
      type: key,
      path: file.relativePath,
      sha256: sha256(content),
      bytes: Buffer.byteLength(content, 'utf8'),
    });
  }
  return { id, directory: `${ORACLE_ARTIFACT_PREFIX}${id}`, artifacts };
}

function readArtifactReferences(projectRoot, references = [], options = {}) {
  return references.map((reference) => {
    const relativePath = normalizeArtifactPath(reference.path);
    const contentResult = options.gitRef
      ? readGitObject(projectRoot, options.gitRef, relativePath)
      : readWorkingTree(projectRoot, relativePath);
    if (!contentResult.ok) return { ...reference, ok: false, reason: contentResult.reason };
    const content = contentResult.content;
    const actual = sha256(content);
    return {
      ...reference,
      ok: actual === reference.sha256,
      reason: actual === reference.sha256 ? 'verified' : 'hash-mismatch',
      actual_sha256: actual,
    };
  });
}

function verifyArtifactReferences(projectRoot, references = [], options = {}) {
  const checked = readArtifactReferences(projectRoot, references, options);
  const failed = checked.filter((item) => !item.ok);
  return { ok: failed.length === 0, checked, failed };
}

function readWorkingTree(projectRoot, relativePath) {
  let absolutePath;
  try {
    absolutePath = safeExistingArtifactPath(projectRoot, relativePath);
  } catch (err) {
    return { ok: false, reason: err.reason || 'unsafe-path' };
  }
  if (!fs.existsSync(absolutePath)) return { ok: false, reason: 'missing' };
  if (fs.statSync(absolutePath).size > MAX_VERIFIED_ARTIFACT_BYTES) {
    return { ok: false, reason: 'artifact-too-large' };
  }
  return { ok: true, content: fs.readFileSync(absolutePath, 'utf8') };
}

function readGitObject(projectRoot, gitRef, relativePath) {
  try {
    const mode = gitObjectMode(projectRoot, gitRef, relativePath);
    if (mode === '120000') return { ok: false, reason: 'symlink-traversal' };
    const size = Number(execFileSync('git', ['cat-file', '-s', `${gitRef}:${relativePath}`], {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim());
    if (!Number.isFinite(size) || size > MAX_VERIFIED_ARTIFACT_BYTES) {
      return { ok: false, reason: 'artifact-too-large' };
    }
    return {
      ok: true,
      content: execFileSync('git', ['show', `${gitRef}:${relativePath}`], {
        cwd: projectRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }),
    };
  } catch (_) {
    return { ok: false, reason: 'not-committed' };
  }
}

function gitObjectMode(projectRoot, gitRef, relativePath) {
  const treeLine = execFileSync('git', ['ls-tree', gitRef, '--', relativePath], {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  if (!treeLine) throw new Error('not committed');
  return treeLine.split(/\s+/, 1)[0];
}

function renderArtifact(value, maxBytes) {
  const redacted = redactValue(value);
  const content = `${JSON.stringify(redacted, null, 2)}\n`;
  if (Buffer.byteLength(content, 'utf8') <= maxBytes) return content;
  const summary = {
    version: redacted?.version || '0.1',
    summarized: true,
    reason: `artifact exceeded ${maxBytes} bytes`,
    original_sha256: sha256(canonicalJson(redacted)),
  };
  return `${JSON.stringify(summary, null, 2)}\n`;
}

function validateId(id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9._-]+$/.test(id)) {
    throw new Error('oracle artifact id must contain only letters, numbers, dot, underscore, or dash');
  }
  return id;
}

function safeArtifactDir(projectRoot, id) {
  const root = path.resolve(projectRoot);
  const dir = path.resolve(root, ORACLE_ARTIFACT_PREFIX, id);
  assertInside(root, dir, 'oracle artifact directory');
  assertNoSymlinkTraversal(root, dir, 'oracle artifact directory');
  return dir;
}

function safeArtifactFile(projectRoot, id, filename) {
  const root = path.resolve(projectRoot);
  const relativePath = normalizeArtifactPath(`${ORACLE_ARTIFACT_PREFIX}${id}/${filename}`);
  const absolutePath = path.resolve(root, relativePath);
  assertInside(root, absolutePath, 'oracle artifact file');
  assertNoSymlinkTraversal(root, absolutePath, 'oracle artifact file');
  return { relativePath, absolutePath };
}

function safeExistingArtifactPath(projectRoot, relativePath) {
  const root = path.resolve(projectRoot);
  const normalized = normalizeArtifactPath(relativePath);
  const absolutePath = path.resolve(root, normalized);
  assertInside(root, absolutePath, 'oracle artifact file');
  try {
    assertNoSymlinkTraversal(root, absolutePath, 'oracle artifact file');
  } catch (err) {
    err.reason = 'symlink-traversal';
    throw err;
  }
  return absolutePath;
}

function normalizeArtifactPath(relativePath) {
  const normalized = path.posix.normalize(String(relativePath).split(path.sep).join('/'));
  if (!normalized.startsWith(ORACLE_ARTIFACT_PREFIX) || normalized.includes('../')) {
    throw new Error('oracle artifact path must stay under security/oracles/');
  }
  return normalized;
}

function assertInside(root, target, label) {
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (target !== root && !target.startsWith(prefix)) throw new Error(`${label} must stay inside the project`);
}

function assertNoSymlinkTraversal(root, target, label) {
  let current = target;
  const missing = [];
  while (!fs.existsSync(current) && current !== root && current !== path.dirname(current)) {
    missing.unshift(path.basename(current));
    current = path.dirname(current);
  }
  const existing = fs.existsSync(current) ? fs.realpathSync.native(current) : path.resolve(current);
  const rebuilt = path.join(existing, ...missing);
  assertInside(fs.realpathSync.native(root), rebuilt, `${label} realpath`);
  assertNoSymlink(current, label);
}

function assertNoSymlink(target, label) {
  try {
    if (fs.lstatSync(target).isSymbolicLink()) throw new Error(`${label} must not traverse a symlink`);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

function sha256(content) {
  return `sha256:${crypto.createHash('sha256').update(content, 'utf8').digest('hex')}`;
}

module.exports = {
  ORACLE_ARTIFACT_PREFIX,
  MAX_VERIFIED_ARTIFACT_BYTES,
  writeArtifactSet,
  verifyArtifactReferences,
  readArtifactReferences,
  readGitObject,
  gitObjectMode,
  normalizeArtifactPath,
  safeExistingArtifactPath,
  sha256,
};
