'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const MANIFEST_FILE = 'manifest.json';
const SCHEMA_VERSION = 1;

function sha256Bytes(bytes) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

function normalizeSha256(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  return value.startsWith('sha256:') ? value : `sha256:${value}`;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function safePolicyPath(policyDir, file) {
  if (typeof file !== 'string' || file.length === 0 || path.isAbsolute(file) || file.includes('..')) {
    throw new Error(`unsafe policy manifest path: ${file}`);
  }
  return path.join(policyDir, file);
}

function buildPolicyManifest(policyDir, {
  files,
  authority = {},
  generatedAt,
  policyVersion,
} = {}) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('policy manifest needs a non-empty files list');
  }

  const version = readJson(path.join(policyDir, 'version.json'));
  const entries = files.map((file) => {
    const filePath = safePolicyPath(policyDir, file);
    const bytes = fs.readFileSync(filePath);
    return {
      path: file,
      sha256: sha256Bytes(bytes),
      bytes: bytes.length,
    };
  });

  return {
    schema_version: SCHEMA_VERSION,
    policy_version: policyVersion || version.version,
    generated_at: generatedAt || version.updated_at || '1970-01-01T00:00:00.000Z',
    authority: {
      repo: authority.repo || 'yieldos/yieldos',
      ref: authority.ref || 'main',
      path: authority.path || 'policy',
      integrity: authority.integrity || 'pinned-manifest-sha256',
    },
    files: entries,
    bundle_sha256: sha256Bytes(Buffer.from(JSON.stringify(entries.map((entry) => [entry.path, entry.sha256])))),
  };
}

function verifyPolicyBundle(policyDir, {
  files,
  expectedManifestSha256,
  manifestFile = MANIFEST_FILE,
  baseLabel = path.basename(policyDir),
} = {}) {
  const errors = [];
  const manifestPath = path.join(policyDir, manifestFile);
  const expectedManifestHash = normalizeSha256(expectedManifestSha256);

  if (!fs.existsSync(manifestPath)) {
    errors.push(`missing ${baseLabel}/${manifestFile}`);
    return { ok: false, errors, manifest: null, manifestSha256: null };
  }

  let manifestBody;
  let manifest;
  try {
    manifestBody = fs.readFileSync(manifestPath);
    manifest = JSON.parse(manifestBody.toString('utf8'));
  } catch (error) {
    errors.push(`${baseLabel}/${manifestFile} invalid JSON: ${error.message}`);
    return { ok: false, errors, manifest: null, manifestSha256: null };
  }

  const manifestSha256 = sha256Bytes(manifestBody);
  if (expectedManifestHash && manifestSha256 !== expectedManifestHash) {
    errors.push(`${baseLabel}/${manifestFile} sha256 does not match pinned manifest hash`);
  }

  if (manifest.schema_version !== SCHEMA_VERSION) {
    errors.push(`${baseLabel}/${manifestFile} schema_version must be ${SCHEMA_VERSION}`);
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    errors.push(`${baseLabel}/${manifestFile} files must be a non-empty array`);
    return { ok: errors.length === 0, errors, manifest, manifestSha256 };
  }

  const entries = new Map();
  for (const [index, entry] of manifest.files.entries()) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.push(`${baseLabel}/${manifestFile} files[${index}] must be an object`);
      continue;
    }
    if (typeof entry.path !== 'string' || entry.path.length === 0 || path.isAbsolute(entry.path) || entry.path.includes('..')) {
      errors.push(`${baseLabel}/${manifestFile} files[${index}].path is unsafe`);
      continue;
    }
    if (entries.has(entry.path)) {
      errors.push(`${baseLabel}/${manifestFile} duplicate file entry: ${entry.path}`);
      continue;
    }
    if (!/^sha256:[a-f0-9]{64}$/i.test(String(entry.sha256 || ''))) {
      errors.push(`${baseLabel}/${manifestFile} files[${index}].sha256 must be sha256:<64 hex>`);
      continue;
    }
    entries.set(entry.path, entry);
  }

  const expectedFiles = Array.isArray(files) ? files : [...entries.keys()];
  for (const file of expectedFiles) {
    if (!entries.has(file)) {
      errors.push(`${baseLabel}/${manifestFile} missing entry for ${file}`);
      continue;
    }
    const filePath = path.join(policyDir, file);
    if (!fs.existsSync(filePath)) {
      errors.push(`missing ${baseLabel}/${file}`);
      continue;
    }
    const bytes = fs.readFileSync(filePath);
    const actual = sha256Bytes(bytes);
    if (actual !== normalizeSha256(entries.get(file).sha256)) {
      errors.push(`${baseLabel}/${file} sha256 does not match manifest`);
    }
  }

  if (Array.isArray(files)) {
    const expectedSet = new Set(files);
    for (const file of entries.keys()) {
      if (!expectedSet.has(file)) {
        errors.push(`${baseLabel}/${manifestFile} contains unexpected entry: ${file}`);
      }
    }
  }

  return { ok: errors.length === 0, errors, manifest, manifestSha256 };
}

function readVerifiedPolicyBundle(policyDir, options = {}) {
  const verified = verifyPolicyBundle(policyDir, options);
  if (!verified.ok) return null;

  const policy = {};
  for (const file of options.files || verified.manifest.files.map((entry) => entry.path)) {
    try {
      policy[file] = readJson(path.join(policyDir, file));
    } catch (_) {
      return null;
    }
  }
  return { policy, manifest: verified.manifest, manifestSha256: verified.manifestSha256 };
}

module.exports = {
  MANIFEST_FILE,
  SCHEMA_VERSION,
  buildPolicyManifest,
  readVerifiedPolicyBundle,
  sha256Bytes,
  verifyPolicyBundle,
};
