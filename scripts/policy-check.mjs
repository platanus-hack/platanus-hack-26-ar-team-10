#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

  validateEntryList('allowlist.json', policies['allowlist.json'], errors, { prefixes: ['npm:', 'python:', 'cargo:', 'go:'] });
  validateEntryList('denylist.json', policies['denylist.json'], errors, { prefixes: ['npm:', 'python:', 'cargo:', 'go:'] });
  validateEntryList('build-scripts-allowed.json', policies['build-scripts-allowed.json'], errors, { prefixes: ['npm:', 'python:', 'cargo:', 'go:'] });
  validateCategories(policies['categories.json'], errors);
  validateNativeEquivalents(policies['native-equivalents.json'], errors);
  validateInjectionPatterns(policies['injection-patterns.json'], errors);
  validateRequiredSettings(policies['required-settings.json'], errors);
  validateVersion(policies['version.json'], errors);
  validateSkills(policies['skills.json'], errors);
  validateMcps(policies['mcps.json'], errors);

  return errors;
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
  for (const field of ['updated_at', 'hash']) {
    if (policy[field] !== undefined && typeof policy[field] !== 'string') {
      errors.push(`version.json ${field} must be a string`);
    }
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
