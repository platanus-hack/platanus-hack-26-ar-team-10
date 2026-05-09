'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const PRE_TOOL_HOOK = path.join(PLUGIN_ROOT, 'scripts', 'pre-install-gate.js');
const PROMPT_HOOK = path.join(PLUGIN_ROOT, 'scripts', 'on-prompt-submit.js');
const AUTH_PHRASE = 'AUTORIZO A LEER LAS CREDENCIALES';

function tmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'yieldos-credentials-'));
}

function runHook(scriptPath, input) {
  const result = spawnSync('node', [scriptPath], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    timeout: 10000,
  });
  return {
    code: result.status,
    stderr: result.stderr || '',
    stdout: result.stdout || '',
  };
}

function parseStdout(result) {
  assert.notEqual(result.stdout, '', `expected JSON on stdout, stderr: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

test('UserPromptSubmit detects credentials, never echoes the raw value, and emits a directive (no decision:block to avoid harness leak)', () => {
  const root = tmpProject();
  const key = 'sk-proj-abcdefghijklmnopqrstuvwxyz1234567890ABCDE';
  const result = runHook(PROMPT_HOOK, {
    cwd: root,
    prompt: `please use ${key} for this request`,
  });

  // 0.3.4: prompt is allowed to pass (exit 0) with a CRITICAL SECURITY DIRECTIVE
  // injected via additionalContext. We deliberately stopped using decision:"block"
  // because the harness re-prints the original prompt under "Original prompt:".
  assert.equal(result.code, 0);
  assert.equal(result.stderr.includes('[yieldOS:verdict] prompt-credentials-detected'), true);
  assert.equal(result.stdout.includes(key), false);

  const parsed = parseStdout(result);
  assert.equal('decision' in parsed, false, 'must NOT use decision:block (would leak via Original prompt:)');
  const context = parsed.hookSpecificOutput.additionalContext;
  assert.match(context, /CRITICAL SECURITY DIRECTIVE/);
  assert.match(context, /Do NOT echo/i);
  assert.match(context, /```diff/);
  assert.match(context, /CREDENCIAL DETECTADA/);
  // The actual openai-project-key pattern id must surface so the agent knows what fired.
  assert.match(context, /openai/);
});

test('credentials authorization phrase grants the read window', () => {
  const root = tmpProject();

  // The current implementation uses includes() — any prompt containing the
  // phrase grants authorization. Tighten to exact-match later if needed.
  const accepted = runHook(PROMPT_HOOK, {
    cwd: root,
    prompt: AUTH_PHRASE,
  });
  assert.equal(accepted.code, 0);
  assert.equal(accepted.stderr.includes('[yieldOS:verdict] credentials-read-authorized'), true);
  assert.equal(fs.existsSync(path.join(root, 'security', '.yieldos-credentials-authorized')), true);
});

test('PreToolUse blocks Read of .env without credentials authorization', () => {
  const root = tmpProject();
  const envPath = path.join(root, '.env');
  fs.writeFileSync(envPath, 'OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz1234567890ABCDE\n');

  const result = runHook(PRE_TOOL_HOOK, {
    cwd: root,
    tool_name: 'Read',
    tool_input: { file_path: envPath },
  });

  assert.equal(result.code, 2);
  assert.equal(result.stderr.includes('[yieldOS:verdict] credentials-read-blocked'), true);

  const parsed = parseStdout(result);
  const context = parsed.hookSpecificOutput.additionalContext;
  assert.match(context, /```diff/);
  assert.match(context, /LECTURA DE CREDENCIALES BLOQUEADA/);
  assert.match(context, /AUTORIZO A LEER LAS CREDENCIALES/);
  assert.match(context, /Bloqueado · lectura de credenciales sin autorización/);
});

test('PreToolUse allows Read of .env while credentials authorization is active', () => {
  const root = tmpProject();
  const envPath = path.join(root, '.env.local');
  const securityDir = path.join(root, 'security');
  fs.mkdirSync(securityDir, { recursive: true });
  fs.writeFileSync(envPath, 'OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz1234567890ABCDE\n');
  fs.writeFileSync(path.join(securityDir, '.yieldos-credentials-authorized'), JSON.stringify({
    authorized_at: new Date().toISOString(),
    ttl_ms: 30 * 60 * 1000,
  }));

  const result = runHook(PRE_TOOL_HOOK, {
    cwd: root,
    tool_name: 'Read',
    tool_input: { file_path: envPath },
  });

  assert.equal(result.code, 0);
  assert.equal(result.stderr.includes('[yieldOS:verdict] credentials-read-authorized'), true);
});
