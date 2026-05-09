# Changelog

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
