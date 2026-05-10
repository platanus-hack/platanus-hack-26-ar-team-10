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

For Codex, plain shells, or any host that does not run Claude Code plugin
hooks, install native Git hooks in the repo:

```bash
yieldos-git-hooks install
```

The installed `.git/hooks/pre-commit` and `.git/hooks/pre-push` call the same
code-audit gate. That makes ordinary `git commit` and `git push` commands hit
yieldOS even when the agent UI does not show Claude's hook message. The usual
Git escape hatch, `--no-verify`, can still bypass local hooks; pair with CI
verification for team enforcement.

## Red Team / Blue Team Loop

The commit path is a bounded loop, not a one-shot scan. It runs up to three fix
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

## Native Agent Mode

The deterministic loop is always the default. Teams can opt into a deeper local
agent review without giving yieldOS API keys:

```bash
YIELDOS_CODE_AUDIT_MODE=deterministic  # default
YIELDOS_CODE_AUDIT_MODE=agent-review   # deterministic scan + local agent red team
YIELDOS_CODE_AUDIT_MODE=agent-fix      # review + local agent patch proposal

YIELDOS_CODE_AUDIT_AGENT=auto          # default: prefer claude, then codex
YIELDOS_CODE_AUDIT_AGENT=claude
YIELDOS_CODE_AUDIT_AGENT=codex
YIELDOS_CODE_AUDIT_AGENT_TIMEOUT_MS=60000
```

This mode shells out to the user's already-authenticated local Claude Code or
Codex CLI. yieldOS does not ask for, store, or proxy model API keys.

The agent is not trusted to mutate the repository directly. The contract is:

1. Red-team agents return JSON findings only when they can provide the same
   exploit evidence required by deterministic detectors.
2. Blue-team agents return a unified diff patch, not file edits.
3. yieldOS rejects patches that touch files outside the audited diff.
4. yieldOS applies the patch with `git apply`, stages the touched files, and
   re-runs the deterministic audit loop.
5. The original commit remains blocked when code materially changed, so the user
   or active coding agent reviews and reruns the commit.

Agent execution is guarded with `YIELDOS_AGENT_CHILD=1`, which forces nested
yieldOS executions back to deterministic mode. This prevents a local audit agent
from recursively spawning more audit agents through its own git commands.

`agent-review` can block on an agent-only high or critical finding. `agent-fix`
uses deterministic fixes first, then asks the local agent for a patch only when
the deterministic blue team cannot safely patch the highest-severity finding.
If a team explicitly enables native agent mode and the configured local agent
fails to run, the audit is treated as incomplete and the hook blocks instead of
reporting a clean pass.

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

The latest machine-verifiable audit state is written to:

```
security/code-audit-state.json
```

The state file stores the audited diff source, range, file list, verdict,
iteration count, unresolved findings, verification summary, and a `sha256` hash
of the exact audited source diff. Generated audit files are excluded from the
diff before hashing:

- `security/code-audit-events.md`
- `security/code-audit-state.json`
- `security/oracles/**`

For commits, the hash is based on `git diff --cached --unified=80`. For push or
PR verification, it is based on the merge-base diff. The hook stages the state
file on commit audits so the evidence can travel with the source change. On
push, if the exact state is not already committed in `HEAD`, the hook writes and
stages it, then blocks the push so the evidence can be committed before CI
verifies it.

When native agent mode is enabled, the state also records:

- `agent_mode`
- `agent_provider`
- `agent_runs`
- `agent_findings`
- `agent_patch_applied`
- `agent_errors`

The state does not store raw prompts, full diffs, model transcripts, or secrets.

Machine-readable verdicts:

- `code-audit-clean`
- `code-audit-warning`
- `code-audit-fix-applied`
- `code-audit-blocked`
- `code-audit-verification-failed`

When a fix is applied, the original git command is blocked intentionally. The
working tree and staged diff now contain the fix, so the user or agent should
review and rerun the commit.

## CI Verification

CI should not call an LLM or local agent CLI. It verifies the stored state
cheaply:

```bash
node yieldOS/plugins/yieldos/scripts/code-audit/ci-verify.js --mode pr --base origin/main
```

The verifier recalculates the current diff hash, compares it with
`security/code-audit-state.json`, and reruns the deterministic red-team
detectors. It fails if the state is missing, stale, or if blocking findings
remain.
