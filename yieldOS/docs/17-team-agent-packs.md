# Team Agent Packs

Status: implemented for Claude/Codex instructions, Cursor/Copilot/Windsurf guidance adapters, repo-local skills, lock verification, and the web manifest builder
Last researched: 2026-05-09

This document defines the product layer behind the landing-page promise:

> Code without fear with your team and company rules.

The pack layer should let a team choose approved skills, MCPs, safety profiles, guidelines, and playbooks once, then export the correct files for the agents they use. It is not the vector database. It is the reviewable source-of-truth bundle that decides what becomes active.

## Why This Matters

AI coding tools are converging on the same primitives:

- persistent instructions such as `AGENTS.md`, `CLAUDE.md`, Cursor rules, GitHub Copilot instructions, and Windsurf rules
- triggered procedures such as Agent Skills, Claude skills, Windsurf skills, prompt files, and workflows
- tool surfaces such as MCP servers, local scripts, hooks, and shell permissions
- evidence surfaces such as lockfiles, audit logs, code-audit state, and receipts

Without packaging, every developer ends up with a different agent setup. One teammate has the security checklist, another has the MCP server, another has an outdated rule, and a non-technical user has no way to know which setup is safe.

yieldOS should turn that into a reviewable pack:

```text
company rules + approved skills + approved MCPs + playbooks + profiles
        |
        v
yield.agent-pack.yaml
        |
        v
generated AGENTS.md / CLAUDE.md / Cursor / Copilot / Windsurf / lock / report
        |
        v
runtime gates where supported, guidance everywhere else
```

Current implementation:

- `yieldos-pack verify --pack yield.agent-pack.yaml` validates the pack. If generated files already exist, it requires the pack lock and verifies lock metadata plus generated file hashes against the active repo files.
- `yieldos-pack preview --pack yield.agent-pack.yaml` renders every generated file for review.
- `yieldos-pack write --pack yield.agent-pack.yaml` writes reviewed output and refuses to overwrite existing files unless `--force` is passed.
- `/agent-packs` in the landing app builds and downloads a `yield.agent-pack.yaml` source manifest for a team to put at a repo root.
- Generated instructions, rules, and skills include a non-technical user safety contract: deterministic policy before model judgment, allowed does not mean proven safe, unapproved skills/MCPs/dependencies/scripts/binaries stay blocked, and the agent must stop and explain plainly before secret, auth, data deletion, cost, deployment, or production-risk work.

## External Signals

Microsoft APM is the closest packaging reference. It uses a manifest and lockfile model for agent configuration, including instructions, skills, prompts, hooks, plugins, and MCP servers. Its useful lesson for yieldOS is not to copy its entire package manager. The lesson is that agent configuration needs a manifest, a lockfile, native adapters, and audit output.

Microsoft Agent Governance Toolkit is the closest governance reference. It validates the idea that a governance layer should sit between an agent and the action it wants to take, evaluate the action against deterministic policy, and record evidence. Its useful lesson for yieldOS is the action boundary, especially MCP/tool-call governance.

OpenAI Codex, Windsurf, and the Agent Skills standard all validate progressive disclosure: keep only skill names/descriptions in always-on context, then load the full skill when the task triggers it. This is the mechanism that can reduce token use without weakening the workflow.

Cursor, GitHub Copilot, Claude Code, Codex, and Windsurf each expose different controls. yieldOS should normalize the source material, then be honest about adapter strength:

| Target | Pack output | Enforcement strength |
| --- | --- | --- |
| Claude Code | `CLAUDE.md`, `AGENTS.md`, `.claude/skills/**` | strongest today through the installed yieldOS plugin hooks/settings; generated markdown is guidance |
| Codex | `AGENTS.md`, `.agents/skills/**` | instructions, approvals, and progressive-disclosure skills; runtime enforcement depends on Codex config |
| Cursor | `.cursor/rules/*.mdc`, optional `AGENTS.md` | host-native guidance only; use yieldOS verification or CI for deterministic enforcement |
| GitHub Copilot | `.github/copilot-instructions.md`, `.github/instructions/*.instructions.md`, `.github/prompts/*.prompt.md`, `AGENTS.md` | repo guidance and review context, not a hard local gate |
| Windsurf | `.windsurf/rules/**`, `.windsurf/skills/**`, `AGENTS.md` | guidance and progressive-disclosure skills; enterprise/system enforcement requires admin deployment |
| Universal | `AGENTS.md`, `REVIEW.md`, `CONVENTIONS.md` | portable guidance only |

## Core Object

Use a dedicated pack manifest:

```yaml
version: 0.1
kind: yield.agent-pack
name: company-safe-defaults
description: Safe coding defaults for team agent work.

profiles:
  - secrets-safe
  - dependency-safe
  - code-audit
  - git-safe

agents:
  claude-code:
    enabled: true
    outputs:
      - AGENTS.md
      - CLAUDE.md
      - .claude/skills/security-audit/SKILL.md
  codex:
    enabled: true
    outputs:
      - AGENTS.md
      - .codex/rules/yieldos.rules
  cursor:
    enabled: false
    outputs:
      - .cursor/rules/yieldos-security.mdc
      - .cursor/skills/security-audit/SKILL.md
  github-copilot:
    enabled: false
    outputs:
      - .github/copilot-instructions.md
      - .github/instructions/yieldos-security.instructions.md
  windsurf:
    enabled: false
    outputs:
      - .windsurf/rules/yieldos-security.md
      - .windsurf/skills/security-audit/SKILL.md

skills:
  allow:
    - key: skill:dependency-gate
      source: policy/skills.json
  require_review:
    - permission_scope: network
    - permission_scope: privileged

mcps:
  allow:
    - key: mcp:filesystem
      approved_tools:
        - read_file
        - list_directory
        - search_files
  default_unlisted: deny

playbooks:
  include:
    - security-audit
    - skill-review
    - mcp-review
    - instruction-file-review

evidence:
  decisions_dir: .yield/decisions
  audit_state: security/code-audit-state.json
  pack_lock: yield.agent-pack.lock.json
```

The pack references policy entries instead of redefining policy. This keeps `policy/` as the deterministic authority and keeps the pack as the deployment surface.

## Pack Lock

Every generated pack should produce a lockfile:

```json
{
  "version": "0.1",
  "pack": "company-safe-defaults",
  "generated_at": "2026-05-09T00:00:00Z",
  "policy_version": "0.4.0",
  "profiles": ["secrets-safe", "dependency-safe", "code-audit", "git-safe"],
  "skills": [
    {
      "key": "skill:dependency-gate",
      "source": "policy/skills.json",
      "policy_entry_sha256": "sha256:..."
    }
  ],
  "mcps": [
    {
      "key": "mcp:filesystem",
      "approved_tools": ["read_file", "list_directory", "search_files"]
    }
  ],
  "generated_files": [
    {
      "path": "AGENTS.md",
      "sha256": "sha256:..."
    }
  ]
}
```

The lockfile gives teams the forensic answer: which agent rules and capabilities were generated and verified before this repo accepted agent work? For generated skill folders, the actual generated file hash appears under `generated_files`. For externally approved skills, the lock records the policy entry hash and only records `content_sha256` when the policy entry itself contains a reviewed content hash.

## Product UX

The first user-facing flow can stay simple:

1. Choose safety profiles.
2. Choose target agents.
3. Choose approved skills and MCPs from policy-backed lists.
4. Preview generated files and warnings.
5. Download or write the pack.
6. Run `yieldos-pack verify --pack yield.agent-pack.yaml`.
7. Run `yieldos-pack write --pack yield.agent-pack.yaml` when ready.

Landing-page copy should be careful:

> Package your team's agent rules. Choose approved skills, MCPs, safety profiles, and guidelines. yieldOS exports reviewable `AGENTS.md`, `CLAUDE.md`, and target-specific rule files, then enforces the risky parts at runtime where hooks, CI, or managed policy are active.

Avoid:

> Works equally across every coding agent.

Better:

> One source of truth, host-native outputs for each agent, strongest enforcement where the host exposes hooks, CI, or managed policy controls.

For the non-technical builder story, the pack should behave like a safety rail rather than an expert-only checklist. The generated files repeat the same contract in every adapter because a user may run Cursor, Copilot, Claude Code, Codex, or Windsurf without understanding which file the host loaded:

- deterministic yieldOS policy decides before model judgment
- "allowed" means configured checks passed, not "proven safe"
- unapproved skills, MCPs, dependencies, remote scripts, and binaries stay blocked
- the agent stops and explains in plain language before actions that touch secrets, auth, data deletion, spend, deployment, or production
- changes stay small, reversible, and verified

The builder should expose the full reviewed safety-profile catalog, but the approved-skill list should stay curated. Adding arbitrary custom skills from the browser is not safe enough yet because the browser cannot prove source, scripts, permissions, or content hashes. The right path is a review flow that turns a custom skill into an explicit `policy/skills.json` entry first.

## Dogfooding Pack

yieldOS should run its own pack before offering packs to users.

Suggested internal pack:

```yaml
version: 0.1
kind: yield.agent-pack
name: yieldos-internal-security
profiles:
  - secrets-safe
  - dependency-safe
  - code-audit
  - network-safe
  - git-safe
agents:
  claude-code:
    enabled: true
  codex:
    enabled: true
playbooks:
  include:
    - security-audit
    - skill-review
    - mcp-review
    - instruction-file-review
    - agent-pack-review
```

Dogfooding goal:

- our agents load the same security workflows we sell
- every pack edit triggers `instruction-file-review`
- every skill or MCP addition triggers `skill-review` or `mcp-review`
- generated files are checked into the repo only after review
- evidence shows whether the pack reduced repeated repo reading and prompt drift

Do not create active root agent files automatically during dogfooding. Start with preview output and reviewable diffs.

## Vector DB Boundary

The vector database can recommend playbooks, prior findings, and prior pack decisions. It must not activate skills, approve MCPs, or write policy.

Allowed vector outputs:

- "similar finding families"
- "recommended playbook ids"
- "prior policy decision references"
- "likely adapter files to generate"
- "verification commands used before"

Forbidden vector outputs:

- direct allowlisting
- direct denylist deletion
- active MCP install
- active skill install
- instruction weakening
- secret-bearing evidence

The pack compiler can consume recommendations only after they resolve to explicit manifest entries reviewed by policy.

## Implementation Status

Implemented:

- `yield.agent-pack.yaml` and `yield.agent-pack.lock.json` are documented and generated.
- `yieldos-pack` supports `verify`, `preview`, and `write`; `verify` requires a pack lock when generated files are active and checks lock metadata plus file hashes.
- Generated outputs include `AGENTS.md`, `CLAUDE.md`, `.yield/pack-report.md`, Cursor rules, GitHub Copilot instructions/prompts, Windsurf rules, and repo-local skill folders for Claude, Codex-style agents, Cursor, and Windsurf. Cursor/Copilot/Windsurf outputs are guidance unless paired with yieldOS verification, CI, or managed host policy.
- Pack references are validated against `policy/skills.json` and `policy/mcps.json`.
- `agent-pack-review` is emitted as a repo-local skill when included in the pack.
- The landing app includes `/agent-packs`, a browser-side builder that downloads `yield.agent-pack.yaml`.

Still intentionally out of scope:

- Global installation into `~/.agents/skills`.
- Automatic installation of external MCP servers.
- Zip exports with generated files from the browser.
- Browser upload of arbitrary custom skills. Teams can package custom skills only after policy review captures source URL, content hash, bundled scripts, permission scope, and owner rationale.
- Organization admin, exception workflows, and remote policy sync.

Those belong after we prove the repo-local pack loop is useful and low-friction.

The smallest credible demo:

```bash
yieldos-pack preview --pack yield.agent-pack.yaml
yieldos-pack write --pack yield.agent-pack.yaml
```

Preview should show:

- files that would be generated
- profiles included
- skills approved, blocked, or requiring review
- MCP servers and approved tools
- enforcement or guidance boundary per target agent
- evidence paths

## Sources

- Microsoft APM: https://microsoft.github.io/apm/
- Microsoft APM governance: https://microsoft.github.io/apm/enterprise/governance-guide/
- Microsoft Agent Governance Toolkit: https://github.com/microsoft/agent-governance-toolkit
- OpenAI Codex skills: https://developers.openai.com/codex/skills
- OpenAI Codex AGENTS.md: https://developers.openai.com/codex/guides/agents-md
- OpenAI Codex rules: https://developers.openai.com/codex/rules
- OpenAI Codex approvals and security: https://developers.openai.com/codex/agent-approvals-security
- Claude Code hooks: https://code.claude.com/docs/en/hooks
- Claude Code settings: https://code.claude.com/docs/en/configuration
- Cursor rules: https://docs.cursor.com/en/context/rules
- Cursor MCP CLI: https://docs.cursor.com/cli/mcp
- GitHub Copilot custom instructions: https://docs.github.com/en/copilot/how-tos/custom-instructions/adding-repository-custom-instructions-for-github-copilot
- Windsurf skills: https://docs.windsurf.com/windsurf/cascade/skills
- Windsurf memories and rules: https://docs.windsurf.com/windsurf/cascade/memories
- Agent Skills standard: https://agentskills.io/
