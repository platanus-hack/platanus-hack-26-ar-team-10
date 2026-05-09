'use strict';

const { spawnSync, execFileSync } = require('node:child_process');

const { parseJsonPayload, normalizeAgentFindings, extractPatch } = require('./json');

const DEFAULT_TIMEOUT_MS = 60000;
const MODES = new Set(['deterministic', 'agent-review', 'agent-fix']);
const ENV_GUARD = {
  YIELDOS_AGENT_CHILD: '1',
  YIELDOS_CODE_AUDIT_MODE: 'deterministic',
};

function agentOptionsFromEnv(env = process.env) {
  if (env.YIELDOS_AGENT_CHILD === '1') {
    return { mode: 'deterministic', provider: 'auto', timeoutMs: DEFAULT_TIMEOUT_MS };
  }

  const mode = normalizeMode(env.YIELDOS_CODE_AUDIT_MODE);
  const provider = normalizeProvider(env.YIELDOS_CODE_AUDIT_AGENT);
  const timeoutMs = normalizeTimeout(env.YIELDOS_CODE_AUDIT_AGENT_TIMEOUT_MS);
  return { mode, provider, timeoutMs };
}

function normalizeMode(value) {
  const mode = String(value || 'deterministic').toLowerCase();
  return MODES.has(mode) ? mode : 'deterministic';
}

function normalizeProvider(value) {
  const provider = String(value || 'auto').toLowerCase();
  return ['auto', 'claude', 'codex', 'none'].includes(provider) ? provider : provider;
}

function normalizeTimeout(value) {
  const timeout = Number.parseInt(value, 10);
  return Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS;
}

function isAgentReviewEnabled(options = {}) {
  return options.provider !== 'none' && (options.mode === 'agent-review' || options.mode === 'agent-fix');
}

function isAgentFixEnabled(options = {}) {
  return options.provider !== 'none' && options.mode === 'agent-fix';
}

function runAgentRedTeam(projectRoot, input, options = {}) {
  if (!isAgentReviewEnabled(options)) return [];
  if (typeof options.redTeam === 'function') {
    const payload = options.redTeam(input, { projectRoot, options });
    return normalizeAgentFindings(Array.isArray(payload) ? { findings: payload } : payload);
  }

  const result = runProvider('red-team', projectRoot, { input }, options);
  return normalizeAgentFindings(parseJsonPayload(result.stdout));
}

function runAgentBlueTeam(projectRoot, input, findings, options = {}) {
  if (!isAgentFixEnabled(options)) return { patch: '' };
  if (typeof options.blueTeam === 'function') {
    const payload = options.blueTeam(input, findings, { projectRoot, options });
    return { patch: extractPatch(payload) };
  }

  const result = runProvider('blue-team', projectRoot, { input, findings }, options);
  return { patch: extractPatch(parseJsonPayload(result.stdout)) };
}

function runProvider(kind, projectRoot, payload, options) {
  const provider = resolveProvider(options.provider || 'auto');
  const prompt = kind === 'blue-team'
    ? blueTeamPrompt(payload.input, payload.findings)
    : redTeamPrompt(payload.input);
  const request = providerRequest(provider, projectRoot, prompt, options);
  const result = (options.executor || defaultExecutor)(request);
  if (result.error) throw result.error;
  if (typeof result.status === 'number' && result.status !== 0) {
    throw new Error(`${provider} exited with status ${result.status}`);
  }
  return result;
}

function resolveProvider(provider) {
  if (provider === 'auto') {
    if (commandExists('claude')) return 'claude';
    if (commandExists('codex')) return 'codex';
    throw new Error('no local Claude Code or Codex CLI found');
  }
  if (provider === 'claude' || provider === 'codex' || provider === 'mock') return provider;
  throw new Error(`unsupported code-audit agent provider: ${provider}`);
}

function providerRequest(provider, projectRoot, prompt, options) {
  const env = { ...process.env, ...ENV_GUARD };
  if (provider === 'claude') {
    return {
      provider,
      command: 'claude',
      args: ['-p', '--output-format', 'json', '--no-session-persistence'],
      cwd: projectRoot,
      env,
      input: prompt,
      timeoutMs: options.timeoutMs || DEFAULT_TIMEOUT_MS,
      prompt,
    };
  }

  return {
    provider,
    command: 'codex',
    args: ['exec', '--json', '--sandbox', 'read-only', '--ephemeral', '-C', projectRoot, '-'],
    cwd: projectRoot,
    env,
    input: prompt,
    timeoutMs: options.timeoutMs || DEFAULT_TIMEOUT_MS,
    prompt,
  };
}

function defaultExecutor(request) {
  return spawnSync(request.command, request.args, {
    cwd: request.cwd,
    env: request.env,
    input: request.input || '',
    encoding: 'utf8',
    timeout: request.timeoutMs,
  });
}

function commandExists(command) {
  try {
    execFileSync('command', ['-v', command], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      shell: true,
    });
    return true;
  } catch (_) {
    return false;
  }
}

function redTeamPrompt(input) {
  return [
    'You are the yieldOS code-audit red team.',
    'Return only JSON with {"findings":[...]} and no markdown.',
    'Only report a finding when you can state attackerControlledInput, vulnerableSink, exploitPath, and impact.',
    'Do not report style, architecture, or dependency issues.',
    JSON.stringify({ files: input.files || [], diff: input.diff || '' }),
  ].join('\n\n');
}

function blueTeamPrompt(input, findings) {
  return [
    'You are the yieldOS code-audit blue team.',
    'Return only JSON with {"patch":"<unified git diff>"} and no markdown.',
    'Create the smallest patch that removes the exploit path. Only modify files present in the audited diff.',
    JSON.stringify({ files: input.files || [], findings, diff: input.diff || '' }),
  ].join('\n\n');
}

module.exports = {
  agentOptionsFromEnv,
  isAgentReviewEnabled,
  isAgentFixEnabled,
  runAgentRedTeam,
  runAgentBlueTeam,
  runProvider,
  providerRequest,
};
