# CI/CD enforcement — same policy, second gate

> Status: **plan**, not implemented. This document captures the design before code.

## Why this exists

yieldOS today is agent-side. The `PreToolUse` hook catches every install the agent attempts on a developer's machine. That covers the "AI coding agent installs something unsafe" path completely — but it leaves a gap:

- A human developer types `npm install some-pkg` directly in their shell, outside Claude Code.
- A merge from another branch lands a dependency that was never seen by the gate.
- A teammate without yieldOS installed pushes a `package-lock.json` change.

The same policy that protects agents should protect those paths too. The cheapest place to enforce it is **the pull request**: every change to a lockfile passes through a CI check that runs the exact same decision tree.

## First principle: one policy, multiple enforcement points

The root `policy/` directory in this repository is the single source of truth for the current plugin. Installed plugins fetch it online-first through `policy-fetcher.js` and fall back to the shipped `policy-cache/` snapshot. A future CI gate should use the same files and must not introduce a separate CI-only policy.

```
                  ┌────────────────────────────┐
                  │  repo /policy (origin)     │
                  └──────────┬─────────────────┘
                             │
              ┌──────────────┴──────────────┐
              ↓                             ↓
   ┌────────────────────┐         ┌────────────────────┐
   │ Agent-side hook    │         │ CI gate            │
   │ (PreToolUse)       │         │ (GitHub Action)    │
   │                    │         │                    │
   │ tool_input ─→      │         │ lockfile diff ─→   │
   │   classify ─→      │         │   classify ─→      │
   │   decide ─→        │         │   decide ─→        │
   │   exit 0 / 2       │         │   pass / fail      │
   └────────────────────┘         └────────────────────┘
              │                             │
              └─────────── same core ───────┘
                  classifiers, analyzers,
                  decide.js, policy-lookup
```

## What is reusable today

The hook entrypoint (`pre-install-gate.js`) is thin. The decision pipeline lives in modules that are already pure:

| Module                  | Reusable in CI? | Why                                                                  |
| ----------------------- | --------------- | -------------------------------------------------------------------- |
| `classifiers/`          | Yes             | Operate on candidate inputs; not coupled to the hook.                |
| `analyzers/`            | Yes             | Pure analyzers over package metadata.                                |
| `decide.js`             | Yes             | Takes a candidate, returns a verdict.                                |
| `policy-fetcher.js`     | Yes             | Three-layer cache works the same in CI; the runtime cache is per-CI-runner. |
| `policy-lookup.js`      | Yes             | Pure lookups.                                                        |
| `transitive-auditor.js` | Yes             | Already does lockfile + OSV; the new CI flow is its natural home.    |
| `pre-install-gate.js`   | No              | Hook adapter — parses `tool_input`, writes hook-shaped stderr.       |
| `logger.js`             | Partial         | Same shape, different sink (workflow output, not project file).      |

## What changes

### 1. Extract the shared core

Move the candidate-→-verdict pipeline out of `pre-install-gate.js` into `scripts/core/run-decision.js`. The hook keeps owning input parsing and hook-shaped output; the new CLI wraps the same core with different I/O. No behavioral change for the existing hook path.

### 2. New CLI: `yieldos-ci`

```
scripts/ci/
├── yieldos-ci.js         CLI entrypoint
├── lockfile-diff.js      Parse lockfiles → candidates
└── reporter.js           Format verdicts (text | json | sarif | markdown)
```

Surface:

```
yieldos-ci scan-lockfile <path>            # full lockfile
yieldos-ci scan-diff <base>..<head>        # only added/changed deps
yieldos-ci scan-manifest <path>            # package.json / pyproject.toml direct deps

  --policy-url <url>     Override origin (default: shipped config)
  --format <fmt>         text | json | sarif | markdown
  --fail-on <level>      block | warning | none (default: block)
  --offline              Skip network; use shipped + runtime cache only
```

Exit codes:
- `0` — all candidates passed (or `--fail-on=none`).
- `1` — at least one candidate failed under the configured threshold.
- `2` — internal error (policy fetch failed and no cache available, malformed lockfile).

### 3. Lockfile diff adapter

`scripts/ci/lockfile-diff.js` parses lockfiles into the same candidate shape `decide.js` already consumes:

```
{ name, version, ecosystem, source: 'lockfile', requested_by: 'ci',
  introduced_in: '<commit-sha>', transitive: true|false }
```

Supported in v1: `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `requirements.txt`, `poetry.lock`, `Cargo.lock`, `go.sum`. Each has a parser shared with `transitive-auditor.js` so the post-install audit and the CI gate see lockfiles the same way.

### 4. Reporter

Three output paths matter:

- **`markdown`** — PR comment. One section per verdict type (blocked, warning, allowed). Includes verdict reason + link to the policy rule that fired.
- **`sarif`** — uploads to GitHub Code Scanning. Verdicts become security alerts in the repo's Security tab.
- **`json`** — machine-readable for downstream dashboards.

### 5. GitHub Action

`action.yml` at the repository root, composite action:

```yaml
inputs:
  policy-url:
    description: Policy origin to use
    required: false
  fail-on:
    description: block | warning | none
    default: block
  comment-on-pr:
    description: Post a markdown summary as a PR comment
    default: 'true'
  upload-sarif:
    description: Upload findings to Code Scanning
    default: 'false'
```

The action runs Node 18+, calls `yieldos-ci scan-diff` against the PR's base..head, and posts results.

## Output formats — what users see

### Markdown PR comment (the default)

```
## yieldOS — dependency review

### Blocked (1)
- `event-stream@3.3.6` — denylist match (known supply-chain incident, ref: GHSA-...)

### Warning (2)
- `lodash@4.17.20` — outdated; latest is 4.17.21 (CVE-2021-23337 patched there)
- `chalk@5.0.0` — Category A (rewrite-eligible). Agent should localize.

### Allowed (47)
… 47 candidates passed allowlist or analysis. Full list in the workflow log.
```

### Workflow output (compact)

```
yieldOS scanned 50 candidates against base..head
  blocked   1   (event-stream@3.3.6)
  warning   2
  allowed   47
::error::yieldOS blocked 1 dependency. See PR comment for details.
```

## Logging

CI does **not** write to `<project>/security/dependency-events.md`. That file is for local devs; the CI sink is:

- Workflow logs (always).
- A workflow artifact `yieldos-events.jsonl` with the same shape as the local log, so an organization-level dashboard can ingest both sources.
- Optionally, SARIF to Code Scanning.

## Trade-offs

- **No transitive-only-block mode in v1.** A lockfile change introduces both direct and transitive deps; we treat them uniformly. Teams that want to allow transitive denylist matches (rare) can use `--fail-on=warning`.
- **Policy fetch fails closed in CI.** Unlike the agent path which falls back to the shipped cache, CI runs in clean environments and cache-miss is the norm. A failed origin fetch + no cache → exit 2. Teams pin a policy version via `policy-url` if they need stability.
- **No write access in v1.** The CI gate is read-only: it inspects, it does not mutate the lockfile or open follow-up PRs. The Category-A rewrite path stays agent-side.

## What is explicitly out of scope

- Running on developers' machines as a pre-commit hook. That's possible later; it duplicates the agent gate for non-agent workflows but adds friction.
- Replacing `npm audit`, Snyk, Dependabot. yieldOS gates on policy intent; those gate on known CVEs. Both are useful.
- Auto-PR to bump versions. yieldOS never modifies dependency code; that is a separate product (Renovate/Dependabot).

## Phases

| Phase | Scope                                                                               | Estimate |
| ----- | ----------------------------------------------------------------------------------- | -------- |
| 1     | Extract `core/run-decision.js`. Refactor hook to use it. Tests stay green.          | 0.5 day  |
| 2     | `yieldos-ci scan-lockfile` for `package-lock.json` + `requirements.txt`. Text output. | 1 day    |
| 3     | `scan-diff` against git refs. Markdown reporter.                                    | 0.5 day  |
| 4     | GitHub Action + PR comment.                                                         | 0.5 day  |
| 5     | Remaining ecosystems (pnpm, yarn, bun, poetry, cargo, go).                          | 1 day    |
| 6     | SARIF + Code Scanning integration.                                                  | 0.5 day  |

Total: ~4 days for a complete CI gate that mirrors the agent gate.
