#!/usr/bin/env node
'use strict';

// PostToolUse trigger: relaunch the adversarial pentest loop in the
// background when the agent performs an action that materially impacts
// the project. "Impactful" = a write/edit to a project file, or a Bash
// command that adds/installs/initializes new code (npm add, pip install,
// cargo add, etc.). Read-only or analysis tool calls do NOT trigger.
//
// The launch is idempotent (auto-launcher uses a PID lock), so calling
// this on every Edit is cheap. Convergence still happens via the loop's
// own --converge flag.

const fs = require('node:fs');
const path = require('node:path');

const autoLauncher = require('./code-audit/pentest-loop/auto-launcher');

const ADD_LIKE_RE = /\b(?:npm\s+(?:install|i|add|ci)\b|yarn\s+(?:install|add)\b|pnpm\s+(?:install|add|i)\b|bun\s+(?:install|add|i)\b|pip\s+install\b|pip3\s+install\b|poetry\s+add\b|uv\s+(?:add|pip\s+install)\b|cargo\s+(?:add|install)\b|go\s+(?:get|install)\b|gem\s+install\b|composer\s+(?:install|require)\b|deno\s+add\b|brew\s+install\b|apt(?:-get)?\s+install\b)/;

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

function shouldTrigger(input) {
  const tool = input.tool_name;
  if (tool === 'Write' || tool === 'Edit' || tool === 'NotebookEdit') return true;
  if (tool === 'Bash') {
    const cmd = (input.tool_input && input.tool_input.command) || '';
    return ADD_LIKE_RE.test(cmd);
  }
  return false;
}

function main(opts = {}) {
  const env = opts.env || process.env;
  const launcher = opts.launcher || autoLauncher;
  if (env.YIELDOS_PENTEST === 'off') return { status: 'disabled' };

  const raw = readStdinSync();
  const input = parseInput(raw);
  if (!shouldTrigger(input)) return { status: 'ignored' };

  const projectRoot = projectCwd(input);
  try {
    const r = launcher.launch(projectRoot, { maxRounds: 50, convergenceClean: 5 });
    if (r && r.status === 'launched') {
      process.stderr.write(`[yieldOS:impact-trigger] pentest loop relaunched (pid=${r.pid})\n`);
    }
    return r || { status: 'unknown' };
  } catch (err) {
    process.stderr.write(`[yieldOS:impact-trigger] ${err.message}\n`);
    return { status: 'failed', reason: err.message };
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  shouldTrigger,
  main,
};
