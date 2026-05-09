# Code Audit

`code-audit` is the source-code security loop in yieldOS. It is separate from
the dependency gate: dependency allowlists, denylists, native equivalents, and
Category A rewrites do not participate in code-audit decisions.

## What It Gates

`code-audit` runs when the Claude Code `Bash` hook sees:

- `git commit`
- `git push`

For `git commit`, it audits the staged diff. For `git push`, it audits commits
ahead of the configured upstream branch.

## Red Team / Blue Team Loop

The commit path is a bounded loop, not a one-shot scan. It runs up to five fix
passes:

1. Collect changed code from git.
2. Red team the diff and keep only findings with concrete exploit evidence:
   attacker-controlled input, vulnerable sink, exploit path, and impact.
3. Pick the highest severity currently present.
4. Blue team one minimal deterministic patch for that severity.
5. Re-scan the patched staged diff and repeat until clean, not fixable, or the
   fix-pass limit is reached.

After patching, verification runs a final red-team scan across all remaining
findings, not just the original finding. If no high or critical finding remains,
it runs detected project checks such as `npm test` when they exist. If a high or
critical finding cannot be fixed, the loop limit is reached, or checks fail, the
hook blocks the git command.

## Default Decisions

| Severity | Commit behavior | Push behavior |
| --- | --- | --- |
| `critical` / `high` | Apply safe fix when possible, then block so the user reruns commit. Block if unresolved. | Block if unresolved. |
| `medium` | Apply safe fix when possible. Otherwise warn and log. | Block if unresolved. |
| `low` / `info` | Log only. | Log only. |

The loop never patches a lower-severity finding while a higher-severity finding
is still unresolved. For example, a manual critical secret finding blocks before
an unrelated medium redirect fix is attempted.

## Initial Finding Classes

V1 focuses on code-level security issues with clear exploit paths:

- hardcoded secrets and sensitive logging
- missing auth/authz checks
- SQL or shell injection
- path traversal and unsafe file writes/deletes
- SSRF and open redirects
- removed validation around external input
- dangerous edits to agent/security instruction files

This is not a generic code review system. Style, architecture, and dependency
policy remain outside this loop.

## Logs and Verdicts

Events are appended to:

```
security/code-audit-events.md
```

Machine-readable verdicts:

- `code-audit-clean`
- `code-audit-warning`
- `code-audit-fix-applied`
- `code-audit-blocked`
- `code-audit-verification-failed`

When a fix is applied, the original git command is blocked intentionally. The
working tree and staged diff now contain the fix, so the user or agent should
review and rerun the commit.
