#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const policyManifest = require('../yieldOS/plugins/yieldos/scripts/policy-manifest');

function sha256Bytes(bytes) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function computeDecisionHash(policyDir, files) {
  const hashes = files
    .filter((file) => file !== 'version.json')
    .map((file) => {
      const bytes = fs.readFileSync(path.join(policyDir, file));
      return [file, sha256Bytes(bytes)];
    });
  return sha256Bytes(Buffer.from(JSON.stringify(hashes)));
}

function syncPolicyCache(policyDir, cacheDir, files) {
  fs.mkdirSync(cacheDir, { recursive: true });
  for (const file of files) {
    fs.copyFileSync(path.join(policyDir, file), path.join(cacheDir, file));
  }
}

function generatePolicyManifest({ repoRoot = REPO_ROOT } = {}) {
  const policyDir = path.join(repoRoot, 'policy');
  const cacheDir = path.join(repoRoot, 'yieldOS/plugins/yieldos/policy-cache');
  const defaultsPath = path.join(repoRoot, 'yieldOS/plugins/yieldos/config/defaults.json');
  const defaults = readJson(defaultsPath);
  const files = defaults.policy?.files;
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('defaults policy.files must be a non-empty array');
  }

  const versionPath = path.join(policyDir, 'version.json');
  const version = readJson(versionPath);
  version.hash = computeDecisionHash(policyDir, files);
  writeJson(versionPath, version);
  syncPolicyCache(policyDir, cacheDir, files);

  const manifest = policyManifest.buildPolicyManifest(policyDir, {
    files,
    authority: {
      repo: defaults.policy.repo,
      ref: defaults.policy.branch,
      path: defaults.policy.path,
      integrity: 'pinned-manifest-sha256',
    },
  });
  writeJson(path.join(policyDir, policyManifest.MANIFEST_FILE), manifest);
  writeJson(path.join(cacheDir, policyManifest.MANIFEST_FILE), manifest);

  const manifestSha256 = sha256Bytes(fs.readFileSync(path.join(policyDir, policyManifest.MANIFEST_FILE)));
  defaults.policy.manifest_file = policyManifest.MANIFEST_FILE;
  defaults.policy.manifest_sha256 = manifestSha256;
  defaults.policy.integrity = 'pinned-manifest-sha256';
  writeJson(defaultsPath, defaults);

  return {
    manifestSha256,
    policyVersion: manifest.policy_version,
    files: files.length,
  };
}

function main() {
  try {
    const result = generatePolicyManifest();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`generate-policy-manifest: ${error.message}\n`);
    process.exit(2);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export {
  generatePolicyManifest,
};
