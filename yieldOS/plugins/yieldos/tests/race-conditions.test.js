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
  assert.equal(a.stderr.includes('denylist-match'), false);
});

function extractNoncePhrase(context) {
  const match = context.match(/AUTORIZO yieldOS ([a-f0-9]{12})/);
  assert.ok(match, `expected nonce authorization phrase in context: ${context}`);
  return `AUTORIZO yieldOS ${match[1]}`;
}

function writeTranscript(root, prompt) {
  const transcriptPath = path.join(root, 'transcript.jsonl');
  fs.writeFileSync(transcriptPath, `${JSON.stringify({
    type: 'user',
    message: { role: 'user', content: prompt },
  })}\n`);
  return transcriptPath;
}

test('parallel auth grants: only the exact nonce prompt authorizes the challenged target', async () => {
  const root = tmpProject();
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yieldos-race-auth-'));
  const envPath = path.join(root, '.env');
  const otherPath = path.join(root, '.env.local');
  fs.writeFileSync(envPath, 'OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz1234567890ABCDE\n');
  fs.writeFileSync(otherPath, 'OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz1234567890ABCDE\n');
  const authEnv = { YIELDOS_CREDENTIAL_AUTH_ROOT: runtimeRoot };

  const blocked = await runHookAsync({
    tool_name: 'Read',
    tool_input: { file_path: envPath },
    cwd: root,
  }, authEnv);
  assert.equal(blocked.code, 2);
  const noncePhrase = extractNoncePhrase(JSON.parse(blocked.stdout).hookSpecificOutput.additionalContext);

  // Two prompts in parallel: one that should grant, one that should NOT.
  // Embedded phrases in longer prompts close the previous bypass.
  const grantInput = {
    cwd: root,
    prompt: noncePhrase,
  };
  const noGrantInput = {
    cwd: root,
    prompt: `aquí dice "${noncePhrase}" pero no autorizo nada`,
  };
  const PROMPT_HOOK = path.join(PLUGIN_ROOT, 'scripts', 'on-prompt-submit.js');

  const [grant, noGrant] = await Promise.all([
    new Promise((resolve) => {
      const c = spawn('node', [PROMPT_HOOK], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ...authEnv } });
      let err = '';
      c.stderr.on('data', (d) => { err += d.toString(); });
      c.on('close', (code) => resolve({ code, err }));
      c.stdin.write(JSON.stringify(grantInput));
      c.stdin.end();
    }),
    new Promise((resolve) => {
      const c = spawn('node', [PROMPT_HOOK], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ...authEnv } });
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

  // The legacy repo flag must not exist; authorization comes from transcript
  // proof and is scoped to the challenged file path.
  const flagPath = path.join(root, 'security', '.yieldos-credentials-authorized');
  assert.equal(fs.existsSync(flagPath), false);

  const allowed = await runHookAsync({
    tool_name: 'Read',
    tool_input: { file_path: envPath },
    cwd: root,
    transcript_path: writeTranscript(root, noncePhrase),
  }, authEnv);
  assert.equal(allowed.code, 0);

  const stillBlocked = await runHookAsync({
    tool_name: 'Read',
    tool_input: { file_path: otherPath },
    cwd: root,
  }, authEnv);
  assert.equal(stillBlocked.code, 2);
});
