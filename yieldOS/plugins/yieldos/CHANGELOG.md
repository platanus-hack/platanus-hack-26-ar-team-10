# Changelog

## yieldOS v0.5.0 - 2026-05-09

- Add pen-test hardening for credential authorization, plugin self-defense, skills/MCP policies, race handling, and npm provenance signals.
- Add cross-platform yieldOS CI coverage for plugin and policy changes.

## yieldOS v0.4.1 - 2026-05-09

- Add on-demand yieldOS audit command.
- Expose yieldos-audit executable and /yieldos:audit command.
- Log sanitized audit summaries to security/audit-events.md.

## yieldOS v0.4.0 - 2026-05-09

- Add commit/push code-audit loop with deterministic red-team and blue-team fixes
- Add optional local Claude/Codex agent review and patch validation for code audit
- Add terminal presenter for colored human labels while preserving exact machine-readable verdicts
- Add Next.js yieldOS landing app with CI validation

## yieldOS v0.3.6 - 2026-05-09

- Add root /policy as the online source of truth for yieldOS runtime policy refreshes.
- Validate root policy files in plugin-check.
- Document the online policy refresh and offline fallback path.

## yieldOS v0.3.5 - 2026-05-09

- Handle credential-looking prompts with a no-echo security directive instead of decision:block to avoid harness reprinting the original prompt.
- Detect secret-looking variable assignments with arbitrary or non-ASCII values.
- Add a guided .env remediation panel and surface authorized credential-read stamps.

## yieldOS v0.3.1 - 2026-05-09

- Block credential-looking prompts before they reach the model.
- Gate Read access to .env and other credentials paths behind an exact user authorization phrase.
- Add red diff alert panels with ASCII art and redacted credential previews.

## yieldOS v0.2.8 - 2026-05-09

- Add self-update command for Claude Code.
- Add release helper, changelog, and tag-driven GitHub Release workflow.

## yieldOS v0.2.7 - 2026-05-09

- Add colored shield stamps for allowed, blocked, optimized, and suggestion verdicts.
- Surface hook-specific context so Claude Code can show the exact yieldOS stamp after tool calls.
- Keep marketplace and plugin manifests aligned for Claude Code update detection.
