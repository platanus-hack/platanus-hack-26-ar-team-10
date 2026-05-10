#!/usr/bin/env node
'use strict';

const fs = require('node:fs');

const ui = require('./ui');
const selfDefenseGate = require('./gates/self-defense-gate');
const credentialReadGate = require('./gates/credential-read-gate');
const instructionFileGate = require('./gates/instruction-file-gate');
const dependencyCommandGate = require('./gates/dependency-command-gate');
const codeAuditGate = require('./gates/code-audit-gate');

function readStdinSync() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch (_) {
    return '';
  }
}

function parseInput(raw) {
  if (!raw) return {};
  try { return JSON.parse(raw); }
  catch (_) { return {}; }
}

function projectCwd(input) {
  return input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

function shieldBlock(prefix, label) {
  return [
    '```diff',
    `${prefix} ▎ 🛡  yieldOS  ·  ${label}`,
    '```',
  ].join('\n');
}

const STAMP_BY_VERDICT = {
  'allowlist-match': shieldBlock('+', 'Validado · allowlist'),
  'verification-passed': shieldBlock('+', 'Validado · análisis OK'),
  'denylist-match': shieldBlock('-', 'Bloqueado · denylist'),
  'category-d-blocked': shieldBlock('-', 'Bloqueado · categoría crítica'),
  'verification-failed': shieldBlock('-', 'Bloqueado · señales sospechosas'),
  'build-script-not-approved': shieldBlock('-', 'Bloqueado · build script no aprobado'),
  'skill-approved': shieldBlock('+', 'Validado · skill aprobada'),
  'skill-blocked': shieldBlock('-', 'Bloqueado · skill no aprobada'),
  'mcp-approved': shieldBlock('+', 'Validado · MCP aprobado'),
  'mcp-blocked': shieldBlock('-', 'Bloqueado · MCP no aprobado'),
  'native-suggest': shieldBlock('!', 'Sugerencia · usar API nativa'),
  'category-a-rewrite': shieldBlock('+', 'Optimizado · rewrite local'),
  'injection-blocked': shieldBlock('-', 'Bloqueado · inyección detectada'),
  'self-defense-block': shieldBlock('-', 'Bloqueado · archivo protegido'),
  'code-audit-clean': shieldBlock('+', 'Validado · code audit limpio'),
  'code-audit-warning': shieldBlock('!', 'Advertencia · code audit'),
  'code-audit-fix-applied': shieldBlock('+', 'Corregido · code audit'),
  'code-audit-blocked': shieldBlock('-', 'Bloqueado · code audit'),
  'code-audit-verification-failed': shieldBlock('-', 'Bloqueado · verificación code audit'),
  'credentials-read-blocked': shieldBlock('-', 'Bloqueado · lectura de credenciales sin autorización'),
  'credentials-read-authorized': shieldBlock('+', 'Validado · lectura de credenciales autorizada'),
};

const VERDICT_PRIORITY = [
  'credentials-read-blocked',
  'code-audit-verification-failed',
  'code-audit-blocked',
  'skill-blocked',
  'mcp-blocked',
  'denylist-match',
  'category-d-blocked',
  'verification-failed',
  'build-script-not-approved',
  'injection-blocked',
  'self-defense-block',
  'code-audit-fix-applied',
  'category-a-rewrite',
  'code-audit-warning',
  'native-suggest',
  'credentials-read-authorized',
  'skill-approved',
  'mcp-approved',
  'code-audit-clean',
  'verification-passed',
  'allowlist-match',
];

function stampFor(verdict) {
  return STAMP_BY_VERDICT[verdict] || `> 🛡  yieldOS verdict: ${verdict}`;
}

function strongestVerdict(interventions) {
  let chosen = interventions[0]?.decision?.verdict || 'verification-passed';
  let chosenIdx = VERDICT_PRIORITY.indexOf(chosen);

  for (const item of interventions) {
    const verdict = item?.decision?.verdict;
    const idx = VERDICT_PRIORITY.indexOf(verdict);
    if (idx >= 0 && (chosenIdx < 0 || idx < chosenIdx)) {
      chosen = verdict;
      chosenIdx = idx;
    }
  }

  return chosen;
}

function formatCandidate(candidate = {}) {
  const name = candidate.name || candidate.type || 'tool-call';
  const version = candidate.version && candidate.version !== 'unknown' ? `@${candidate.version}` : '';
  return `${name}${version}`;
}

function emitHookOutput(interventions) {
  if (!interventions || interventions.length === 0) return;

  const chosen = strongestVerdict(interventions);
  const stamp = stampFor(chosen);
  const summary = interventions
    .map((item) => `${formatCandidate(item.candidate)} -> ${item.decision.verdict}`)
    .join('; ');

  const output = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: [
        'yieldOS processed this tool call.',
        `Verdict: ${chosen}.`,
        `Per-candidate: ${summary}.`,
        'End your reply to the user with this exact line on its own line, separated by a blank line:',
        stamp,
      ].join('\n'),
    },
  };

  process.stdout.write(JSON.stringify(output));
}

function readFileIfExists(filePath) {
  try { return fs.readFileSync(filePath, 'utf8'); }
  catch (_) { return ''; }
}

function getClassifiers() {
  return require('./classifiers');
}

function getPolicyFetcher() {
  return require('./policy-fetcher');
}

function contentForWriteOrEdit(tool, toolInput) {
  const filePath = toolInput.file_path || toolInput.path || '';
  if (tool === 'Write') {
    return {
      filePath,
      newContent: toolInput.content || '',
      oldContent: null,
    };
  }

  const oldString = toolInput.old_string || '';
  const newString = toolInput.new_string || '';
  const oldContent = readFileIfExists(filePath);
  if (oldString && oldContent.includes(oldString)) {
    return {
      filePath,
      newContent: oldContent.replace(oldString, newString),
      oldContent,
    };
  }

  return {
    filePath,
    newContent: toolInput.content || newString,
    oldContent: oldString || oldContent || null,
  };
}

function emitDecision(verdict, message, exitCode) {
  ui.writeDecision({ verdict, action: exitCode === 2 ? 'block' : 'allow', message });
  emitHookOutput([{
    candidate: { type: 'hook', name: 'yieldOS', version: 'unknown' },
    decision: { verdict },
  }]);
  process.exit(exitCode);
}

function classifyRelevantToolCall(tool, toolInput) {
  if (tool === 'Bash') {
    return {
      candidates: getClassifiers().classifyBashCommand(toolInput.command || ''),
      edit: null,
    };
  }

  if (tool === 'Write' || tool === 'Edit') {
    const edit = contentForWriteOrEdit(tool, toolInput);
    return {
      candidates: getClassifiers().classifyWriteOrEdit(edit.filePath, edit.newContent, edit.oldContent),
      edit,
    };
  }

  return { candidates: [], edit: null };
}

async function loadPolicyForRelevantCall() {
  try {
    return await getPolicyFetcher().getPolicy({ forceRefresh: false });
  } catch (err) {
    ui.writeMessage(`policy fetch failed: ${err.message}`);
    return { source: 'unavailable', policy: null };
  }
}

async function main() {
  const raw = readStdinSync();
  const input = parseInput(raw);
  const projectRoot = projectCwd(input);
  const tool = input.tool_name;
  const ti = input.tool_input || {};

  await selfDefenseGate.handleSelfDefense(input, projectRoot, { emitDecision });
  if (await credentialReadGate.handleCredentialsRead(input, projectRoot, {
    stampByVerdict: STAMP_BY_VERDICT,
  })) return;

  if (tool === 'Bash') {
    codeAuditGate.handleCodeAuditCommand(projectRoot, ti.command || '', { emitHookOutput });
  }

  const { candidates } = classifyRelevantToolCall(tool, ti);
  if (candidates.length === 0) {
    process.exit(0);
  }

  const policyResult = await loadPolicyForRelevantCall();
  const policy = policyResult.policy || {};
  const handled = await instructionFileGate.handleInstructionEdit(input, projectRoot, policy, {
    emitDecision,
    contentForWriteOrEdit,
  });
  if (handled) return;

  const { anyBlocked, interventions } = await dependencyCommandGate.processCandidates(candidates, projectRoot, policy);
  emitHookOutput(interventions);
  process.exit(anyBlocked ? 2 : 0);
}

main().catch((err) => {
  process.stderr.write(`[yieldOS:fatal] ${err.message}\n`);
  process.exit(2);
});
