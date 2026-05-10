#!/usr/bin/env node
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const policyManifest = require('../yieldOS/plugins/yieldos/scripts/policy-manifest');

const POLICY_FILES = [
  'allowlist.json',
  'denylist.json',
  'categories.json',
  'native-equivalents.json',
  'skills.json',
  'mcps.json',
  'injection-patterns.json',
  'build-scripts-allowed.json',
  'required-settings.json',
  'version.json',
];

function readJson(filePath, errors) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    errors.push(`${display(filePath)} invalid JSON: ${error.message}`);
    return null;
  }
}

function validatePolicyRoot(repoRoot = REPO_ROOT) {
  const errors = [];
  const policyDir = path.join(repoRoot, 'policy');
  const cacheDir = path.join(repoRoot, 'yieldOS/plugins/yieldos/policy-cache');
  const policies = {};

  for (const file of POLICY_FILES) {
    const policyPath = path.join(policyDir, file);
    const cachePath = path.join(cacheDir, file);
    if (!fs.existsSync(policyPath)) {
      errors.push(`missing policy/${file}`);
      continue;
    }
    if (!fs.existsSync(cachePath)) {
      errors.push(`missing policy-cache/${file}`);
      continue;
    }

    policies[file] = readJson(policyPath, errors);
    const cache = readJson(cachePath, errors);
    if (policies[file] && cache && canonical(policies[file]) !== canonical(cache)) {
      errors.push(`policy-cache/${file} differs from policy/${file}`);
    }
  }
  validatePolicyManifest(repoRoot, errors);

  validateEntryList('allowlist.json', policies['allowlist.json'], errors, { prefixes: ['npm:', 'python:', 'cargo:', 'go:'] });
  validateEntryList('denylist.json', policies['denylist.json'], errors, { prefixes: ['npm:', 'python:', 'cargo:', 'go:'] });
  validateEntryList('build-scripts-allowed.json', policies['build-scripts-allowed.json'], errors, { prefixes: ['npm:', 'python:', 'cargo:', 'go:'] });
  validateAllowlist(policies['allowlist.json'], errors);
  validateDenylist(policies['denylist.json'], errors);
  validatePolicyConflicts(policies, errors);
  validateCategories(policies['categories.json'], errors);
  validateNativeEquivalents(policies['native-equivalents.json'], errors);
  validateInjectionPatterns(policies['injection-patterns.json'], errors);
  validateRequiredSettings(policies['required-settings.json'], errors);
  validateVersion(policies['version.json'], errors);
  validateSkills(policies['skills.json'], errors);
  validateMcps(policies['mcps.json'], errors);

  return errors;
}

function validatePolicyManifest(repoRoot, errors) {
  const defaultsPath = path.join(repoRoot, 'yieldOS/plugins/yieldos/config/defaults.json');
  const defaults = readJson(defaultsPath, errors);
  const manifestFile = defaults?.policy?.manifest_file || policyManifest.MANIFEST_FILE;
  const expectedHash = defaults?.policy?.manifest_sha256;

  if (manifestFile !== policyManifest.MANIFEST_FILE) {
    errors.push('defaults policy.manifest_file must be manifest.json');
  }
  if (!/^sha256:[a-f0-9]{64}$/i.test(String(expectedHash || ''))) {
    errors.push('defaults policy.manifest_sha256 must be sha256:<64 hex>');
  }
  if (defaults?.policy?.integrity !== 'pinned-manifest-sha256') {
    errors.push('defaults policy.integrity must be pinned-manifest-sha256');
  }

  const policyDir = path.join(repoRoot, 'policy');
  const cacheDir = path.join(repoRoot, 'yieldOS/plugins/yieldos/policy-cache');
  const policyVerification = policyManifest.verifyPolicyBundle(policyDir, {
    files: POLICY_FILES,
    expectedManifestSha256: expectedHash,
    manifestFile,
    baseLabel: 'policy',
  });
  errors.push(...policyVerification.errors);

  const cacheVerification = policyManifest.verifyPolicyBundle(cacheDir, {
    files: POLICY_FILES,
    expectedManifestSha256: expectedHash,
    manifestFile,
    baseLabel: 'policy-cache',
  });
  errors.push(...cacheVerification.errors);

  if (policyVerification.manifestSha256 && expectedHash && policyVerification.manifestSha256 !== expectedHash) {
    errors.push('defaults policy.manifest_sha256 does not match policy/manifest.json');
  }
  if (policyVerification.manifest && cacheVerification.manifest && canonical(policyVerification.manifest) !== canonical(cacheVerification.manifest)) {
    errors.push('policy-cache/manifest.json differs from policy/manifest.json');
  }
}

function validateEntryList(file, policy, errors, { prefixes }) {
  if (!policy) return;
  if (!Array.isArray(policy.entries)) {
    errors.push(`${file} entries must be an array`);
    return;
  }
  for (const [index, entry] of policy.entries.entries()) {
    if (!entry || typeof entry.key !== 'string') {
      errors.push(`${file} entries[${index}].key must be a string`);
      continue;
    }
    if (!prefixes.some((prefix) => entry.key.startsWith(prefix))) {
      errors.push(`${file} entries[${index}].key has unsupported prefix: ${entry.key}`);
    }
  }
}

function validateAllowlist(policy, errors) {
  if (!policy || !Array.isArray(policy.entries)) return;
  for (const [index, entry] of policy.entries.entries()) {
    if (!entry || typeof entry.key !== 'string') continue;
    if (entry.decision !== 'allow') {
      errors.push(`allowlist.json entries[${index}].decision must be allow`);
    }
    if (!entry.category) errors.push(`allowlist.json entries[${index}].category is required`);
    if (!entry.reviewed_by) errors.push(`allowlist.json entries[${index}].reviewed_by is required`);
    if (!isDateString(entry.reviewed_at)) errors.push(`allowlist.json entries[${index}].reviewed_at must be YYYY-MM-DD`);
    if (!entry.rationale) errors.push(`allowlist.json entries[${index}].rationale is required`);
    if (isNameOnlyPackageKey(entry.key) && entry.allow_any_version !== true) {
      errors.push(`allowlist.json entries[${index}] name-only entry requires allow_any_version: true`);
    }
    if (!isNameOnlyPackageKey(entry.key) && entry.allow_any_version === true) {
      errors.push(`allowlist.json entries[${index}] pinned entry must not set allow_any_version: true`);
    }
    if (entry.allow_any_version === true && !entry.rationale) {
      errors.push(`allowlist.json entries[${index}] allow_any_version requires rationale`);
    }
    validateStringArray('allowlist.json', index, entry, 'source_urls', errors, { optional: true });
  }
}

function validateDenylist(policy, errors) {
  if (!policy || !Array.isArray(policy.entries)) return;
  const severities = new Set(['critical', 'high', 'medium', 'low']);
  for (const [index, entry] of policy.entries.entries()) {
    if (!entry || typeof entry.key !== 'string') continue;
    if (entry.decision !== 'deny') {
      errors.push(`denylist.json entries[${index}].decision must be deny`);
    }
    if (!entry.reason) errors.push(`denylist.json entries[${index}].reason is required`);
    if (!severities.has(entry.severity)) {
      errors.push(`denylist.json entries[${index}].severity must be critical, high, medium, or low`);
    }
    if (!entry.reviewed_by) errors.push(`denylist.json entries[${index}].reviewed_by is required`);
    if (!isDateString(entry.reviewed_at)) errors.push(`denylist.json entries[${index}].reviewed_at must be YYYY-MM-DD`);
    validateStringArray('denylist.json', index, entry, 'source_urls', errors, { optional: false });
  }
}

function validatePolicyConflicts(policies, errors) {
  const allowEntries = policies['allowlist.json']?.entries || [];
  const denyEntries = policies['denylist.json']?.entries || [];
  const allowExact = new Map();
  const denyExact = new Map();
  const allowNames = new Map();
  const denyNames = new Map();

  collectPackageKeys(allowEntries, allowExact, allowNames);
  collectPackageKeys(denyEntries, denyExact, denyNames);

  for (const key of allowExact.keys()) {
    if (denyExact.has(key)) {
      errors.push(`allowlist.json and denylist.json both contain ${key}`);
    }
  }
  for (const [key, name] of allowExact.entries()) {
    if (denyNames.has(name)) {
      errors.push(`allowlist.json ${key} conflicts with denylist name entry ${name}`);
    }
  }
  for (const [key, name] of denyExact.entries()) {
    if (allowNames.has(name)) {
      errors.push(`denylist.json ${key} conflicts with allowlist name entry ${name}`);
    }
  }
}

function collectPackageKeys(entries, exact, names) {
  for (const entry of entries) {
    if (!entry || typeof entry.key !== 'string') continue;
    const key = normalizePackageKey(entry.key);
    if (!key) continue;
    const name = packageNameKey(key);
    exact.set(key, name);
    if (isNameOnlyPackageKey(key)) names.set(name, key);
  }
}

function isNameOnlyPackageKey(key) {
  const parsed = parsePackageKey(key);
  return parsed ? parsed.version === null : false;
}

function packageNameKey(key) {
  const parsed = parsePackageKey(key);
  return parsed ? `${parsed.ecosystem}:${parsed.name}` : key;
}

function normalizePackageKey(key) {
  const parsed = parsePackageKey(key);
  if (!parsed) return null;
  return parsed.version === null
    ? `${parsed.ecosystem}:${parsed.name}`
    : `${parsed.ecosystem}:${parsed.name}${parsed.delimiter}${parsed.version}`;
}

function parsePackageKey(key) {
  const match = String(key).match(/^([a-z]+):(.+)$/);
  if (!match) return null;
  const ecosystem = match[1];
  const body = match[2];
  if (ecosystem === 'python') {
    const index = body.indexOf('==');
    return index === -1
      ? { ecosystem, name: body, delimiter: '==', version: null }
      : { ecosystem, name: body.slice(0, index), delimiter: '==', version: body.slice(index + 2) };
  }
  const index = body.lastIndexOf('@');
  return index <= 0
    ? { ecosystem, name: body, delimiter: '@', version: null }
    : { ecosystem, name: body.slice(0, index), delimiter: '@', version: body.slice(index + 1) };
}

function validateStringArray(file, index, entry, field, errors, { optional }) {
  if (entry[field] === undefined && optional) return;
  if (!Array.isArray(entry[field]) || entry[field].some((value) => typeof value !== 'string' || value.length === 0)) {
    errors.push(`${file} entries[${index}].${field} must be an array of strings`);
    return;
  }
  if (!optional && entry[field].length === 0) {
    errors.push(`${file} entries[${index}].${field} must include at least one entry`);
  }
}

function isDateString(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function validateSkills(policy, errors) {
  if (!policy) return;
  if (policy.rules?.default_unlisted !== 'block') {
    errors.push('skills.json rules.default_unlisted must be block');
  }
  validateEntryList('skills.json', policy, errors, { prefixes: ['skill:'] });
  for (const [index, entry] of (policy.entries || []).entries()) {
    for (const field of ['category', 'vendor', 'purpose']) {
      if (!entry[field]) errors.push(`skills.json entries[${index}].${field} is required`);
    }
  }
}

function validateMcps(policy, errors) {
  if (!policy) return;
  if (policy.rules?.default_unlisted !== 'block') {
    errors.push('mcps.json rules.default_unlisted must be block');
  }
  if (policy.rules?.validate_tool_surface_at_registration !== true) {
    errors.push('mcps.json rules.validate_tool_surface_at_registration must be true');
  }
  validateEntryList('mcps.json', policy, errors, { prefixes: ['mcp:'] });
  for (const [index, entry] of (policy.entries || []).entries()) {
    for (const field of ['vendor', 'purpose', 'scope']) {
      if (!entry[field]) errors.push(`mcps.json entries[${index}].${field} is required`);
    }
    if (!Array.isArray(entry.approved_tools)) errors.push(`mcps.json entries[${index}].approved_tools must be an array`);
    if (!Array.isArray(entry.denied_tools)) errors.push(`mcps.json entries[${index}].denied_tools must be an array`);
    const approved = new Set(entry.approved_tools || []);
    const overlap = (entry.denied_tools || []).filter((tool) => approved.has(tool));
    if (overlap.length > 0) {
      errors.push(`mcps.json entries[${index}] approved and denied tools overlap: ${overlap.join(', ')}`);
    }
  }
}

function validateCategories(policy, errors) {
  if (!policy) return;
  for (const key of ['A_safe_to_rewrite', 'B_rewrite_with_care', 'C_dangerous_to_rewrite', 'D_never_rewrite']) {
    if (policy[key] !== undefined && !Array.isArray(policy[key])) {
      errors.push(`categories.json ${key} must be an array`);
    }
  }
  const keywords = policy.category_keywords_for_unlisted;
  if (keywords !== undefined) {
    if (!keywords || typeof keywords !== 'object' || Array.isArray(keywords)) {
      errors.push('categories.json category_keywords_for_unlisted must be an object');
      return;
    }
    for (const [key, values] of Object.entries(keywords)) {
      if (!Array.isArray(values) || values.some((value) => typeof value !== 'string')) {
        errors.push(`categories.json category_keywords_for_unlisted.${key} must be an array of strings`);
      }
    }
  }
}

function validateNativeEquivalents(policy, errors) {
  if (!policy) return;
  const entries = policy.entries;
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) {
    errors.push('native-equivalents.json entries must be an object');
    return;
  }
  for (const [key, entry] of Object.entries(entries)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.push(`native-equivalents.json entries.${key} must be an object`);
      continue;
    }
    for (const field of ['native', 'platform']) {
      if (typeof entry[field] !== 'string' || entry[field].length === 0) {
        errors.push(`native-equivalents.json entries.${key}.${field} must be a string`);
      }
    }
  }
}

function validateInjectionPatterns(policy, errors) {
  if (!policy) return;
  if (!Array.isArray(policy.patterns) || policy.patterns.length === 0) {
    errors.push('injection-patterns.json patterns must be a non-empty array');
    return;
  }
  const severities = new Set(['critical', 'high', 'medium', 'low']);
  for (const [index, pattern] of policy.patterns.entries()) {
    if (!pattern || typeof pattern !== 'object' || Array.isArray(pattern)) {
      errors.push(`injection-patterns.json patterns[${index}] must be an object`);
      continue;
    }
    if (typeof pattern.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(pattern.id)) {
      errors.push(`injection-patterns.json patterns[${index}].id must be a kebab-case string`);
    }
    if (typeof pattern.regex !== 'string' || pattern.regex.length === 0) {
      errors.push(`injection-patterns.json patterns[${index}].regex must be a string`);
    } else {
      try {
        compilePolicyRegex(pattern.regex);
      } catch (err) {
        errors.push(`injection-patterns.json patterns[${index}].regex is invalid: ${err.message}`);
      }
    }
    if (!severities.has(pattern.severity)) {
      errors.push(`injection-patterns.json patterns[${index}].severity must be critical, high, medium, or low`);
    }
  }
}

function validateRequiredSettings(policy, errors) {
  if (!policy) return;
  const managers = policy.managers;
  if (!managers || typeof managers !== 'object' || Array.isArray(managers)) {
    errors.push('required-settings.json managers must be an object');
    return;
  }
  for (const [manager, config] of Object.entries(managers)) {
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      errors.push(`required-settings.json managers.${manager} must be an object`);
      continue;
    }
    if (typeof config.config_file !== 'string' || config.config_file.length === 0) {
      errors.push(`required-settings.json managers.${manager}.config_file must be a string`);
    }
    if (!config.settings || typeof config.settings !== 'object' || Array.isArray(config.settings)) {
      errors.push(`required-settings.json managers.${manager}.settings must be an object`);
    }
    if (config.settings_alt_files !== undefined && !Array.isArray(config.settings_alt_files)) {
      errors.push(`required-settings.json managers.${manager}.settings_alt_files must be an array`);
    }
  }
}

function validateVersion(policy, errors) {
  if (!policy) return;
  if (typeof policy.version !== 'string' || policy.version.length === 0) {
    errors.push('version.json version must be a string');
  }
  if (policy.updated_at !== undefined && typeof policy.updated_at !== 'string') {
    errors.push('version.json updated_at must be a string');
  }
  if (typeof policy.hash !== 'string' || !/^sha256:[a-f0-9]{64}$/i.test(policy.hash)) {
    errors.push('version.json hash must be sha256:<64 hex>');
  }
}

function compilePolicyRegex(value) {
  const match = String(value).match(/^\(\?([imsux]+)\)(.*)$/);
  if (!match) return new RegExp(value);
  return new RegExp(match[2], match[1].replace(/[sx]/g, ''));
}

function canonical(value) {
  return JSON.stringify(sortValue(value));
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((out, key) => {
    out[key] = sortValue(value[key]);
    return out;
  }, {});
}

function display(filePath) {
  return path.relative(REPO_ROOT, filePath) || filePath;
}

function main() {
  const errors = validatePolicyRoot(REPO_ROOT);
  if (errors.length > 0) {
    for (const error of errors) process.stderr.write(`policy-check: ${error}\n`);
    process.exit(1);
  }
  process.stdout.write('policy structure OK\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export {
  validatePolicyRoot,
};
