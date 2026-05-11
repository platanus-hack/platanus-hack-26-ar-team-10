'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const agentPack = require('../scripts/agent-pack-command');

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const FIXTURE_PACK = path.join(__dirname, 'fixtures', 'yield.agent-pack.yaml');

function tmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'yieldos-pack-'));
}

function copyFixture(root) {
  const target = path.join(root, 'yield.agent-pack.yaml');
  fs.copyFileSync(FIXTURE_PACK, target);
  return target;
}

function writePack(root, content) {
  const target = path.join(root, 'yield.agent-pack.yaml');
  fs.writeFileSync(target, content);
  return target;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256(content) {
  return `sha256:${crypto.createHash('sha256').update(content).digest('hex')}`;
}

test('runPack previews generated files without writing them', () => {
  const root = tmpProject();
  copyFixture(root);

  const result = agentPack.runPack(root, ['preview', '--pack', 'yield.agent-pack.yaml']);
  const paths = result.files.map((file) => file.path);

  assert.equal(result.exitCode, 0);
  assert.equal(result.message.includes('yieldOS pack preview'), true);
  assert.equal(result.message.includes('test-safe-defaults'), true);
  assert.equal(result.message.includes('AGENTS.md'), true);
  assert.equal(result.message.includes('CLAUDE.md'), true);
  assert.equal(result.message.includes('.yield/pack-report.md'), true);
  assert.equal(result.message.includes('yield.agent-pack.lock.json'), true);
  assert.equal(result.message.includes('claude-code: enforced-via-yieldos-hooks'), true);
  assert.equal(result.message.includes('cursor: guidance-only'), true);
  assert.equal(paths.includes('AGENTS.md'), true);
  assert.equal(paths.includes('CLAUDE.md'), true);
  assert.equal(paths.includes('.yield/pack-report.md'), true);
  assert.equal(paths.includes('yield.agent-pack.lock.json'), true);
  assert.equal(paths.includes('.cursor/rules/yieldos-security.mdc'), true);
  assert.equal(paths.includes('.claude/skills/agent-pack-review/SKILL.md'), true);
  assert.equal(paths.includes('.agents/skills/agent-pack-review/SKILL.md'), true);
  assert.equal(paths.includes('.cursor/skills/agent-pack-review/SKILL.md'), true);
  assert.equal(fs.existsSync(path.join(root, 'AGENTS.md')), false);
  assert.equal(fs.existsSync(path.join(root, '.yield', 'pack-report.md')), false);
});

test('runPack writes generated files and refuses overwrite without force', () => {
  const root = tmpProject();
  copyFixture(root);

  const first = agentPack.runPack(root, ['write', '--pack', 'yield.agent-pack.yaml']);

  assert.equal(first.exitCode, 0);
  assert.equal(fs.existsSync(path.join(root, 'AGENTS.md')), true);
  assert.equal(fs.existsSync(path.join(root, 'CLAUDE.md')), true);
  assert.equal(fs.existsSync(path.join(root, '.yield', 'pack-report.md')), true);
  assert.equal(fs.existsSync(path.join(root, 'yield.agent-pack.lock.json')), true);
  assert.equal(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8').includes('Secrets and credentials safety'), true);

  const second = agentPack.runPack(root, ['write', '--pack', 'yield.agent-pack.yaml']);
  assert.equal(second.exitCode, 2);
  assert.equal(second.message.includes('refused to overwrite'), true);

  const forced = agentPack.runPack(root, ['write', '--pack', 'yield.agent-pack.yaml', '--force']);
  assert.equal(forced.exitCode, 0);
});

test('runPack verify rejects an unapproved skill', () => {
  const root = tmpProject();
  writePack(root, `
version: 0.1
kind: yield.agent-pack
name: bad-skill
profiles:
  - secrets-safe
agents:
  claude-code:
    enabled: true
skills:
  allow:
    - key: skill:not-approved
`);

  const result = agentPack.runPack(root, ['verify', '--pack', 'yield.agent-pack.yaml']);

  assert.equal(result.exitCode, 2);
  assert.equal(result.message.includes('skill:not-approved is not approved'), true);
});

test('yieldos-pack writes human errors to stderr', () => {
  const root = tmpProject();
  const result = spawnSync(process.execPath, [path.join(PLUGIN_ROOT, 'scripts', 'agent-pack-command.js'), 'unknown'], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /yieldOS pack error/);
});

test('runPack rejects org overlays that restrict an allowed skill', () => {
  const root = tmpProject();
  writeJson(path.join(root, 'org-overlay.json'), {
    version: 1,
    kind: 'yieldos.org-overlay',
    minimumMode: 'enterprise',
    disableSkills: ['skill:dependency-gate'],
  });
  writePack(root, `
version: 0.1
kind: yield.agent-pack
name: restricted-skill
orgOverlay: org-overlay.json
profiles:
  - secrets-safe
agents:
  claude-code:
    enabled: true
skills:
  allow:
    - key: skill:dependency-gate
`);

  const result = agentPack.runPack(root, ['verify', '--pack', 'yield.agent-pack.yaml']);

  assert.equal(result.exitCode, 2);
  assert.equal(result.message.includes('org overlay disables skill: skill:dependency-gate'), true);
});

test('pack lock records org overlay and effective enterprise metadata', () => {
  const root = tmpProject();
  writeJson(path.join(root, 'org-overlay.json'), {
    version: 1,
    kind: 'yieldos.org-overlay',
    minimumMode: 'enterprise',
    requireProfiles: ['secrets-safe'],
    requirePlaybooks: ['agent-pack-review'],
    requireOracles: ['agent-pack-lock'],
  });
  writePack(root, `
version: 0.1
kind: yield.agent-pack
name: org-pack
orgOverlay: org-overlay.json
profiles:
  - secrets-safe
agents:
  claude-code:
    enabled: true
playbooks:
  include:
    - agent-pack-review
oracles:
  include:
    - agent-pack-lock
`);

  const result = agentPack.runPack(root, ['preview', '--pack', 'yield.agent-pack.yaml']);
  const lockFile = result.files.find((file) => file.path === 'yield.agent-pack.lock.json');
  const lock = JSON.parse(lockFile.content);

  assert.equal(result.exitCode, 0);
  assert.equal(lock.base_policy_manifest_sha256, 'sha256:779a1edd7a20b20c2b4cb7a0b4f7aa81642ee3b0b064099c0726f36a3f3e0731');
  assert.equal(lock.org_overlay_sha256.startsWith('sha256:'), true);
  assert.equal(lock.effective_mode, 'enterprise');
  assert.deepEqual(lock.required_oracles, ['agent-pack-lock']);
});

test('runPack verify fails when org overlay hash changes', () => {
  const root = tmpProject();
  writeJson(path.join(root, 'org-overlay.json'), {
    version: 1,
    kind: 'yieldos.org-overlay',
    minimumMode: 'enterprise',
    requireOracles: ['agent-pack-lock'],
  });
  writePack(root, `
version: 0.1
kind: yield.agent-pack
name: org-pack-stale
orgOverlay: org-overlay.json
profiles:
  - secrets-safe
agents:
  claude-code:
    enabled: true
oracles:
  include:
    - agent-pack-lock
`);
  const written = agentPack.runPack(root, ['write', '--pack', 'yield.agent-pack.yaml']);
  writeJson(path.join(root, 'org-overlay.json'), {
    version: 1,
    kind: 'yieldos.org-overlay',
    minimumMode: 'enterprise',
    requireOracles: ['agent-pack-lock'],
    denyRules: [{ match: 'src/legacy/**' }],
  });

  const result = agentPack.runPack(root, ['verify', '--pack', 'yield.agent-pack.yaml']);

  assert.equal(written.exitCode, 0);
  assert.equal(result.exitCode, 2);
  assert.equal(result.message.includes('pack lock metadata mismatch'), true);
});

test('runPack ignores unverified project-local policy files', () => {
  const root = tmpProject();
  writePack(root, `
version: 0.1
kind: yield.agent-pack
name: unverified-local-policy
profiles:
  - secrets-safe
agents:
  claude-code:
    enabled: true
skills:
  allow:
    - key: skill:not-approved
`);
  writeJson(path.join(root, 'policy', 'skills.json'), {
    version: 'tampered',
    entries: [{
      key: 'skill:not-approved',
      category: 'third-party',
      vendor: 'attacker',
      purpose: 'bypass fixture',
    }],
    rules: { default_unlisted: 'block' },
  });

  const result = agentPack.runPack(root, ['verify', '--pack', 'yield.agent-pack.yaml']);

  assert.equal(result.exitCode, 2);
  assert.equal(result.message.includes('skill:not-approved is not approved'), true);
});

test('runPack verify rejects unsupported manifest fields instead of ignoring them', () => {
  const root = tmpProject();
  writePack(root, `
version: 0.1
kind: yield.agent-pack
name: unknown-fields
profiles:
  - code-audit
agents:
  claude-code:
    enabled: true
    outputs:
      - SHOULD-NOT-BE-IGNORED.md
skills:
  allow: []
  require_review: true
`);

  const result = agentPack.runPack(root, ['verify', '--pack', 'yield.agent-pack.yaml']);

  assert.equal(result.exitCode, 2);
  assert.equal(result.message.includes('unsupported field'), true);
});

test('runPack verify rejects playbooks that are not reviewed by yieldOS', () => {
  const root = tmpProject();
  writePack(root, `
version: 0.1
kind: yield.agent-pack
name: bad-playbook
profiles:
  - secrets-safe
agents:
  claude-code:
    enabled: true
playbooks:
  include:
    - unreviewed-workflow
`);

  const result = agentPack.runPack(root, ['verify', '--pack', 'yield.agent-pack.yaml']);

  assert.equal(result.exitCode, 2);
  assert.equal(result.message.includes('unreviewed-workflow is not a reviewed yieldOS playbook'), true);
});

test('runPack verify rejects oracles that are not reviewed by yieldOS', () => {
  const root = tmpProject();
  writePack(root, `
version: 0.1
kind: yield.agent-pack
name: bad-oracle
profiles:
  - secrets-safe
agents:
  claude-code:
    enabled: true
oracles:
  include:
    - unreviewed-oracle
`);

  const result = agentPack.runPack(root, ['verify', '--pack', 'yield.agent-pack.yaml']);

  assert.equal(result.exitCode, 2);
  assert.equal(result.message.includes('unreviewed-oracle is not a reviewed yieldOS oracle'), true);
});

test('runPack verify rejects MCP tools outside the approved surface', () => {
  const root = tmpProject();
  writePack(root, `
version: 0.1
kind: yield.agent-pack
name: bad-mcp
profiles:
  - secrets-safe
agents:
  claude-code:
    enabled: true
mcps:
  allow:
    - key: mcp:filesystem
      approved_tools:
        - read_file
        - write_file
`);

  const result = agentPack.runPack(root, ['verify', '--pack', 'yield.agent-pack.yaml']);

  assert.equal(result.exitCode, 2);
  assert.equal(result.message.includes('mcp:filesystem requests unapproved tool: write_file'), true);
});

test('runPack verify rejects MCPs blocked by policy scope', () => {
  const root = tmpProject();
  writePack(root, `
version: 0.1
kind: yield.agent-pack
name: blocked-mcp
profiles:
  - secrets-safe
agents:
  claude-code:
    enabled: true
mcps:
  allow:
    - key: mcp:claude-in-chrome
      approved_tools: []
`);

  const result = agentPack.runPack(root, ['verify', '--pack', 'yield.agent-pack.yaml']);

  assert.equal(result.exitCode, 2);
  assert.equal(result.message.includes('mcp:claude-in-chrome is blocked by policy scope'), true);
});

test('runPack rejects pack lock paths outside the project', () => {
  const root = tmpProject();
  writePack(root, `
version: 0.1
kind: yield.agent-pack
name: bad-lock-path
profiles:
  - secrets-safe
agents:
  claude-code:
    enabled: true
evidence:
  pack_lock: ../yield.agent-pack.lock.json
`);

  const result = agentPack.runPack(root, ['verify', '--pack', 'yield.agent-pack.yaml']);

  assert.equal(result.exitCode, 2);
  assert.equal(result.message.includes('pack_lock must stay inside the project'), true);
});

test('runPack rejects pack lock paths that collide with generated files', () => {
  const root = tmpProject();
  writePack(root, `
version: 0.1
kind: yield.agent-pack
name: bad-lock-collision
profiles:
  - secrets-safe
agents:
  codex:
    enabled: true
evidence:
  pack_lock: AGENTS.md
`);

  const result = agentPack.runPack(root, ['verify', '--pack', 'yield.agent-pack.yaml']);

  assert.equal(result.exitCode, 2);
  assert.equal(result.message.includes('pack_lock must not collide with generated file: AGENTS.md'), true);
});

test('runPack rejects pack files outside the project', () => {
  const root = tmpProject();
  const outside = path.join(tmpProject(), 'yield.agent-pack.yaml');
  fs.copyFileSync(FIXTURE_PACK, outside);

  const result = agentPack.runPack(root, ['verify', '--pack', outside]);

  assert.equal(result.exitCode, 2);
  assert.equal(result.message.includes('pack path must stay inside the project'), true);
});

test('runPack write rejects generated paths that traverse symlinks outside the project', () => {
  if (process.platform === 'win32') return;
  const root = tmpProject();
  const outside = tmpProject();
  copyFixture(root);
  fs.symlinkSync(outside, path.join(root, '.yield'), 'dir');

  const result = agentPack.runPack(root, ['write', '--pack', 'yield.agent-pack.yaml']);

  assert.equal(result.exitCode, 2);
  assert.equal(result.message.includes('generated file path must not traverse a symlink'), true);
  assert.equal(fs.existsSync(path.join(outside, 'pack-report.md')), false);
});

test('runPack verify detects tampered generated files when a pack lock exists', () => {
  const root = tmpProject();
  copyFixture(root);
  const written = agentPack.runPack(root, ['write', '--pack', 'yield.agent-pack.yaml']);
  assert.equal(written.exitCode, 0);
  fs.appendFileSync(path.join(root, 'AGENTS.md'), '\n# tampered\n');

  const result = agentPack.runPack(root, ['verify', '--pack', 'yield.agent-pack.yaml']);

  assert.equal(result.exitCode, 2);
  assert.equal(result.message.includes('generated file hash mismatch: AGENTS.md'), true);
});

test('runPack verify rejects active generated files without a pack lock', () => {
  const root = tmpProject();
  copyFixture(root);
  const written = agentPack.runPack(root, ['write', '--pack', 'yield.agent-pack.yaml']);
  assert.equal(written.exitCode, 0);
  fs.rmSync(path.join(root, 'yield.agent-pack.lock.json'));
  fs.appendFileSync(path.join(root, 'AGENTS.md'), '\n# tampered\n');

  const result = agentPack.runPack(root, ['verify', '--pack', 'yield.agent-pack.yaml']);

  assert.equal(result.exitCode, 2);
  assert.equal(result.message.includes('pack lock missing while generated files exist: AGENTS.md'), true);
});

test('runPack verify rejects tampered pack lock metadata', () => {
  const root = tmpProject();
  copyFixture(root);
  const written = agentPack.runPack(root, ['write', '--pack', 'yield.agent-pack.yaml']);
  assert.equal(written.exitCode, 0);
  const lockPath = path.join(root, 'yield.agent-pack.lock.json');
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  lock.skills[0].policy_entry_sha256 = 'sha256:tampered';
  lock.mcps[0].approved_tools = ['read_file', 'write_file'];
  fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);

  const result = agentPack.runPack(root, ['verify', '--pack', 'yield.agent-pack.yaml']);

  assert.equal(result.exitCode, 2);
  assert.equal(result.message.includes('pack lock metadata mismatch'), true);
});

test('runPack verify rejects duplicate YAML keys', () => {
  const root = tmpProject();
  writePack(root, `
version: 0.1
kind: yield.agent-pack
name: duplicate-keys
name: hidden-rewrite
profiles:
  - secrets-safe
agents:
  claude-code:
    enabled: true
`);

  const result = agentPack.runPack(root, ['verify', '--pack', 'yield.agent-pack.yaml']);

  assert.equal(result.exitCode, 2);
  assert.equal(result.message.includes('duplicate key on line 4: name'), true);
});

test('runPack verify rejects dangerous YAML keys', () => {
  const root = tmpProject();
  writePack(root, `
version: 0.1
kind: yield.agent-pack
name: dangerous-key
profiles:
  - secrets-safe
agents:
  claude-code:
    enabled: true
__proto__: polluted
`);

  const result = agentPack.runPack(root, ['verify', '--pack', 'yield.agent-pack.yaml']);

  assert.equal(result.exitCode, 2);
  assert.equal(result.message.includes('dangerous key on line 9: __proto__'), true);
});

test('runPack verify rejects JSON pack manifests', () => {
  const root = tmpProject();
  writePack(root, JSON.stringify({
    version: '0.1',
    kind: 'yield.agent-pack',
    name: 'json-pack',
    profiles: ['secrets-safe'],
    agents: { 'claude-code': { enabled: true } },
  }));

  const result = agentPack.runPack(root, ['verify', '--pack', 'yield.agent-pack.yaml']);

  assert.equal(result.exitCode, 2);
  assert.equal(result.message.includes('pack manifests must use YAML, not JSON'), true);
});

test('pack lock records hashes for generated files', () => {
  const root = tmpProject();
  copyFixture(root);

  const result = agentPack.runPack(root, ['preview', '--pack', 'yield.agent-pack.yaml']);
  const lockFile = result.files.find((file) => file.path === 'yield.agent-pack.lock.json');
  const lock = JSON.parse(lockFile.content);
  const agentsFile = result.files.find((file) => file.path === 'AGENTS.md');

  assert.equal(lock.pack, 'test-safe-defaults');
  assert.equal(lock.policy_version, '0.4.0');
  assert.equal(lock.generated_files.some((file) => file.path === 'AGENTS.md' && file.sha256 === sha256(agentsFile.content)), true);
  assert.equal(lock.skills[0].key, 'skill:dependency-gate');
  assert.equal(lock.skills[0].policy_entry_sha256.startsWith('sha256:'), true);
  assert.equal(Object.hasOwn(lock.skills[0], 'content_sha256'), false);
  assert.equal(lock.mcps[0].key, 'mcp:filesystem');
  assert.deepEqual(lock.oracles.include, ['code-audit-state', 'agent-pack-lock', 'instruction-policy']);
  assert.equal(lock.oracles.registry_version, '0.1');
  assert.equal(lock.generated_files.some((file) => file.path === '.cursor/rules/yieldos-security.mdc'), true);
  assert.equal(lock.generated_files.some((file) => file.path === '.cursor/skills/agent-pack-review/SKILL.md'), true);
});

test('runPack generates native adapters for Cursor, Copilot, and Windsurf', () => {
  const root = tmpProject();
  writePack(root, `
version: 0.1
kind: yield.agent-pack
name: all-targets
profiles:
  - secrets-safe
agents:
  claude-code:
    enabled: true
  codex:
    enabled: true
  cursor:
    enabled: true
  github-copilot:
    enabled: true
  windsurf:
    enabled: true
skills:
  allow:
    - key: skill:dependency-gate
mcps:
  allow:
    - key: mcp:filesystem
      approved_tools:
        - read_file
        - list_directory
        - search_files
playbooks:
  include:
    - agent-pack-review
`);

  const result = agentPack.runPack(root, ['preview', '--pack', 'yield.agent-pack.yaml']);
  const paths = result.files.map((file) => file.path);
  const cursorSkill = result.files.find((file) => file.path === '.cursor/skills/agent-pack-review/SKILL.md');

  assert.equal(result.exitCode, 0);
  assert.equal(result.message.includes('This pack declares approved oracles. Run yieldos-oracle or CI to execute them.'), true);
  [
    '.cursor/rules/yieldos-security.mdc',
    '.github/copilot-instructions.md',
    '.github/instructions/yieldos-security.instructions.md',
    '.github/prompts/yieldos-security-audit.prompt.md',
    '.windsurf/rules/yieldos-security.md',
    '.claude/skills/agent-pack-review/SKILL.md',
    '.agents/skills/agent-pack-review/SKILL.md',
    '.cursor/skills/agent-pack-review/SKILL.md',
    '.windsurf/skills/agent-pack-review/SKILL.md',
  ].forEach((expectedPath) => {
    assert.equal(paths.includes(expectedPath), true, `expected generated file: ${expectedPath}`);
  });
  assert.equal(cursorSkill.content.includes('name: agent-pack-review'), true);
  assert.equal(cursorSkill.content.includes('Check every MCP reference against `policy/mcps.json`.'), true);
});

test('generated skills include actionable harness procedure and evidence sections', () => {
  const root = tmpProject();
  writePack(root, `
version: 0.1
kind: yield.agent-pack
name: actionable-skills
profiles:
  - secrets-safe
agents:
  codex:
    enabled: true
playbooks:
  include:
    - security-audit
    - mcp-review
`);

  const result = agentPack.runPack(root, ['preview', '--pack', 'yield.agent-pack.yaml']);
  const auditSkill = result.files.find((file) => file.path === '.agents/skills/security-audit/SKILL.md');
  const mcpSkill = result.files.find((file) => file.path === '.agents/skills/mcp-review/SKILL.md');

  assert.equal(result.exitCode, 0);
  [
    '## Trigger',
    '## Deterministic Checks',
    '## Stop Conditions',
    '## Evidence',
    'source/control/sink/impact',
  ].forEach((text) => {
    assert.equal(auditSkill.content.includes(text), true, `security-audit missing: ${text}`);
  });
  [
    'announced tool surface',
    'denied_tools',
    'Block the MCP if it exposes any tool outside the approved list.',
  ].forEach((text) => {
    assert.equal(mcpSkill.content.includes(text), true, `mcp-review missing: ${text}`);
  });
});

test('guidance-only adapters state their enforcement boundary', () => {
  const root = tmpProject();
  writePack(root, `
version: 0.1
kind: yield.agent-pack
name: adapter-boundaries
profiles:
  - secrets-safe
agents:
  cursor:
    enabled: true
  github-copilot:
    enabled: true
  windsurf:
    enabled: true
playbooks:
  include:
    - agent-pack-review
`);

  const result = agentPack.runPack(root, ['preview', '--pack', 'yield.agent-pack.yaml']);

  [
    '.cursor/rules/yieldos-security.mdc',
    '.github/copilot-instructions.md',
    '.windsurf/rules/yieldos-security.md',
  ].forEach((expectedPath) => {
    const file = result.files.find((candidate) => candidate.path === expectedPath);
    assert.ok(file, `expected generated file: ${expectedPath}`);
    assert.equal(file.content.includes('This adapter is guidance-only'), true, `${expectedPath} must state guidance-only boundary`);
  });
});

test('generated guidance carries the non-technical safe-coding contract', () => {
  const root = tmpProject();
  writePack(root, `
version: 0.1
kind: yield.agent-pack
name: non-technical-safe-defaults
profiles:
  - secrets-safe
  - dependency-safe
  - code-audit
agents:
  claude-code:
    enabled: true
  codex:
    enabled: true
  cursor:
    enabled: true
  github-copilot:
    enabled: true
  windsurf:
    enabled: true
skills:
  allow:
    - key: skill:dependency-gate
mcps:
  allow:
    - key: mcp:filesystem
      approved_tools:
        - read_file
        - list_directory
        - search_files
playbooks:
  include:
    - agent-pack-review
`);

  const result = agentPack.runPack(root, ['preview', '--pack', 'yield.agent-pack.yaml']);

  assert.equal(result.exitCode, 0);
  [
    'AGENTS.md',
    '.cursor/rules/yieldos-security.mdc',
    '.github/copilot-instructions.md',
    '.github/instructions/yieldos-security.instructions.md',
    '.windsurf/rules/yieldos-security.md',
    '.agents/skills/agent-pack-review/SKILL.md',
  ].forEach((expectedPath) => {
    const file = result.files.find((candidate) => candidate.path === expectedPath);
    assert.ok(file, `expected generated file: ${expectedPath}`);
    [
      'Non-technical user safety contract',
      'Allowed means configured checks passed, not proven safe.',
      'Do not install or enable unapproved skills, MCPs, dependencies, remote scripts, or binaries.',
      'Stop and explain in plain language when a request could expose secrets, weaken auth, delete data, spend money, deploy, or change production.',
      'Use deterministic yieldOS policy before model judgment.',
    ].forEach((text) => {
      assert.equal(file.content.includes(text), true, `${expectedPath} missing: ${text}`);
    });
  });
});

test('claude-only packs include the safety contract in CLAUDE.md', () => {
  const root = tmpProject();
  writePack(root, `
version: 0.1
kind: yield.agent-pack
name: claude-only-safe-defaults
profiles:
  - secrets-safe
agents:
  claude-code:
    enabled: true
`);

  const result = agentPack.runPack(root, ['preview', '--pack', 'yield.agent-pack.yaml']);
  const claudeFile = result.files.find((file) => file.path === 'CLAUDE.md');

  assert.equal(result.exitCode, 0);
  assert.ok(claudeFile, 'expected CLAUDE.md');
  assert.equal(claudeFile.content.includes('Non-technical user safety contract'), true);
  assert.equal(claudeFile.content.includes('Use deterministic yieldOS policy before model judgment.'), true);
});

test('pack command markdown and executable are registered', () => {
  const command = fs.readFileSync(path.join(PLUGIN_ROOT, 'commands', 'pack.md'), 'utf8');
  const mode = fs.statSync(path.join(PLUGIN_ROOT, 'bin', 'yieldos-pack')).mode;

  assert.equal(command.includes('allowed-tools: Bash(yieldos-pack:*)'), true);
  assert.equal(command.includes('yieldos-pack $ARGUMENTS'), true);
  if (process.platform !== 'win32') {
    assert.equal((mode & 0o111) !== 0, true);
  }
});
