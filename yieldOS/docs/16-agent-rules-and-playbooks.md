# Agent Rules and Playbooks

Status: planning and research
Last researched: 2026-05-09

This document turns the current agent-rules ecosystem into a yieldOS plan. The goal is not to make the model "think harder" on every task. The goal is to give agents small, durable contracts that trigger the right security workflow with less context, fewer repeated reads, and clearer evidence.

## Thesis

yieldOS should treat rules, skills, and memories as different layers:

- `policy/` is the deterministic source of truth for allow, block, rewrite, and review decisions.
- `playbooks/` is the reviewed procedure layer: how an agent should audit, validate, fix, or review something.
- generated adapters are per-agent exports such as `AGENTS.md`, `CLAUDE.md`, `.cursor/rules`, `.cursor/skills`, `.github/instructions`, `.windsurf/rules`, and `REVIEW.md`.
- retrieval can help find similar prior findings, but it must not become the authority that decides whether something is safe.

The vector database is useful after we define the records it retrieves. Without a playbook and evidence schema, embeddings become a pile of anecdotes. With a schema, they become acceleration: "show me prior SSRF fixes in Next.js route handlers with the same source/sink/control tuple."

## External Signals

| System | Durable guidance | Triggered procedure | Enforcement or control | yieldOS lesson |
| --- | --- | --- | --- | --- |
| OpenAI Codex Security plugin | phase skills and final report contracts | threat model, finding discovery, validation, attack-path analysis, fix finding | local phase artifacts and explicit proof gaps | model security as a phase machine, not one giant review prompt |
| Cursor | `AGENTS.md`, `.cursor/rules/*.md` or `.mdc` | `.cursor/skills/**/SKILL.md` | CLI permissions, hooks, MCP tool approval | keep always-on rules short; use globs and skills for scope |
| Claude Code | `CLAUDE.md`, nested/project instructions | `.claude/skills/**/SKILL.md` | settings, hooks, skill `allowed-tools` | progressive disclosure is the token-saving primitive |
| GitHub Copilot | `.github/copilot-instructions.md`, `.github/instructions/*.instructions.md`, `AGENTS.md` | prompt files and custom agents | coding-agent environment, firewall allowlist, review instructions | generate GitHub-native review and agent instructions from the same source |
| Windsurf | rules and `AGENTS.md` | skills and workflows | memories are local context, enterprise rules can be managed | promote useful memory into versioned rules; do not treat memory as policy |
| Agent Skills standard | `SKILL.md` folder format | scripts, references, assets loaded on demand | client-specific invocation controls | one playbook can be exported to several agents |

## Design Decision

Build a canonical playbook layer before building a large findings database.

The first implementation should generate or curate files that agents already understand:

1. A thin root `AGENTS.md` for universal, portable invariants.
2. Optional scoped adapters for Cursor, Claude Code, GitHub Copilot, Windsurf, Gemini, Cline, Continue, Zed, Devin, and Aider.
3. Skill-shaped playbooks for heavy procedures.
4. Permission contracts that map to hooks, CLI permissions, MCP approvals, or CI checks when the target agent supports them.

The generated files should be reviewable and committed like code. They should not be hidden local memories.

## Canonical Playbook Record

Each reviewed playbook should have these fields before it is exported to agent-specific formats:

```yaml
id: security-audit
version: 0.1.0
status: draft | active | deprecated
scope: repo | directory | file-glob | task
activation: always | glob | model-selected | manual
target_agents:
  - codex
  - claude-code
  - cursor
  - github-copilot
source_systems:
  - codex-security
source_urls: []
permission_contract:
  allowed_tools: []
  ask_before_tools: []
  denied_tools: []
  network: deny | allowlisted | unrestricted
  writable_paths: []
  secret_policy: deny | exact-user-authorization | allowed
required_inputs: []
procedure: []
output_contract: []
validation: []
token_budget_hint: small | medium | high | explicit-full-scan
last_verified: "2026-05-09"
```

The `permission_contract` matters as much as the text. If a playbook says "audit code" but allows unrestricted writes, secret reads, and arbitrary MCP calls, it is not a safe playbook.

## Token And Speed Model

The useful performance model is simple:

- Always-on rules should be tiny. They are paid for every time.
- Scoped rules should use directory, glob, or file patterns.
- Heavy procedures should be skills or manual commands so their full text loads only when needed.
- Long references should live under `references/` and be loaded only by the active playbook.
- Deterministic gates should answer without model tokens wherever possible.
- MCP tools should be disabled or hidden unless the active playbook needs them.
- Generated ignore files should keep build artifacts, vendored code, logs, fixtures, generated clients, and large snapshots out of agent indexing.

The win is not "use fewer tokens at all costs." The win is spending the expensive context only when the task has crossed a real security boundary.

## First Playbooks To Encode

These are the immediate yieldOS playbooks worth encoding:

| Playbook | Activation | Required output | Why it helps |
| --- | --- | --- | --- |
| `security-audit` | manual or commit/push hook | threat model, candidates, validation, attack path, final result | separates security review into evidence-preserving phases |
| `threat-model` | repo setup, audit start | assets, boundaries, attacker inputs, invariants, failure modes | avoids rebuilding project security context every diff |
| `finding-discovery` | diff audit | source/control/sink/impact candidate tuples | reduces vague findings and makes validation cheaper |
| `validation` | after candidates exist | rubric, method, evidence, proof gap | prevents "validated by vibes" reports |
| `fix-finding` | after a validated or plausible finding | smallest invariant-preserving fix plus regression proof | turns findings into safe patches |
| `skill-review` | skill/plugin install or policy PR | source, maintainer, content hash, tools, permissions, scope | makes third-party skills reviewable before allowlisting |
| `mcp-review` | MCP add or policy PR | transport, binary/source hash, tool surface, auth/env needs | keeps MCPs from becoming invisible privileged tools |
| `instruction-file-review` | `AGENTS.md`, `CLAUDE.md`, rules edits | injection scan, scope, owner intent, changed behaviors | protects the layer that tells agents what to do |

## Findings Database Stance

Build the database, but make it evidence-first and retrieval-only at the start.

Suggested finding record:

```yaml
finding_family: ssrf | authz | injection | path-traversal | secret-exposure | supply-chain
language:
framework:
source:
sink_or_broken_control:
preconditions:
impact:
validation_method:
fix_pattern:
regression_test:
agent_rule_change:
policy_change:
repo_shape:
confidence:
references:
```

The vector index should point at records like this, not raw transcripts. Raw chat logs, secrets, private diffs, terminal dumps, and full dependency source snapshots should be redacted or excluded.

## Immediate Build Order

1. Land `playbooks/` as a human-reviewed registry.
2. Document the `policy/` schema for skills and MCPs before importing more third-party entries.
3. Convert the Codex Security phase model into first-class yieldOS playbooks.
4. Add adapters that can emit target-specific files from one canonical playbook.
5. Add a small evidence store for validated findings and fixes.
6. Add embeddings over the evidence store only after records have stable fields.
7. Benchmark token use: baseline free-form audit versus scoped playbook audit versus playbook plus retrieval.

## Sources

- Cursor rules: https://cursor.com/docs/rules.md
- Cursor rules: https://docs.cursor.com/en/context/rules
- Cursor MCP CLI: https://docs.cursor.com/cli/mcp
- Claude Code skills: https://code.claude.com/docs/en/skills
- Claude Code hooks: https://code.claude.com/docs/en/hooks
- Claude Code settings: https://code.claude.com/docs/en/configuration
- GitHub Copilot response customization: https://docs.github.com/en/copilot/concepts/prompting/response-customization
- GitHub Copilot allowlist reference: https://docs.github.com/en/copilot/reference/copilot-allowlist-reference
- Windsurf skills: https://docs.windsurf.com/windsurf/cascade/skills
- Windsurf memories and rules: https://docs.windsurf.com/windsurf/cascade/memories
- Agent Skills standard: https://agentskills.io/
