'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const codeAudit = require('../scripts/code-audit');
const agents = require('../scripts/code-audit/agents');
const agentJson = require('../scripts/code-audit/agents/json');
const agentPatch = require('../scripts/code-audit/agents/patch');
function sh(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function tmpRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yieldos-code-audit-agent-'));
  sh(root, ['init', '-b', 'main']);
  sh(root, ['config', 'user.email', 'test@example.com']);
  sh(root, ['config', 'user.name', 'Test User']);
  fs.writeFileSync(path.join(root, 'app.js'), 'module.exports = {};\n');
  sh(root, ['add', 'app.js']);
  sh(root, ['commit', '-m', 'initial']);
  return root;
}

function exploitFinding(overrides = {}) {
  return {
    ruleId: 'agent-missing-authz',
    severity: 'high',
    title: 'Agent found unguarded admin route',
    file: 'server.js',
    line: "app.get('/admin/users', (req, res) => res.json(users));",
    attackerControlledInput: 'Any HTTP client can call the route.',
    vulnerableSink: 'Privileged admin route handler.',
    exploitPath: 'A direct request reaches the handler without auth middleware.',
    impact: 'Unauthorized admin data access.',
    fixStrategy: 'manual',
    ...overrides,
  };
}

test('agent options default to deterministic and child mode disables agents', () => {
  assert.deepEqual(agents.agentOptionsFromEnv({}), {
    mode: 'deterministic',
    provider: 'auto',
    timeoutMs: 60000,
  });

  assert.deepEqual(agents.agentOptionsFromEnv({
    YIELDOS_CODE_AUDIT_MODE: 'agent-fix',
    YIELDOS_CODE_AUDIT_AGENT: 'codex',
    YIELDOS_AGENT_CHILD: '1',
  }), {
    mode: 'deterministic',
    provider: 'auto',
    timeoutMs: 60000,
  });
});

test('agent options enable review and fix modes without API keys', () => {
  const review = agents.agentOptionsFromEnv({
    YIELDOS_CODE_AUDIT_MODE: 'agent-review',
    YIELDOS_CODE_AUDIT_AGENT: 'claude',
    YIELDOS_CODE_AUDIT_AGENT_TIMEOUT_MS: '1234',
  });
  const fix = agents.agentOptionsFromEnv({
    YIELDOS_CODE_AUDIT_MODE: 'agent-fix',
    YIELDOS_CODE_AUDIT_AGENT: 'codex',
  });

  assert.equal(agents.isAgentReviewEnabled(review), true);
  assert.equal(agents.isAgentFixEnabled(review), false);
  assert.equal(review.provider, 'claude');
  assert.equal(review.timeoutMs, 1234);
  assert.equal(agents.isAgentReviewEnabled(fix), true);
  assert.equal(agents.isAgentFixEnabled(fix), true);
  assert.equal(fix.provider, 'codex');
});

test('agent provider runners receive recursion guard environment', () => {
  let childEnv;
  const findings = agents.runAgentRedTeam('/tmp/project', { files: ['server.js'], diff: 'diff' }, {
    mode: 'agent-review',
    provider: 'claude',
    executor: (request) => {
      childEnv = request.env;
      return { status: 0, stdout: JSON.stringify({ findings: [exploitFinding()] }) };
    },
  });

  assert.equal(childEnv.YIELDOS_AGENT_CHILD, '1');
  assert.equal(childEnv.YIELDOS_CODE_AUDIT_MODE, 'deterministic');
  assert.equal(findings.length, 1);
  assert.equal(findings[0].source, 'agent');
});

test('provider requests use local CLIs in read-only non-persistent mode', () => {
  const claude = agents.providerRequest('claude', '/repo', 'prompt', {});
  const codex = agents.providerRequest('codex', '/repo', 'prompt', {});

  assert.deepEqual(claude.args.slice(0, 3), ['-p', '--output-format', 'json']);
  assert.equal(claude.args.includes('--no-session-persistence'), true);
  assert.equal(claude.input, 'prompt');
  assert.equal(codex.args.includes('--sandbox'), true);
  assert.equal(codex.args.includes('read-only'), true);
  assert.equal(codex.args.includes('--ephemeral'), true);
  assert.equal(codex.args.includes('--ask-for-approval'), false);
  assert.equal(codex.args.at(-1), '-');
  assert.equal(codex.input, 'prompt');
});

test('agent JSON parser accepts direct JSON and CLI result wrappers', () => {
  const direct = agentJson.parseJsonPayload(JSON.stringify({ findings: [exploitFinding()] }));
  const wrapped = agentJson.parseJsonPayload(JSON.stringify({
    result: JSON.stringify({ patch: 'diff --git a/server.js b/server.js\n' }),
  }));

  assert.equal(direct.findings.length, 1);
  assert.equal(wrapped.patch.includes('diff --git'), true);
});

test('agent findings without exploit evidence are discarded', () => {
  const normalized = agentJson.normalizeAgentFindings({
    findings: [
      exploitFinding(),
      { rule_id: 'style-thing', severity: 'high', title: 'Looks odd', file: 'server.js' },
    ],
  });

  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].ruleId, 'agent-missing-authz');
});

test('agent patch rejects files outside the audited diff', () => {
  const patch = [
    'diff --git a/README.md b/README.md',
    '--- a/README.md',
    '+++ b/README.md',
    '@@ -1 +1 @@',
    '-old',
    '+new',
    '',
  ].join('\n');

  assert.throws(() => agentPatch.applyAgentPatch('/tmp/project', patch, ['server.js']), /outside audited files/);
});

test('agent patch applies a valid unified diff and stages touched files', () => {
  const root = tmpRepo();
  fs.writeFileSync(path.join(root, 'server.js'), [
    "app.get('/admin/users', (req, res) => res.json(users));",
    '',
  ].join('\n'));
  sh(root, ['add', 'server.js']);

  const patch = [
    'diff --git a/server.js b/server.js',
    '--- a/server.js',
    '+++ b/server.js',
    '@@ -1 +1 @@',
    "-app.get('/admin/users', (req, res) => res.json(users));",
    "+app.get('/admin/users', requireAuth, (req, res) => res.json(users));",
    '',
  ].join('\n');

  const applied = agentPatch.applyAgentPatch(root, patch, ['server.js']);
  const staged = sh(root, ['diff', '--cached', '--', 'server.js']);

  assert.deepEqual(applied.files, ['server.js']);
  assert.equal(staged.includes('requireAuth'), true);
});

test('agent-review blocks on agent-only high finding', () => {
  const root = tmpRepo();
  fs.writeFileSync(path.join(root, 'server.js'), 'const internal = loadUsers();\n');
  sh(root, ['add', 'server.js']);

  const result = codeAudit.auditGitCommand(root, 'git commit -m audit', {
    agent: {
      mode: 'agent-review',
      provider: 'mock',
      redTeam: () => [exploitFinding({ ruleId: 'agent-only-authz' })],
    },
  });

  assert.equal(result.verdict, 'code-audit-blocked');
  assert.equal(result.agent.mode, 'agent-review');
  assert.equal(result.agent.findings, 1);
});

test('agent-review blocks when the configured local agent fails', () => {
  const root = tmpRepo();
  fs.writeFileSync(path.join(root, 'server.js'), 'const internal = loadUsers();\n');
  sh(root, ['add', 'server.js']);

  const result = codeAudit.auditGitCommand(root, 'git commit -m audit', {
    agent: {
      mode: 'agent-review',
      provider: 'claude',
      executor: () => ({ status: 1, stdout: '' }),
    },
  });

  assert.equal(result.verdict, 'code-audit-verification-failed');
  assert.equal(result.action, 'block');
  assert.equal(result.agent.errors.length, 1);
});

test('child audit execution stays deterministic even with agent overrides', () => {
  const root = tmpRepo();
  fs.writeFileSync(path.join(root, 'server.js'), 'const internal = loadUsers();\n');
  sh(root, ['add', 'server.js']);

  const previous = process.env.YIELDOS_AGENT_CHILD;
  process.env.YIELDOS_AGENT_CHILD = '1';
  try {
    const result = codeAudit.auditGitCommand(root, 'git commit -m audit', {
      agent: {
        mode: 'agent-review',
        provider: 'mock',
        redTeam: () => [exploitFinding({ ruleId: 'agent-only-authz' })],
      },
    });

    assert.equal(result.verdict, 'code-audit-clean');
    assert.equal(result.agent.mode, 'deterministic');
    assert.equal(result.agent.runs, 0);
  } finally {
    if (previous === undefined) delete process.env.YIELDOS_AGENT_CHILD;
    else process.env.YIELDOS_AGENT_CHILD = previous;
  }
});

test('agent-fix applies agent patch and deterministic verification passes', () => {
  const root = tmpRepo();
  fs.writeFileSync(path.join(root, 'server.js'), [
    "app.get('/admin/users', (req, res) => res.json(users));",
    '',
  ].join('\n'));
  sh(root, ['add', 'server.js']);

  const patch = [
    'diff --git a/server.js b/server.js',
    '--- a/server.js',
    '+++ b/server.js',
    '@@ -1 +1 @@',
    "-app.get('/admin/users', (req, res) => res.json(users));",
    "+app.get('/admin/users', requireAuth, (req, res) => res.json(users));",
    '',
  ].join('\n');

  const result = codeAudit.auditGitCommand(root, 'git commit -m audit', {
    agent: {
      mode: 'agent-fix',
      provider: 'mock',
      redTeam: () => [],
      blueTeam: () => ({ patch }),
    },
  });
  const staged = sh(root, ['diff', '--cached', '--', 'server.js']);

  assert.equal(result.verdict, 'code-audit-fix-applied');
  assert.equal(result.agent.patchApplied, true);
  assert.equal(staged.includes('requireAuth'), true);
  assert.equal(result.verification.ok, true);
});

test('audit state records agent execution metadata', () => {
  const audit = {
    mode: 'commit',
    diffSource: 'staged',
    diffHash: 'sha256:test',
    range: '--cached',
    files: ['server.js'],
    verdict: 'code-audit-blocked',
    action: 'block',
    findings: [exploitFinding()],
    patch: null,
    verification: null,
    maxIterations: 3,
    agent: {
      mode: 'agent-review',
      provider: 'codex',
      runs: 1,
      findings: 1,
      patchApplied: false,
      errors: [],
    },
  };

  const state = codeAudit.buildAuditState(audit);
  assert.equal(state.agent_mode, 'agent-review');
  assert.equal(state.agent_provider, 'codex');
  assert.equal(state.agent_runs, 1);
  assert.equal(state.agent_findings, 1);
  assert.equal(state.agent_patch_applied, false);
});
