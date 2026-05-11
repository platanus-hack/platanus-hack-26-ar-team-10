#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const init = require('./init-command');
const {
  PLAYBOOK_SKILLS,
  SAFE_CODING_CONTRACT_BULLETS,
  SAFE_CODING_CONTRACT_TITLE,
  VALID_PLAYBOOKS,
} = require('./agent-pack-playbooks');
const { parseManifest } = require('./agent-pack-yaml');
const { knownOracleIds } = require('./oracles/registry');
const policyFetcher = require('./policy-fetcher');
const runtimeConfig = require('./runtime-config');

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const DEFAULTS = require(path.join(PLUGIN_ROOT, 'config', 'defaults.json'));
const VALID_ACTIONS = new Set(['preview', 'write', 'verify']);
const VALID_TARGETS = new Set(['claude-code', 'codex', 'cursor', 'github-copilot', 'windsurf', 'universal']);
const PACK_FIELDS = new Set(['version', 'kind', 'name', 'description', 'orgOverlay', 'profiles', 'agents', 'skills', 'mcps', 'playbooks', 'oracles', 'evidence']);
const AGENT_FIELDS = new Set(['enabled']);
const SKILLS_FIELDS = new Set(['allow']);
const SKILL_ITEM_FIELDS = new Set(['key', 'source']);
const MCPS_FIELDS = new Set(['allow', 'default_unlisted']);
const MCP_ITEM_FIELDS = new Set(['key', 'approved_tools']);
const INCLUDE_FIELDS = new Set(['include']);
const EVIDENCE_FIELDS = new Set(['decisions_dir', 'audit_state', 'pack_lock']);
const TARGET_STRENGTH = {
  'claude-code': 'enforced-via-yieldos-hooks',
  codex: 'instruction-and-approval-guidance',
  cursor: 'guidance-only',
  'github-copilot': 'guidance-only',
  windsurf: 'guidance-only',
  universal: 'guidance-only',
};
function parseArgs(argv = []) {
  const parsed = {
    action: 'preview',
    packPath: 'yield.agent-pack.yaml',
    force: false,
    help: false,
  };
  const args = [...argv];
  if (args[0] && !args[0].startsWith('--')) {
    const action = args.shift();
    if (action === 'help') parsed.help = true;
    else if (VALID_ACTIONS.has(action)) parsed.action = action;
    else throw new Error(`unknown pack action: ${action}`);
  }
  while (args.length > 0) {
    const arg = args.shift();
    if (arg === '--pack') parsed.packPath = requireValue(arg, args.shift());
    else if (arg === '--write') parsed.action = 'write';
    else if (arg === '--verify') parsed.action = 'verify';
    else if (arg === '--force') parsed.force = true;
    else if (arg === '--help' || arg === '-h') parsed.help = true;
    else throw new Error(`unknown pack option: ${arg}`);
  }
  return parsed;
}

function requireValue(flag, value) {
  if (!value || value.startsWith('--')) throw new Error(`${flag} needs a value`);
  return value;
}

function runPack(projectRoot, argv = process.argv.slice(2), options = {}) {
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (err) {
    return { exitCode: 2, message: `yieldOS pack error: ${err.message}` };
  }
  if (parsed.help) return { exitCode: 0, message: usage() };

  try {
    const compiled = compilePack(projectRoot, parsed.packPath, options);
    if (parsed.action === 'verify') {
      const verification = verifyInstalledFiles(projectRoot, compiled);
      return { exitCode: 0, message: renderVerify(compiled, verification), files: compiled.files, pack: compiled.pack, verification };
    }
    if (parsed.action === 'preview') {
      return { exitCode: 0, message: renderPreview(projectRoot, compiled), files: compiled.files, pack: compiled.pack };
    }

    const existing = compiled.files.filter((file) => fs.existsSync(file.absolutePath));
    if (existing.length > 0 && !parsed.force) {
      return {
        exitCode: 2,
        message: `yieldOS pack refused to overwrite because file already exists: ${displayPath(projectRoot, existing[0].absolutePath)}. Rerun with --force to replace it.`,
      };
    }
    for (const file of compiled.files) {
      fs.mkdirSync(path.dirname(file.absolutePath), { recursive: true });
      fs.writeFileSync(file.absolutePath, file.content);
    }
    return { exitCode: 0, message: renderWrite(projectRoot, compiled), files: compiled.files, pack: compiled.pack };
  } catch (err) {
    return { exitCode: 2, message: `yieldOS pack error: ${err.message}` };
  }
}

function compilePack(projectRoot, packPath, options = {}) {
  const absolutePackPath = safeProjectPath(projectRoot, packPath, 'pack path');
  const pack = parseManifest(fs.readFileSync(absolutePackPath, 'utf8'));
  const policy = loadPolicy(projectRoot, options);
  const orgOverlay = loadPackOrgOverlay(projectRoot, pack.orgOverlay);
  const validation = validatePack(pack, policy, orgOverlay);
  const instructionFiles = renderInstructionFiles(pack, validation);
  const adapterFiles = renderAdapterFiles(pack, validation);
  const generatedFiles = [...instructionFiles, ...adapterFiles];
  const report = renderReport(pack, validation, generatedFiles);
  const lockPath = pack.evidence?.pack_lock || 'yield.agent-pack.lock.json';
  const filesWithoutLock = [
    ...generatedFiles,
    { path: '.yield/pack-report.md', content: report },
  ];
  assertPackLockDoesNotCollide(lockPath, filesWithoutLock);
  const lock = renderLock(pack, validation, filesWithoutLock);
  const files = [
    ...filesWithoutLock,
    { path: lockPath, content: `${JSON.stringify(lock, null, 2)}\n`, label: 'pack_lock' },
  ].map((file) => ({
    ...file,
    absolutePath: safeProjectPath(projectRoot, file.path, file.label || 'generated file path'),
  }));

  return { pack, validation, files, absolutePackPath };
}

function loadPolicy(projectRoot, options = {}) {
  const bundle = loadVerifiedPolicyBundle(projectRoot, options);
  return {
    skills: bundle['skills.json'],
    mcps: bundle['mcps.json'],
  };
}

function loadVerifiedPolicyBundle(projectRoot, options = {}) {
  if (options.policyRoot) {
    const explicit = policyFetcher.loadFromPolicyDirectory(path.resolve(options.policyRoot));
    if (!explicit) throw new Error('explicit policy root failed integrity verification');
    return explicit;
  }

  const candidates = [
    path.join(projectRoot, 'policy'),
    path.join(PLUGIN_ROOT, 'policy-cache'),
  ];

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    const policy = policyFetcher.loadFromPolicyDirectory(candidate);
    if (policy) return policy;
  }

  throw new Error('verified policy bundle not found');
}

function validatePack(pack, policy, orgOverlay = null) {
  if (!pack || typeof pack !== 'object' || Array.isArray(pack)) throw new Error('pack must be an object');
  assertSupportedPackFields(pack);
  if (pack.kind !== 'yield.agent-pack') throw new Error('kind must be yield.agent-pack');
  if (!pack.name) throw new Error('name is required');
  const profiles = asArray(pack.profiles, 'profiles');
  for (const profile of profiles) {
    if (!init.PROFILE_SECTIONS[profile]) throw new Error(`unknown profile: ${profile}`);
  }
  const agents = activeAgents(pack.agents);
  const skills = validateSkills(pack.skills, policy.skills);
  const mcps = validateMcps(pack.mcps, policy.mcps);
  const playbooks = validatePlaybooks(pack.playbooks);
  const oracles = validateOracles(pack.oracles);
  const warnings = agents
    .filter((agent) => TARGET_STRENGTH[agent] === 'guidance-only')
    .map((agent) => `${agent} output is guidance-only; runtime enforcement depends on that host.`);

  const validation = {
    profiles,
    agents,
    skills,
    mcps,
    playbooks,
    oracles,
    warnings,
    policyVersion: policy.skills.version || policy.mcps.version || 'unknown',
    basePolicyManifestSha256: policy.basePolicyManifestSha256 || DEFAULTS.policy.manifest_sha256 || null,
    orgOverlay: null,
    orgOverlaySha256: null,
    effectiveMode: 'standard',
    requiredOracles: [],
  };
  return applyOrgOverlay(validation, orgOverlay);
}

function loadPackOrgOverlay(projectRoot, orgOverlay) {
  if (orgOverlay == null) return null;
  const validation = runtimeConfig.validateRuntimeConfig({
    version: 1,
    mode: 'standard',
    orgOverlay,
  }, { projectRoot });
  if (!validation.ok) throw new Error(validation.errors.join('; '));
  return validation.config.orgOverlay;
}

function applyOrgOverlay(validation, overlay) {
  if (!overlay) return validation;

  requireIncluded(validation.profiles, overlay.requireProfiles, 'profile');
  requireIncluded(validation.playbooks, overlay.requirePlaybooks, 'playbook');
  requireIncluded(validation.oracles, overlay.requireOracles, 'oracle');
  assertNoDisabled(validation.skills.map((skill) => skill.key), overlay.disableSkills, 'skill');
  assertNoDisabled(validation.mcps.map((mcp) => mcp.key), overlay.disableMcps, 'MCP');

  return {
    ...validation,
    orgOverlay: overlay,
    orgOverlaySha256: overlay.sha256 || sha256(JSON.stringify(overlay)),
    effectiveMode: runtimeConfig.maxMode('standard', overlay.minimumMode),
    requiredOracles: overlay.requireOracles || [],
  };
}

function requireIncluded(actual, required = [], label) {
  const actualSet = new Set(actual);
  for (const item of required || []) {
    if (!actualSet.has(item)) throw new Error(`org overlay requires ${label}: ${item}`);
  }
}

function assertNoDisabled(actual, disabled = [], label) {
  const actualSet = new Set(actual);
  for (const item of disabled || []) {
    if (actualSet.has(item)) throw new Error(`org overlay disables ${label}: ${item}`);
  }
}

function assertSupportedPackFields(pack) {
  assertAllowedKeys('pack', pack, PACK_FIELDS);
  assertMapFields('agents', pack.agents, AGENT_FIELDS);
  assertConfigFields('skills', pack.skills, SKILLS_FIELDS);
  assertConfigFields('mcps', pack.mcps, MCPS_FIELDS);
  assertConfigFields('playbooks', pack.playbooks, INCLUDE_FIELDS);
  assertConfigFields('oracles', pack.oracles, INCLUDE_FIELDS);
  assertConfigFields('evidence', pack.evidence, EVIDENCE_FIELDS);

  for (const [index, item] of asArray(pack.skills?.allow || [], 'skills.allow').entries()) {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      assertAllowedKeys(`skills.allow[${index}]`, item, SKILL_ITEM_FIELDS);
    }
  }
  for (const [index, item] of asArray(pack.mcps?.allow || [], 'mcps.allow').entries()) {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      assertAllowedKeys(`mcps.allow[${index}]`, item, MCP_ITEM_FIELDS);
    }
  }
}

function assertMapFields(label, value, allowed) {
  if (value == null) return;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  for (const [key, config] of Object.entries(value)) {
    if (config && typeof config === 'object' && !Array.isArray(config)) {
      assertAllowedKeys(`${label}.${key}`, config, allowed);
    }
  }
}

function assertConfigFields(label, value, allowed) {
  if (value == null) return;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  assertAllowedKeys(label, value, allowed);
}

function assertAllowedKeys(label, value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`unsupported field ${label}.${key}`);
  }
}

function validateOracles(oraclesConfig = {}) {
  const included = asArray(oraclesConfig?.include || [], 'oracles.include');
  const known = knownOracleIds();
  for (const oracle of included) {
    if (!known.has(oracle)) throw new Error(`${oracle} is not a reviewed yieldOS oracle`);
  }
  return included;
}

function validatePlaybooks(playbooksConfig = {}) {
  const included = asArray(playbooksConfig?.include || [], 'playbooks.include');
  for (const playbook of included) {
    if (!VALID_PLAYBOOKS.has(playbook)) {
      throw new Error(`${playbook} is not a reviewed yieldOS playbook`);
    }
  }
  return included;
}

function activeAgents(agents = {}) {
  if (!agents || typeof agents !== 'object' || Array.isArray(agents)) throw new Error('agents must be a map');
  const active = Object.entries(agents)
    .filter(([, config]) => config === true || config?.enabled === true)
    .map(([agent]) => agent);
  if (active.length === 0) throw new Error('at least one agent must be enabled');
  for (const agent of active) {
    if (!VALID_TARGETS.has(agent)) throw new Error(`unknown target agent: ${agent}`);
  }
  return active;
}

function validateSkills(skillsConfig = {}, policy) {
  const allowed = asArray(skillsConfig.allow || [], 'skills.allow');
  const policyByKey = new Map((policy.entries || []).map((entry) => [entry.key, entry]));
  return allowed.map((item) => {
    const key = item.key || item;
    const entry = policyByKey.get(key);
    if (!entry) throw new Error(`${key} is not approved in policy/skills.json`);
    return {
      key,
      source: item.source || 'policy/skills.json',
      category: entry.category,
      vendor: entry.vendor,
      content_sha256: entry.content_sha256,
      policy_entry_sha256: sha256(JSON.stringify(entry)),
    };
  });
}

function validateMcps(mcpsConfig = {}, policy) {
  const allowed = asArray(mcpsConfig.allow || [], 'mcps.allow');
  const policyByKey = new Map((policy.entries || []).map((entry) => [entry.key, entry]));
  return allowed.map((item) => {
    const key = item.key || item;
    const entry = policyByKey.get(key);
    if (!entry) throw new Error(`${key} is not approved in policy/mcps.json`);
    if (entry.scope === 'blocked-by-default') throw new Error(`${key} is blocked by policy scope`);
    const requestedTools = asArray(item.approved_tools || entry.approved_tools || [], `${key}.approved_tools`);
    const approvedTools = new Set(entry.approved_tools || []);
    for (const tool of requestedTools) {
      if (!approvedTools.has(tool)) throw new Error(`${key} requests unapproved tool: ${tool}`);
    }
    return { key, approved_tools: requestedTools, scope: entry.scope };
  });
}

function asArray(value, label) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error(`${label} must be a list`);
  return value;
}

function renderInstructionFiles(pack, validation) {
  const agent = instructionAgent(validation.agents);
  const files = init.renderInstructionFiles({
    agent,
    scope: 'project',
    profiles: validation.profiles,
  });
  const hasAgentsFile = files.some((file) => file.path === 'AGENTS.md');

  return files.map((file) => ({
    ...file,
    content: file.path === 'AGENTS.md' || !hasAgentsFile
      ? appendPackSection(file.content, pack, validation)
      : file.content,
  }));
}

function renderAdapterFiles(pack, validation) {
  const files = [];
  if (validation.agents.includes('cursor')) {
    files.push({ path: '.cursor/rules/yieldos-security.mdc', content: renderCursorRule(pack, validation) });
    files.push(...renderSkillFiles('.cursor/skills', validation.playbooks));
  }
  if (validation.agents.includes('github-copilot')) {
    files.push({ path: '.github/copilot-instructions.md', content: renderCopilotInstructions(pack, validation) });
    files.push({ path: '.github/instructions/yieldos-security.instructions.md', content: renderCopilotPathInstructions(pack, validation) });
    files.push({ path: '.github/prompts/yieldos-security-audit.prompt.md', content: renderCopilotPrompt(pack, validation) });
  }
  if (validation.agents.includes('windsurf')) {
    files.push({ path: '.windsurf/rules/yieldos-security.md', content: renderWindsurfRule(pack, validation) });
    files.push(...renderSkillFiles('.windsurf/skills', validation.playbooks));
  }
  if (validation.agents.includes('claude-code')) {
    files.push(...renderSkillFiles('.claude/skills', validation.playbooks));
  }
  if (validation.agents.includes('codex') || validation.agents.includes('universal')) {
    files.push(...renderSkillFiles('.agents/skills', validation.playbooks));
  }
  return dedupeFiles(files);
}

function renderSkillFiles(root, playbooks) {
  return playbooks.map((playbook) => ({
    path: `${root}/${playbook}/SKILL.md`,
    content: renderSkill(playbook),
  }));
}

function renderSkill(playbook) {
  const skill = PLAYBOOK_SKILLS[playbook];
  return [
    '---',
    `name: ${playbook}`,
    `description: ${skill.description}`,
    '---',
    '',
    `# ${skill.name}`,
    '',
    ...skill.body,
    '',
    `## ${SAFE_CODING_CONTRACT_TITLE}`,
    '',
    ...SAFE_CODING_CONTRACT_BULLETS.map((bullet) => `- ${bullet}`),
    '',
    '## Output',
    '',
    'Return concise findings, files reviewed, decisions made, and verification evidence.',
    '',
  ].join('\n');
}

function renderCursorRule(pack, validation) {
  return [
    '---',
    'description: yieldOS security harness rules for agent work',
    'alwaysApply: true',
    '---',
    '',
    `Pack: ${pack.name}`,
    '',
    '- This adapter is guidance-only; use yieldOS hooks, CLI verification, or CI for deterministic enforcement.',
    '- Follow `AGENTS.md` and yieldOS pack guidance before making security-sensitive changes.',
    '- Do not add skills, MCPs, dependencies, remote bootstraps, binaries, or instruction changes outside the approved pack and policy.',
    `- Active profiles: ${validation.profiles.join(', ')}`,
    `- Active playbooks: ${validation.playbooks.join(', ') || 'none'}`,
    '',
    ...renderSafetyContractLines(),
    '',
  ].join('\n');
}

function renderCopilotInstructions(pack, validation) {
  return [
    '# yieldOS Copilot Instructions',
    '',
    `Pack: ${pack.name}`,
    '',
    'Follow these repository safety defaults when generating, reviewing, or explaining code.',
    'This adapter is guidance-only; use yieldOS hooks, CLI verification, branch protection, or CI for deterministic enforcement.',
    '',
    ...validation.profiles.map((profile) => `- Apply yieldOS profile: ${profile}`),
    '- Treat dependency additions, MCP changes, skill changes, and instruction-file edits as security-sensitive.',
    '- Prefer existing project utilities and deterministic verification before new dependencies.',
    '',
    ...renderSafetyContractLines(),
    '',
  ].join('\n');
}

function renderCopilotPathInstructions(pack, validation) {
  return [
    '---',
    'applyTo: "**/*"',
    '---',
    '',
    '# yieldOS Security Instructions',
    '',
    `Pack: ${pack.name}`,
    '',
    `Approved skills: ${validation.skills.map((skill) => skill.key).join(', ') || 'none'}`,
    `Approved MCPs: ${validation.mcps.map((mcp) => mcp.key).join(', ') || 'none'}`,
    'Generated guidance is not a hard runtime gate in Copilot; use branch protection and yieldOS verification for enforcement.',
    '',
    ...renderSafetyContractLines(),
    '',
  ].join('\n');
}

function renderCopilotPrompt(pack, validation) {
  return [
    '# yieldOS Security Audit',
    '',
    `Use the ${pack.name} pack guidance.`,
    '',
    'Review the current changes for authentication, authorization, validation, file access, command execution, dependency, MCP, skill, and instruction-file risks.',
    '',
    `Active playbooks: ${validation.playbooks.join(', ') || 'none'}`,
    '',
    ...renderSafetyContractLines(),
    '',
  ].join('\n');
}

function renderWindsurfRule(pack, validation) {
  return [
    '---',
    'trigger: always_on',
    '---',
    '',
    '# yieldOS Security Harness Rules',
    '',
    `Pack: ${pack.name}`,
    '',
    '- This adapter is guidance-only; use yieldOS hooks, CLI verification, managed policy, or CI for deterministic enforcement.',
    '- Follow the generated `AGENTS.md` safety contract.',
    '- Treat unapproved skill, MCP, dependency, and instruction-file changes as blocked until policy review.',
    `- Active profiles: ${validation.profiles.join(', ')}`,
    `- Active playbooks: ${validation.playbooks.join(', ') || 'none'}`,
    '',
    ...renderSafetyContractLines(),
    '',
  ].join('\n');
}

function renderSafetyContractLines() {
  return [
    `## ${SAFE_CODING_CONTRACT_TITLE}`,
    '',
    ...SAFE_CODING_CONTRACT_BULLETS.map((bullet) => `- ${bullet}`),
  ];
}

function dedupeFiles(files) {
  const seen = new Set();
  const out = [];
  for (const file of files) {
    if (seen.has(file.path)) continue;
    seen.add(file.path);
    out.push(file);
  }
  return out;
}

function instructionAgent(agents) {
  const claude = agents.includes('claude-code');
  const codex = agents.includes('codex') || agents.includes('universal') || agents.some((agent) => TARGET_STRENGTH[agent] === 'guidance-only');
  if (claude && codex) return 'both';
  if (claude) return 'claude';
  return 'codex';
}

function appendPackSection(content, pack, validation) {
  return [
    content.trimEnd(),
    '',
    '## yieldOS agent pack',
    '',
    `- Pack: ${pack.name}`,
    `- Target agents: ${validation.agents.join(', ')}`,
    `- Approved skills: ${validation.skills.map((item) => item.key).join(', ') || 'none'}`,
    `- Approved MCPs: ${validation.mcps.map((item) => item.key).join(', ') || 'none'}`,
    `- Active playbooks: ${validation.playbooks.join(', ') || 'none'}`,
    `- Approved oracles: ${validation.oracles.join(', ') || 'none'}`,
    '- This pack declares approved oracles. Run yieldos-oracle or CI to execute them.',
    '- Treat generated adapters as reviewed project guidance; runtime enforcement depends on the target agent.',
    '',
    ...renderSafetyContractLines(),
    '',
  ].join('\n');
}

function renderReport(pack, validation, files) {
  return [
    '# yieldOS Pack Report',
    '',
    `Pack: ${pack.name}`,
    `Policy version: ${validation.policyVersion}`,
    '',
    '## Target Agents',
    ...validation.agents.map((agent) => `- ${agent}: ${TARGET_STRENGTH[agent]}`),
    '',
    '## Profiles',
    ...validation.profiles.map((profile) => `- ${profile}`),
    '',
    '## Approved Skills',
    ...(validation.skills.length ? validation.skills.map((skill) => `- ${skill.key} (${skill.vendor || 'unknown'})`) : ['- none']),
    '',
    '## Approved MCPs',
    ...(validation.mcps.length ? validation.mcps.map((mcp) => `- ${mcp.key}: ${mcp.approved_tools.join(', ')}`) : ['- none']),
    '',
    '## Approved Oracles',
    ...(validation.oracles.length ? validation.oracles.map((oracle) => `- ${oracle}`) : ['- none']),
    '',
    '## Runtime Policy',
    `- Effective mode: ${validation.effectiveMode}`,
    `- Org overlay: ${validation.orgOverlaySha256 || 'none'}`,
    '',
    'This pack declares approved oracles. Run yieldos-oracle or CI to execute them.',
    '',
    '## Generated Files',
    ...files.map((file) => `- ${file.path}`),
    '',
    '## Warnings',
    ...(validation.warnings.length ? validation.warnings.map((warning) => `- ${warning}`) : ['- none']),
    '',
  ].join('\n');
}

function renderLock(pack, validation, files) {
  return {
    version: '0.1',
    pack: pack.name,
    generated_at: new Date().toISOString(),
    policy_version: validation.policyVersion,
    base_policy_manifest_sha256: validation.basePolicyManifestSha256,
    org_overlay_sha256: validation.orgOverlaySha256,
    effective_mode: validation.effectiveMode,
    required_oracles: validation.requiredOracles,
    profiles: validation.profiles,
    agents: validation.agents.map((agent) => ({ name: agent, enforcement: TARGET_STRENGTH[agent] })),
    skills: validation.skills.map((skill) => {
      const item = {
        key: skill.key,
        source: skill.source,
        policy_entry_sha256: skill.policy_entry_sha256,
      };
      if (skill.content_sha256) item.content_sha256 = skill.content_sha256;
      return item;
    }),
    mcps: validation.mcps,
    playbooks: validation.playbooks,
    oracles: {
      registry_version: '0.1',
      include: validation.oracles,
    },
    generated_files: files.map((file) => ({ path: file.path, sha256: sha256(file.content) })),
  };
}

function verifyInstalledFiles(projectRoot, compiled) {
  const lockFile = compiled.files.find((file) => file.label === 'pack_lock');
  const generatedFiles = compiled.files.filter((file) => file.label !== 'pack_lock');
  if (!lockFile || !fs.existsSync(lockFile.absolutePath)) {
    const activeGeneratedFile = generatedFiles.find((file) => fs.existsSync(file.absolutePath));
    if (activeGeneratedFile) {
      throw new Error(`pack lock missing while generated files exist: ${activeGeneratedFile.path}`);
    }
    return { checked: false, generatedFileCount: 0 };
  }

  const lock = JSON.parse(fs.readFileSync(lockFile.absolutePath, 'utf8'));
  if (lock.pack !== compiled.pack.name) throw new Error(`pack lock mismatch: expected ${compiled.pack.name}`);
  if (lock.policy_version !== compiled.validation.policyVersion) {
    throw new Error(`pack lock policy mismatch: expected ${compiled.validation.policyVersion}`);
  }
  const expectedLock = JSON.parse(lockFile.content);
  if (canonicalJson(lockMetadata(lock)) !== canonicalJson(lockMetadata(expectedLock))) {
    throw new Error('pack lock metadata mismatch');
  }

  const expectedByPath = new Map(generatedFiles.map((file) => [file.path, sha256(file.content)]));
  const lockedByPath = new Map((lock.generated_files || []).map((file) => [file.path, file.sha256]));

  for (const [filePath, expectedHash] of expectedByPath) {
    const lockedHash = lockedByPath.get(filePath);
    if (!lockedHash) throw new Error(`pack lock missing generated file: ${filePath}`);
    if (lockedHash !== expectedHash) throw new Error(`pack lock stale for generated file: ${filePath}`);
  }
  for (const filePath of lockedByPath.keys()) {
    if (!expectedByPath.has(filePath)) throw new Error(`pack lock contains unexpected generated file: ${filePath}`);
  }

  for (const file of generatedFiles) {
    if (!fs.existsSync(file.absolutePath)) throw new Error(`generated file missing: ${file.path}`);
    const actualHash = sha256(fs.readFileSync(file.absolutePath, 'utf8'));
    const lockedHash = lockedByPath.get(file.path);
    if (actualHash !== lockedHash) throw new Error(`generated file hash mismatch: ${file.path}`);
  }

  return { checked: true, generatedFileCount: generatedFiles.length };
}

function lockMetadata(lock) {
  return {
    version: lock.version ?? null,
    pack: lock.pack ?? null,
    policy_version: lock.policy_version ?? null,
    base_policy_manifest_sha256: lock.base_policy_manifest_sha256 ?? null,
    org_overlay_sha256: lock.org_overlay_sha256 ?? null,
    effective_mode: lock.effective_mode ?? null,
    required_oracles: Array.isArray(lock.required_oracles) ? lock.required_oracles : null,
    profiles: Array.isArray(lock.profiles) ? lock.profiles : null,
    agents: Array.isArray(lock.agents) ? lock.agents : null,
    skills: Array.isArray(lock.skills) ? lock.skills : null,
    mcps: Array.isArray(lock.mcps) ? lock.mcps : null,
    playbooks: Array.isArray(lock.playbooks) ? lock.playbooks : null,
    oracles: lock.oracles && typeof lock.oracles === 'object' ? lock.oracles : null,
  };
}

function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value)
    .sort()
    .reduce((out, key) => {
      out[key] = canonicalValue(value[key]);
      return out;
    }, {});
}

function renderPreview(projectRoot, compiled) {
  return [
    'yieldOS pack preview',
    '',
    `Pack: ${compiled.pack.name}`,
    '',
    ...compiled.files.flatMap((file) => [`--- ${displayPath(projectRoot, file.absolutePath)} ---`, file.content.trimEnd(), '']),
    'Rerun with `write` or `--write` to create these files.',
  ].join('\n');
}

function renderVerify(compiled, verification = { checked: false, generatedFileCount: 0 }) {
  const lines = [
    `yieldOS pack verified: ${compiled.pack.name}`,
    ...compiled.validation.agents.map((agent) => `- ${agent}: ${TARGET_STRENGTH[agent]}`),
  ];
  if (verification.checked) lines.push(`- active files verified: ${verification.generatedFileCount}`);
  else lines.push('- active files verified: no pack lock found');
  return lines.join('\n');
}

function renderWrite(projectRoot, compiled) {
  return [
    'yieldOS pack wrote files:',
    ...compiled.files.map((file) => `- ${displayPath(projectRoot, file.absolutePath)}`),
  ].join('\n');
}

function sha256(content) {
  return `sha256:${crypto.createHash('sha256').update(content).digest('hex')}`;
}

function displayPath(projectRoot, absolutePath) {
  const relative = path.relative(projectRoot, absolutePath);
  return relative && !relative.startsWith('..') ? relative : absolutePath;
}

function safeProjectPath(projectRoot, relativePath, label) {
  if (path.isAbsolute(relativePath)) throw new Error(`${label} must stay inside the project`);
  const resolvedRoot = path.resolve(projectRoot);
  const resolvedTarget = path.resolve(resolvedRoot, relativePath);
  const rootPrefix = resolvedRoot.endsWith(path.sep) ? resolvedRoot : `${resolvedRoot}${path.sep}`;
  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(rootPrefix)) {
    throw new Error(`${label} must stay inside the project`);
  }
  assertNoSymlinkTraversal(resolvedRoot, resolvedTarget, label);
  return resolvedTarget;
}

function assertPackLockDoesNotCollide(lockPath, filesWithoutLock) {
  const normalizedLockPath = normalizeOutputPath(lockPath);
  const collision = filesWithoutLock.find((file) => normalizeOutputPath(file.path) === normalizedLockPath);
  if (collision) throw new Error(`pack_lock must not collide with generated file: ${collision.path}`);
}

function normalizeOutputPath(filePath) {
  return path.posix.normalize(String(filePath).split(path.sep).join('/'));
}

function assertNoSymlinkTraversal(resolvedRoot, resolvedTarget, label) {
  const relative = path.relative(resolvedRoot, resolvedTarget);
  if (!relative) return;
  const parts = relative.split(path.sep).filter(Boolean);
  let current = resolvedRoot;

  for (const part of parts) {
    current = path.join(current, part);
    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch (err) {
      if (err.code === 'ENOENT') break;
      throw err;
    }
    if (stat.isSymbolicLink()) throw new Error(`${label} must not traverse a symlink`);
  }
}

function usage() {
  return [
    'Usage: yieldos-pack [preview|write|verify] [--pack yield.agent-pack.yaml] [--force]',
    '',
    'Default mode previews generated files. Use write or --write to create them.',
  ].join('\n');
}

function main() {
  const result = runPack(process.cwd());
  const stream = result.exitCode === 0 ? process.stdout : process.stderr;
  stream.write(`${result.message}\n`);
  process.exit(result.exitCode);
}

if (require.main === module) main();

module.exports = {
  compilePack,
  parseArgs,
  runPack,
  validateOracles,
  usage,
};
