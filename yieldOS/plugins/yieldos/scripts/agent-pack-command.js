#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const init = require('./init-command');
const { parseManifest } = require('./agent-pack-yaml');

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const VALID_ACTIONS = new Set(['preview', 'write', 'verify']);
const VALID_TARGETS = new Set(['claude-code', 'codex', 'cursor', 'github-copilot', 'windsurf', 'universal']);
const TARGET_STRENGTH = {
  'claude-code': 'enforced-via-yieldos-hooks',
  codex: 'instruction-and-approval-guidance',
  cursor: 'guidance-only',
  'github-copilot': 'guidance-only',
  windsurf: 'guidance-only',
  universal: 'guidance-only',
};
const SAFE_CODING_CONTRACT_TITLE = 'Non-technical user safety contract';
const SAFE_CODING_CONTRACT_BULLETS = [
  'Use deterministic yieldOS policy before model judgment.',
  'Allowed means configured checks passed, not proven safe.',
  'Do not install or enable unapproved skills, MCPs, dependencies, remote scripts, or binaries.',
  'Stop and explain in plain language when a request could expose secrets, weaken auth, delete data, spend money, deploy, or change production.',
  'Prefer reversible local changes, small diffs, existing project patterns, and fresh verification evidence.',
];
const PLAYBOOK_SKILLS = {
  'security-audit': {
    name: 'Security Audit',
    description: 'Run a phased yieldOS security audit with threat model, finding discovery, validation, attack-path analysis, and fix guidance.',
    body: [
      'Use this skill for source-code security review.',
      '',
      '## Procedure',
      '',
      '1. Build or load the repo threat model.',
      '2. Enumerate candidate findings as source/control/sink/impact tuples.',
      '3. Validate each candidate with bounded evidence and proof gaps.',
      '4. Analyze attacker reachability and severity.',
      '5. Propose the smallest invariant-preserving fix and regression proof.',
    ],
  },
  'threat-model': {
    name: 'Threat Model',
    description: 'Create or refresh repo-level security context before audits.',
    body: ['Identify assets, trust boundaries, attacker inputs, invariants, and failure modes before reviewing code.'],
  },
  'finding-discovery': {
    name: 'Finding Discovery',
    description: 'Enumerate plausible security candidates from a diff without claiming validation.',
    body: ['Return candidate source/control/sink/impact tuples and the closest existing control for each candidate.'],
  },
  validation: {
    name: 'Validation',
    description: 'Validate candidate security findings with bounded evidence.',
    body: ['Define a validation rubric, run the strongest bounded proof method, and record proof gaps explicitly.'],
  },
  'fix-finding': {
    name: 'Fix Finding',
    description: 'Patch a validated or plausible security finding with regression proof.',
    body: ['Patch the narrowest invariant boundary, add or update regression coverage, and report remaining risk.'],
  },
  'skill-review': {
    name: 'Skill Review',
    description: 'Review a proposed agent skill before it is allowlisted.',
    body: ['Check source, maintainer, content hash, bundled scripts, permissions, scope, and whether a native playbook is safer.'],
  },
  'mcp-review': {
    name: 'MCP Review',
    description: 'Review a proposed MCP server and its exposed tool surface.',
    body: ['Check transport, source or binary hash, approved tools, denied tools, auth needs, environment variables, and network scope.'],
  },
  'instruction-file-review': {
    name: 'Instruction File Review',
    description: 'Review changes to agent instruction files and rules.',
    body: ['Scan for prompt injection, policy weakening, owner intent, changed scope, secret-handling regressions, and hidden bypass instructions.'],
  },
  'agent-pack-review': {
    name: 'Agent Pack Review',
    description: 'Review yieldOS agent pack manifests, generated adapters, skills, MCPs, and pack locks.',
    body: [
      'Use this skill when a change introduces or modifies `yield.agent-pack.yaml`, generated agent instruction files, skill exports, MCP exports, or pack lockfiles.',
      '',
      '## Procedure',
      '',
      '1. Confirm the pack references `policy/` keys or reviewed playbooks instead of defining new trust decisions inline.',
      '2. Check every skill reference against `policy/skills.json`.',
      '3. Check every MCP reference against `policy/mcps.json`. Compare approved tools to the target config; extra tools mean block or restrict.',
      '4. Verify generated adapter files match the target agent real capability.',
      '5. Scan instruction text for policy weakening, prompt-injection language, secret-handling regressions, and hidden bypass instructions.',
      '6. Confirm the pack lock records policy version, generated file hashes, skill hashes where available, MCP approved tools, and generated timestamp.',
    ],
  },
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
      return { exitCode: 0, message: renderVerify(compiled), files: compiled.files, pack: compiled.pack };
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
  const absolutePackPath = path.resolve(projectRoot, packPath);
  const pack = parseManifest(fs.readFileSync(absolutePackPath, 'utf8'));
  const policy = loadPolicy(projectRoot, options);
  const validation = validatePack(pack, policy);
  const instructionFiles = renderInstructionFiles(pack, validation);
  const adapterFiles = renderAdapterFiles(pack, validation);
  const generatedFiles = [...instructionFiles, ...adapterFiles];
  const report = renderReport(pack, validation, generatedFiles);
  const lockPath = pack.evidence?.pack_lock || 'yield.agent-pack.lock.json';
  const filesWithoutLock = [
    ...generatedFiles,
    { path: '.yield/pack-report.md', content: report },
  ];
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
  return {
    skills: readPolicyFile(projectRoot, options.policyRoot, 'skills.json'),
    mcps: readPolicyFile(projectRoot, options.policyRoot, 'mcps.json'),
  };
}

function readPolicyFile(projectRoot, policyRoot, filename) {
  const candidates = [
    policyRoot && path.join(policyRoot, filename),
    path.join(projectRoot, 'policy', filename),
    path.join(PLUGIN_ROOT, 'policy-cache', filename),
  ].filter(Boolean);
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error(`policy file not found: ${filename}`);
  return JSON.parse(fs.readFileSync(found, 'utf8'));
}

function validatePack(pack, policy) {
  if (!pack || typeof pack !== 'object' || Array.isArray(pack)) throw new Error('pack must be an object');
  if (pack.kind !== 'yield.agent-pack') throw new Error('kind must be yield.agent-pack');
  if (!pack.name) throw new Error('name is required');
  const profiles = asArray(pack.profiles, 'profiles');
  for (const profile of profiles) {
    if (!init.PROFILE_SECTIONS[profile]) throw new Error(`unknown profile: ${profile}`);
  }
  const agents = activeAgents(pack.agents);
  const skills = validateSkills(pack.skills, policy.skills);
  const mcps = validateMcps(pack.mcps, policy.mcps);
  const playbooks = asArray(pack.playbooks?.include || [], 'playbooks.include');
  const warnings = agents
    .filter((agent) => TARGET_STRENGTH[agent] === 'guidance-only')
    .map((agent) => `${agent} output is guidance-only; runtime enforcement depends on that host.`);

  return {
    profiles,
    agents,
    skills,
    mcps,
    playbooks,
    warnings,
    policyVersion: policy.skills.version || policy.mcps.version || 'unknown',
  };
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
  const skill = PLAYBOOK_SKILLS[playbook] || {
    name: titleize(playbook),
    description: `Run the yieldOS ${playbook} playbook.`,
    body: [`Follow the reviewed yieldOS playbook named \`${playbook}\` and return structured evidence.`],
  };
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

function titleize(id) {
  return String(id).split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
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
    generated_files: files.map((file) => ({ path: file.path, sha256: sha256(file.content) })),
  };
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

function renderVerify(compiled) {
  return [
    `yieldOS pack verified: ${compiled.pack.name}`,
    ...compiled.validation.agents.map((agent) => `- ${agent}: ${TARGET_STRENGTH[agent]}`),
  ].join('\n');
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
  return resolvedTarget;
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
  process.stdout.write(`${result.message}\n`);
  process.exit(result.exitCode);
}

if (require.main === module) main();

module.exports = {
  compilePack,
  parseArgs,
  runPack,
  usage,
};
