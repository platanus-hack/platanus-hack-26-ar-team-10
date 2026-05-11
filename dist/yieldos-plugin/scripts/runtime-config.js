'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const CONFIG_FILE = path.join('.yieldos', 'config.json');
const MODES = ['monitor', 'standard', 'strict', 'enterprise'];
const MODE_RANK = Object.fromEntries(MODES.map((mode, index) => [mode, index]));

const DEFAULT_RUNTIME_CONFIG = Object.freeze({
  version: 1,
  mode: 'standard',
  locale: 'en',
  ui: Object.freeze({
    verbosity: 'normal',
    json: 'claude-only',
  }),
  gates: Object.freeze({
    dependencies: 'standard',
    skills: 'review-unlisted',
    mcps: 'review-unlisted-readonly',
    codeAudit: 'block-high',
    credentials: 'block-with-nonce',
  }),
  orgOverlay: null,
});

function resolveRuntimeConfig(projectRoot = process.cwd(), options = {}) {
  const env = options.env || process.env;
  const warnings = [];
  const root = path.resolve(projectRoot || process.cwd());
  let source = 'default';
  let config = cloneDefault();

  const configPath = path.join(root, CONFIG_FILE);
  if (fs.existsSync(configPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const validation = validateRuntimeConfig(parsed, { projectRoot: root });
      if (validation.ok) {
        config = mergeConfig(validation.config);
        source = 'repo';
      } else {
        warnings.push(...validation.errors);
        source = 'fallback';
      }
    } catch (err) {
      warnings.push(`invalid ${CONFIG_FILE}: ${err.message}`);
      source = 'fallback';
    }
  }

  const envMode = normalizeMode(env.YIELDOS_MODE || env.YIELDOS_STRICTNESS);
  if (envMode) {
    config.mode = envMode;
    source = 'env';
  } else if (env.YIELDOS_MODE || env.YIELDOS_STRICTNESS) {
    warnings.push(`unsupported mode from env: ${env.YIELDOS_MODE || env.YIELDOS_STRICTNESS}`);
  }

  if (config.orgOverlay && config.orgOverlay.minimumMode) {
    config.mode = maxMode(config.mode, config.orgOverlay.minimumMode);
  }

  return { config, source, warnings };
}

function validateRuntimeConfig(value, options = {}) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, errors: ['config must be an object'] };
  }
  if (value.version !== 1) errors.push(`unsupported config version: ${value.version}`);
  if (value.mode !== undefined && !normalizeMode(value.mode)) errors.push(`unsupported mode: ${value.mode}`);
  if (value.ui !== undefined && (!value.ui || typeof value.ui !== 'object' || Array.isArray(value.ui))) {
    errors.push('ui must be an object');
  }
  if (value.gates !== undefined && (!value.gates || typeof value.gates !== 'object' || Array.isArray(value.gates))) {
    errors.push('gates must be an object');
  }

  let overlay = null;
  if (value.orgOverlay !== undefined && value.orgOverlay !== null) {
    const overlayResult = resolveOrgOverlay(value.orgOverlay, options.projectRoot || process.cwd());
    if (overlayResult.ok) overlay = overlayResult.overlay;
    else errors.push(...overlayResult.errors);
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    errors: [],
    config: {
      ...value,
      mode: normalizeMode(value.mode || DEFAULT_RUNTIME_CONFIG.mode),
      orgOverlay: overlay,
    },
  };
}

function resolveOrgOverlay(value, projectRoot) {
  if (typeof value === 'string') return loadOrgOverlay(projectRoot, value);
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const validation = validateOrgOverlay(value);
    return validation.ok
      ? { ok: true, overlay: { ...validation.overlay, path: value.path || null } }
      : validation;
  }
  return { ok: false, errors: ['orgOverlay must be a path, object, or null'] };
}

function loadOrgOverlay(projectRoot, relativePath) {
  const root = path.resolve(projectRoot || process.cwd());
  const target = path.resolve(root, relativePath);
  if (!target.startsWith(`${root}${path.sep}`)) {
    return { ok: false, errors: ['orgOverlay path must stay inside the project'] };
  }
  try {
    assertNoSymlinkTraversal(root, target, 'orgOverlay path');
  } catch (err) {
    return { ok: false, errors: [err.message] };
  }
  try {
    const content = fs.readFileSync(target, 'utf8');
    const parsed = JSON.parse(content);
    const validation = validateOrgOverlay(parsed);
    if (!validation.ok) return validation;
    return {
      ok: true,
      overlay: {
        ...validation.overlay,
        path: relativePath,
        sha256: sha256(content),
      },
    };
  } catch (err) {
    return { ok: false, errors: [`orgOverlay could not be loaded: ${err.message}`] };
  }
}

function validateOrgOverlay(value) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, errors: ['orgOverlay must be an object'] };
  }
  if (value.version !== 1) errors.push(`unsupported orgOverlay version: ${value.version}`);
  if (value.kind !== 'yieldos.org-overlay') errors.push('orgOverlay kind must be yieldos.org-overlay');
  const minimumMode = normalizeMode(value.minimumMode || value.minimum_mode || 'enterprise');
  if (!minimumMode) errors.push(`unsupported orgOverlay minimumMode: ${value.minimumMode || value.minimum_mode}`);

  const requireProfiles = stringListField(value, 'requireProfiles', 'require_profiles', errors);
  const requirePlaybooks = stringListField(value, 'requirePlaybooks', 'require_playbooks', errors);
  const requireOracles = stringListField(value, 'requireOracles', 'require_oracles', errors);
  const disableSkills = stringListField(value, 'disableSkills', 'disable_skills', errors);
  const disableMcps = stringListField(value, 'disableMcps', 'disable_mcps', errors);
  const denyRules = objectListField(value, 'denyRules', 'deny_rules', errors);

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    errors: [],
    overlay: {
      kind: value.kind,
      version: value.version,
      minimumMode,
      requireProfiles,
      requirePlaybooks,
      requireOracles,
      disableSkills,
      disableMcps,
      denyRules,
    },
  };
}

function mergeConfig(config) {
  return {
    ...cloneDefault(),
    ...config,
    ui: { ...DEFAULT_RUNTIME_CONFIG.ui, ...(config.ui || {}) },
    gates: { ...DEFAULT_RUNTIME_CONFIG.gates, ...(config.gates || {}) },
  };
}

function cloneDefault() {
  return {
    ...DEFAULT_RUNTIME_CONFIG,
    ui: { ...DEFAULT_RUNTIME_CONFIG.ui },
    gates: { ...DEFAULT_RUNTIME_CONFIG.gates },
  };
}

function normalizeMode(value) {
  const mode = String(value || '').trim().toLowerCase();
  return MODES.includes(mode) ? mode : null;
}

function maxMode(left, right) {
  const a = normalizeMode(left) || DEFAULT_RUNTIME_CONFIG.mode;
  const b = normalizeMode(right) || DEFAULT_RUNTIME_CONFIG.mode;
  return MODE_RANK[b] > MODE_RANK[a] ? b : a;
}

function isAtLeastMode(mode, minimum) {
  return MODE_RANK[normalizeMode(mode) || DEFAULT_RUNTIME_CONFIG.mode] >= MODE_RANK[normalizeMode(minimum) || DEFAULT_RUNTIME_CONFIG.mode];
}

function stringListField(value, camelName, snakeName, errors) {
  const raw = value[camelName] !== undefined ? value[camelName] : value[snakeName];
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    errors.push(`orgOverlay ${camelName} must be an array`);
    return [];
  }
  if (raw.some((item) => typeof item !== 'string')) {
    errors.push(`orgOverlay ${camelName} must contain only strings`);
    return [];
  }
  return raw;
}

function objectListField(value, camelName, snakeName, errors) {
  const raw = value[camelName] !== undefined ? value[camelName] : value[snakeName];
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    errors.push(`orgOverlay ${camelName} must be an array`);
    return [];
  }
  if (raw.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) {
    errors.push(`orgOverlay ${camelName} must contain objects`);
    return [];
  }
  return raw;
}

function assertNoSymlinkTraversal(root, target, label) {
  const relative = path.relative(root, target);
  if (!relative) return;
  let current = root;
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) throw new Error(`${label} must not traverse a symlink`);
    } catch (err) {
      if (err.code === 'ENOENT') break;
      throw err;
    }
  }
}

function sha256(content) {
  return `sha256:${crypto.createHash('sha256').update(content).digest('hex')}`;
}

module.exports = {
  CONFIG_FILE,
  DEFAULT_RUNTIME_CONFIG,
  MODES,
  resolveRuntimeConfig,
  validateRuntimeConfig,
  validateOrgOverlay,
  normalizeMode,
  maxMode,
  isAtLeastMode,
};
