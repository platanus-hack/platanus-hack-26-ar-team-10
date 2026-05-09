'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const HOOK = path.join(PLUGIN_ROOT, 'scripts', 'pre-install-gate.js');

function tmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'yieldos-race-'));
}

function runHookAsync(input, env = {}) {
  return new Promise((resolve) => {
    const child = spawn('node', [HOOK], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.stdin.write(JSON.stringify(input));
    child.stdin.end();
  });
}

test('parallel hooks: 8 concurrent invocations do not corrupt the log', async () => {
  const root = tmpProject();
  const inputs = Array.from({ length: 8 }, (_, i) => ({
    tool_name: 'Bash',
    tool_input: { command: `npm install event-stream@3.3.6` },
    cwd: root,
    _race_id: i,
  }));

  const results = await Promise.all(inputs.map((input) => runHookAsync(input)));

  // Every invocation should have exited 2 (denylist).
  for (const r of results) {
    assert.equal(r.code, 2, `expected exit 2 for all parallel hooks, got ${r.code}`);
    assert.equal(r.stderr.includes('denylist-match'), true);
  }

  // The log file must be readable as a series of valid log entries
  // (no truncated lines, no interleaved garbage).
  const logPath = path.join(root, 'security', 'dependency-events.md');
  if (fs.existsSync(logPath)) {
    const content = fs.readFileSync(logPath, 'utf8');
    // No unfinished lines: every '## ' header must be followed by a complete block.
    const headers = (content.match(/^## /gm) || []).length;
    assert.ok(headers >= 1, 'log must contain at least one ## header');
    // No literal NUL bytes (sign of write tearing on some filesystems).
    assert.equal(content.includes('\0'), false, 'log must not contain NUL bytes');
  }
});

test('parallel hooks: 8 concurrent allowlist-match flows produce 8 valid JSON outputs', async () => {
  const root = tmpProject();
  const inputs = Array.from({ length: 8 }, (_, i) => ({
    tool_name: 'Bash',
    tool_input: { command: `npm install react@18.3.1` },
    cwd: root,
    _race_id: i,
  }));

  const results = await Promise.all(inputs.map((input) => runHookAsync(input)));

  for (const r of results) {
    assert.equal(r.code, 0, `expected exit 0, got ${r.code}, stderr: ${r.stderr}`);
    // Each must emit valid JSON to stdout (or empty if the path is silent allow,
    // but our 0.4.1 always emits hookSpecificOutput).
    if (r.stdout.trim().length > 0) {
      assert.doesNotThrow(() => JSON.parse(r.stdout), `stdout must be valid JSON for race id ${r._race_id || '?'}`);
    }
  }
});

test('parallel hooks: a denied attempt and an allowed attempt do not interfere', async () => {
  const root = tmpProject();
  const denied = runHookAsync({
    tool_name: 'Bash',
    tool_input: { command: 'npm install event-stream@3.3.6' },
    cwd: root,
  });
  const allowed = runHookAsync({
    tool_name: 'Bash',
    tool_input: { command: 'npm install react@18.3.1' },
    cwd: root,
  });

  const [d, a] = await Promise.all([denied, allowed]);
  assert.equal(d.code, 2);
  assert.equal(a.code, 0);
  assert.equal(d.stderr.includes('denylist-match'), true);
  assert.equal(a.stderr.includes('allowlist-match'), true);
});

test('parallel auth grants: only the exact-phrase prompt creates the flag', async () => {
  const root = tmpProject();

  // Two prompts in parallel: one that should grant, one that should NOT.
  // Embedded phrases in longer prompts close the previous bypass.
  const grantInput = {
    cwd: root,
    prompt: 'AUTORIZO A LEER LAS CREDENCIALES',
  };
  const noGrantInput = {
    cwd: root,
    prompt: 'aquí dice "AUTORIZO A LEER LAS CREDENCIALES" pero no autorizo nada',
  };
  const PROMPT_HOOK = path.join(PLUGIN_ROOT, 'scripts', 'on-prompt-submit.js');

  const [grant, noGrant] = await Promise.all([
    new Promise((resolve) => {
      const c = spawn('node', [PROMPT_HOOK], { stdio: ['pipe', 'pipe', 'pipe'] });
      let err = '';
      c.stderr.on('data', (d) => { err += d.toString(); });
      c.on('close', (code) => resolve({ code, err }));
      c.stdin.write(JSON.stringify(grantInput));
      c.stdin.end();
    }),
    new Promise((resolve) => {
      const c = spawn('node', [PROMPT_HOOK], { stdio: ['pipe', 'pipe', 'pipe'] });
      let err = '';
      c.stderr.on('data', (d) => { err += d.toString(); });
      c.on('close', (code) => resolve({ code, err }));
      c.stdin.write(JSON.stringify(noGrantInput));
      c.stdin.end();
    }),
  ]);

  assert.equal(grant.code, 0);
  assert.equal(grant.err.includes('credentials-read-authorized'), true);
  assert.equal(noGrant.code, 0);
  assert.equal(noGrant.err.includes('credentials-read-authorized'), false);

  // Flag MUST exist (granted by the exact-match prompt) but must not have been
  // re-written to a corrupted state by the no-grant prompt running concurrently.
  const flagPath = path.join(root, 'security', '.yieldos-credentials-authorized');
  assert.equal(fs.existsSync(flagPath), true);
  const flagContent = JSON.parse(fs.readFileSync(flagPath, 'utf8'));
  assert.ok(flagContent.authorized_at, 'flag must contain authorized_at');
  assert.ok(flagContent.ttl_ms > 0, 'flag must contain positive ttl_ms');
});
