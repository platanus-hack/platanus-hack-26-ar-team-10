#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const policyFetcher = require('./policy-fetcher');
const transitiveAuditor = require('./transitive-auditor');
const logger = require('./logger');
const classifiers = require('./classifiers');
const ui = require('./ui');

const DEFAULTS = require(path.join(__dirname, '..', 'config', 'defaults.json'));

function readStdinSync() {
  try { return fs.readFileSync(0, 'utf8'); }
  catch (_) { return ''; }
}

function parseInput(raw) {
  if (!raw) return {};
  try { return JSON.parse(raw); }
  catch (_) { return {}; }
}

function projectCwd(input) {
  return input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

function detectChangedManifests(projectRoot) {
  try {
    const out = execSync('git status --porcelain', { cwd: projectRoot, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    const lines = out.split(/\r?\n/).filter(Boolean);
    return lines
      .map((l) => l.slice(3))
      .filter((p) => /(?:package(?:-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb|requirements.*\.txt|Pipfile\.lock|poetry\.lock|uv\.lock|Cargo\.lock|go\.sum)$/.test(p));
  } catch (_) {
    return [];
  }
}

async function main() {
  const raw = readStdinSync();
  const input = parseInput(raw);
  const projectRoot = projectCwd(input);
  const tool = input.tool_name;
  const ti = input.tool_input || {};
  if (tool !== 'Bash') process.exit(0);

  const command = ti.command || '';
  const candidates = classifiers.classifyBashCommand(command);
  if (candidates.length === 0) process.exit(0);

  const changed = detectChangedManifests(projectRoot);
  if (changed.length === 0) process.exit(0);

  let policy = {};
  try {
    const r = await policyFetcher.getPolicy({});
    policy = r.policy || {};
  } catch (_) { /* ignore */ }

  for (const candidate of candidates) {
    try {
      const audit = await transitiveAuditor.audit(projectRoot, candidate, policy, {
        minAgeDays: DEFAULTS.audit.transitive_min_age_days,
        osv: true,
        ttlSeconds: DEFAULTS.audit.osv_cache_ttl_seconds,
      });
      logger.logTransitiveAudit(projectRoot, candidate, audit);

      if (audit.cves && audit.cves.length > 0) {
        for (const c of audit.cves) {
          ui.writeMessage(`CVE detectado en transitiva: ${c}`, { action: 'block' });
        }
      }
      if (audit.denylisted && audit.denylisted.length > 0) {
        for (const d of audit.denylisted) {
          ui.writeMessage(`Transitiva denylisted: ${d} (considerar rollback)`, { action: 'block' });
        }
      }
    } catch (err) {
      ui.writeMessage(`post-install audit error: ${err.message}`);
    }
  }

  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`[yieldOS:fatal] ${err.message}\n`);
  process.exit(0);
});
