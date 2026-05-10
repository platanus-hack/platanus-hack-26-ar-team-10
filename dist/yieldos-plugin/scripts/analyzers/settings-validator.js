'use strict';

const fs = require('node:fs');
const path = require('node:path');

function readNpmrc(filepath) {
  if (!fs.existsSync(filepath)) return {};
  const out = {};
  const raw = fs.readFileSync(filepath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

function writeNpmrc(filepath, settings) {
  const existing = readNpmrc(filepath);
  const merged = { ...existing, ...settings };
  const lines = Object.entries(merged).map(([k, v]) => `${k}=${v}`);
  fs.writeFileSync(filepath, lines.join('\n') + '\n');
}

function validateAndFix(projectRoot, manager, requiredSettings) {
  const cfg = (requiredSettings.managers || {})[manager];
  if (!cfg) return { ok: true, manager, missing: [], applied: [] };

  const filepath = path.join(projectRoot, cfg.config_file);
  const before = readNpmrc(filepath);
  const missing = [];
  const applied = [];
  const targetSettings = { ...before };
  for (const [k, v] of Object.entries(cfg.settings || {})) {
    if (before[k] !== v) {
      missing.push(`${k}=${v}`);
      targetSettings[k] = v;
      applied.push(`${k}=${v}`);
    }
  }
  if (missing.length > 0) {
    writeNpmrc(filepath, targetSettings);
  }
  return { ok: missing.length === 0, manager, missing, applied, file: cfg.config_file };
}

module.exports = { validateAndFix, readNpmrc, writeNpmrc };
