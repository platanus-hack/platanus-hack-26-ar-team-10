# Custom Agent Instructions

yieldOS can generate starter `AGENTS.md` and `CLAUDE.md` files so teams can give coding agents explicit safety defaults without changing the plugin installation flow.

This is intentionally separate from dependency security and code audit:

- dependency security gates installs, MCP additions, skills, binaries, vendoring, and instruction-file edits.
- code audit reviews source-code diffs on commit/push or explicit `/yieldos:audit`.
- custom instructions create human-readable agent guidance that the project owner can review and edit.

## Command

Use the Claude plugin command:

```text
/yieldos:init
```

The command calls the bundled executable:

```bash
yieldos-init [list] [--agent claude|codex|both] [--scope project|local|personal|org] [--profile a,b] [--write] [--force]
```

Default mode is preview-only. Add `--write` only when you want files written.

Examples:

```bash
yieldos-init
yieldos-init list
yieldos-init --agent both --scope project --profile secrets-safe,dependency-safe,code-audit --write
yieldos-init --agent claude --scope local --profile read-only,db-safe --write
yieldos-init --scope personal --profile production-safe,secrets-safe --write
```

## Scopes

| Scope | Writes | Intended use |
| --- | --- | --- |
| `project` | `AGENTS.md` and `CLAUDE.md` in the repo | Shared repo policy committed with the project. |
| `local` | `CLAUDE.local.md` only | Local Claude Code override that should not be committed. |
| `personal` | `~/.codex/AGENTS.md` and/or `~/.claude/CLAUDE.md` | User-level defaults across projects. |
| `org` | preview/export only | Managed organization rollout through the team's own distribution system. |

For project scope with `--agent both`, yieldOS writes the full content to `AGENTS.md` and a small `CLAUDE.md` that imports it. That keeps one shared source of truth in the repo. Personal scope writes full content to each agent's own home directory because cross-directory relative imports are not reliable.

Local scope is Claude-only because Claude Code has a local project instruction file convention and Codex does not share that same `CLAUDE.local.md` target.

## Profiles

Profiles are small, explicit instruction blocks:

- `read-only`
- `secrets-safe`
- `dependency-safe`
- `code-audit`
- `db-safe`
- `production-safe`
- `network-safe`
- `git-safe`
- `testing-discipline`
- `cost-aware`

The default set is `secrets-safe,dependency-safe,code-audit,testing-discipline`.

## Install Command Boundary

Do not overload `install.sh` with project instruction choices. Plugin installation is global for Claude Code; instruction files are repo, local, personal, or organization artifacts. Keeping those flows separate avoids surprising global side effects and makes generated files reviewable before they become active.

## Future Landing UI

The landing page should eventually let users choose agent target, scope, and safety profiles, then hand that configuration to the installed plugin flow. Until the product copy is settled, do not ship raw generated markdown, shell flags, or implementation-looking command blocks on the public page. Keep the webpage focused on choices and outcomes; keep exact file generation inside `/yieldos:init`.
