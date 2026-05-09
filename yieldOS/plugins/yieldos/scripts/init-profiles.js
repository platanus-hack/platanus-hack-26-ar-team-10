'use strict';

const DEFAULT_PROFILES = ['non-technical-safe', 'secrets-safe', 'dependency-safe', 'code-audit', 'testing-discipline'];

const PROFILE_SECTIONS = {
  'non-technical-safe': section('Non-technical safe-coding defaults', [
    'Explain security-sensitive decisions in plain language before taking action.',
    'Treat allowed actions as passing configured checks, not as proof that the repo is safe.',
    'Stop before secrets, authentication, data deletion, paid services, deployments, or production changes unless the user clearly approves the exact action.',
  ]),
  'read-only': section('Read-only posture', [
    'Default to analysis, planning, and review before editing files.',
    'Do not modify source files, config, infrastructure, or generated artifacts unless the user explicitly asks for implementation.',
    'When asked to review, lead with findings and exact file references.',
  ]),
  'secrets-safe': section('Secrets and credentials safety', [
    'Credential files, private keys, cloud credentials, and production secrets require explicit user authorization before access.',
    'Never paste raw credentials into chat, logs, commits, PRs, or generated docs.',
    'If a secret appears in source, remove the exposure path and tell the user it must be rotated.',
  ]),
  'dependency-safe': section('Dependency safety', [
    'Ask before adding new dependencies unless the user already requested that package.',
    'Prefer standard-library or existing project utilities when they are enough.',
    'Run yieldOS dependency checks before install commands and keep `security/dependency-events.md` append-only.',
  ]),
  'code-audit': section('Source-code audit', [
    'Treat authentication, authorization, input validation, file access, outbound requests, command execution, and logging as security-sensitive paths.',
    'Run `/yieldos:audit` for explicit source review and respect commit/push code-audit blocks.',
    'Do not bypass `security/code-audit-events.md` or `security/code-audit-state.json` protections.',
  ]),
  'db-safe': section('Database safety', [
    'Default to read-only database inspection.',
    'Do not run migrations, destructive SQL, truncation, deletes, or production writes without explicit user approval.',
    'Before schema changes, explain the data impact and verification plan.',
  ]),
  'production-safe': section('Production safety', [
    'Do not deploy, mutate production infrastructure, rotate secrets, or change live data without explicit user approval.',
    'Prefer local or preview validation before production actions.',
    'When production access is required, state the exact command, environment, and rollback plan first.',
  ]),
  'network-safe': section('Network and bootstrap safety', [
    'Do not run remote shell installers, vendored code, or downloaded binaries without checking the source and explaining the risk.',
    'Prefer pinned versions and official package managers over ad hoc downloads.',
    'Avoid sending private code, diffs, logs, or secrets to third-party services unless the user requested it.',
  ]),
  'git-safe': section('Git and PR safety', [
    'Never revert user changes unless explicitly asked.',
    'Keep commits focused and do not stage unrelated files.',
    'Before opening PRs, include validation commands and any residual risk.',
  ]),
  'testing-discipline': section('Testing discipline', [
    'Run the narrowest relevant test first, then broader checks when the change touches shared behavior.',
    'Report any test that could not be run and why.',
    'Do not claim work is complete without fresh verification evidence.',
  ]),
  'cost-aware': section('Cost-aware agent work', [
    'Use scoped scans and changed-file review before full-repository AI scans.',
    'Warn before commands that can consume substantial AI Gateway credits or local subscription quota.',
    'Prefer deterministic checks when they can answer the question.',
  ]),
};

function section(title, bullets) {
  return { title, bullets };
}

module.exports = {
  DEFAULT_PROFILES,
  PROFILE_SECTIONS,
};
