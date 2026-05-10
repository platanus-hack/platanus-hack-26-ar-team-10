# yieldOS

**Executable security contracts for AI coding agents.**

yieldOS is a Claude Code plugin and CI-verifiable, oracle-driven security harness that intercepts risky agent actions, then accepts or rejects sensitive changes through scoped security contracts. A contract states what must be true, a counterexample tries to break it, and an oracle decides whether the evidence is `pass`, `fail`, or `unknown`. It also exposes `/yieldos:audit` for on-demand source-code review, `/yieldos:init` for preview-first agent instruction generation, `/yieldos:pack` for policy-validated team agent packs, `/yieldos:oracle` for oracle discovery, `yieldos-oracle run ...` for scoped checks, `/yieldos:oracle-demo` for a visible counterexample proof, and `/yieldos:pentest` for an explicit red-team / blue-team review loop.

The model can propose. The oracle decides.

→ Full design documentation in [`docs/`](docs/README.md).

---

## Why

AI coding agents install code on behalf of users. Every `npm install`, every `pip install`, every skill or MCP added is a trust decision that the user usually never sees. The history of supply-chain attacks (`event-stream`, `node-ipc`, `ua-parser-js`, `colors`, `crossenv`) shows the cost of getting that decision wrong.

yieldOS makes trust decisions **before** risky work is accepted, against policy and executable evidence that can be checked without model calls.

→ More: [docs/01-philosophy.md](docs/01-philosophy.md).

---

## Quickstart

```bash
# 1. Download and verify the pinned release installer
curl -fsSLO https://github.com/yieldos/yieldos/releases/download/yieldos--v0.11.1/install.sh
curl -fsSLO https://github.com/yieldos/yieldos/releases/download/yieldos--v0.11.1/checksums.txt
shasum -a 256 -c checksums.txt --ignore-missing
sh install.sh --dry-run
sh install.sh
```

Manual install:

```bash
claude plugins marketplace add yieldos/yieldos
claude plugins install yieldos@yieldos

# Optional: run the test suite
cd yieldOS/plugins/yieldos
node --test tests/*.test.js
```

That's it. yieldOS auto-runs on `SessionStart`, `UserPromptSubmit`, and on every `Bash` / `Write` / `Edit` / `Read` tool call.

Requires Node.js 18+ for `fetch` and `node:test`.

---

## Updates and releases

Users can update yieldOS from Claude Code:

```text
/yieldos:update
```

Equivalent terminal commands:

```bash
claude plugins marketplace update yieldos
claude plugins update yieldos@yieldos
```

After updating, run `/reload-plugins` or restart Claude Code so hooks switch from the old cache path to the new version.

Supported adapters, data flows, and claim boundaries are documented in [docs/enterprise-boundaries.md](docs/enterprise-boundaries.md).

Maintainers should release through the version helper from the repository root:

```bash
node scripts/release.mjs bump patch --note "Describe the change"
node scripts/plugin-check.mjs
(cd yieldOS/plugins/yieldos && node --test tests/*.test.js)
git add .
git commit -m "Release yieldOS vX.Y.Z"
git tag yieldos--vX.Y.Z
git push origin main yieldos--vX.Y.Z
```

That keeps the root marketplace, nested marketplace, plugin manifest, changelog, and GitHub Release tag aligned.

---

## Code audit

yieldOS also audits source-code changes before `git commit` and `git push`.
This is separate from dependency security: dependency allowlists, denylists,
native equivalents, and rewrites do not decide code-audit outcomes.

The code-audit loop red-teams the changed code, applies one minimal deterministic
blue-team fix per pass, re-scans after each patch, and stops after a hard limit.
It logs the result to `security/code-audit-events.md` and writes
machine-verifiable state to `security/code-audit-state.json`.

For deeper review, teams can opt into native local-agent mode with
`YIELDOS_CODE_AUDIT_MODE=agent-review` or `agent-fix`. That uses the user's
already-authenticated Claude Code or Codex CLI to propose findings or patches,
then yieldOS validates and verifies the result deterministically. CI never needs
an LLM or model API key.

Detail: [docs/10-code-audit.md](docs/10-code-audit.md).

## Oracles

List available oracles:

```text
/yieldos:oracle list
```

Run the missing-auth proof demo:

```text
/yieldos:oracle-demo missing-auth
```

Security contracts normalize existing checks into scoped `pass`, `fail`, and `unknown` evidence. Oracles execute those contracts. For sensitive actions, `unknown` blocks by default. The first counterexample-driven security contract proves one class: an unauthenticated request to a sensitive route must return `401` or `403`, with baseline-fail plus fixed-pass evidence.

Detail: [docs/19-oracle-driven-harness.md](docs/19-oracle-driven-harness.md).

## Audit command

Run changed-code source review from Claude Code:

```text
/yieldos:audit
```

The default maps to Deepsec PR mode, `deepsec process --diff origin/main`.
Use `/yieldos:audit --staged`, `--working`, `--base <ref>`, or explicit
`--full` for full-repo scans. Deepsec is external tooling; `/yieldos:audit
setup` prints setup instructions if it is not already installed.

Audit command summaries are appended to `security/audit-events.md` without raw
findings, prompts, full diffs, or secrets.

Detail: [docs/13-audit-command.md](docs/13-audit-command.md).

---

## Init command

Generate reviewable `AGENTS.md` and `CLAUDE.md` safety instructions:

```text
/yieldos:init
```

Default mode previews the generated files. Add `--write` only after reviewing the output.

Detail: [docs/14-custom-instructions.md](docs/14-custom-instructions.md).

## Team agent packs

Compile a reviewed `yield.agent-pack.yaml` manifest into reviewable host-native guidance files:

```text
/yieldos:pack preview --pack yieldOS/packs/yieldos-internal-security/yield.agent-pack.yaml
```

From a terminal:

```bash
yieldos-pack verify --pack yieldOS/packs/yieldos-internal-security/yield.agent-pack.yaml
yieldos-pack preview --pack yieldOS/packs/yieldos-internal-security/yield.agent-pack.yaml
yieldos-pack write --pack yield.agent-pack.yaml
```

The compiler validates referenced skills, MCP tool surfaces, playbooks, and oracle IDs against policy before writing. Output can include `AGENTS.md`, `CLAUDE.md`, Cursor rules, GitHub Copilot instructions, Windsurf rules, repo-local skill folders, `.yield/pack-report.md`, and `yield.agent-pack.lock.json`. `yieldos-pack verify` validates the manifest; once generated files are active, it requires the pack lock and checks lock metadata plus recorded file hashes. Packs declare approved oracles, but they do not execute them by themselves; run `yieldos-oracle`, installed hooks, or CI verification for enforcement. Claude Code has the strongest runtime enforcement through installed yieldOS hooks; other adapters are host-native guidance until paired with yieldOS verification, CI, or managed host policy.

Detail: [docs/17-team-agent-packs.md](docs/17-team-agent-packs.md).

## Pentest loop

Run a visible red-team / blue-team loop with persistent local lessons:

```text
/yieldos:pentest --max-rounds 3 --converge 2 --dry-run
```

For longer audits, `yieldos-pentest launch` starts a detached run,
`yieldos-pentest watch` tails the colored terminal feed, and
`yieldos-pentest stop` clears the background process. Chat-visible red/blue
events are written through markdown diff blocks instead of raw ANSI escapes.
State is written under `security/pentest-memory.md`,
`security/pentest-history.json`, `security/pentest-state.json`,
`security/pentest-live.log`, and `security/pentest-events.jsonl`.

For a browser view, start the local dashboard:

```bash
yieldos-pentest dashboard --start
```

It serves the live feed at `http://127.0.0.1:5473` by default and can be
managed with `yieldos-pentest dashboard --status` and
`yieldos-pentest dashboard --stop`. Session-start dashboard launch stays
opt-in only through `YIELDOS_DASHBOARD_AUTO=1` or `YIELDOS_DASHBOARD=auto`.

Detail: [docs/15-pentest-loop.md](docs/15-pentest-loop.md).

---

## High-level flow

```
                  ┌───────────────────────────────────┐
                  │  Tool call (Bash / Write / Edit)   │
                  └───────────────┬───────────────────┘
                                  ↓
                ┌─────────────────┴────────────────────┐
                │  PreToolUse hook                      │
                │  ┌─────────────────────────────────┐ │
                │  │ 1. Self-defense check            │ │
                │  │ 2. Refresh policy (online-first) │ │
                │  │ 3. Classify candidate            │ │
                │  │ 4. Run 5-check decision          │ │
                │  └─────────────────────────────────┘ │
                └─────────┬─────────────────┬──────────┘
                       allow             block (exit 2)
                          │                 │
                          ↓                 ↓
                Action runs        User sees one-line msg
                          │
                          ↓
                ┌──────────────────────────────────────┐
                │  PostToolUse hook                     │
                │  ┌────────────────────────────────┐  │
                │  │ 1. Detect lockfile changes     │  │
                │  │ 2. Audit transitives           │  │
                │  │    - whitelist match           │  │
                │  │    - 10-day rule               │  │
                │  │    - OSV CVE check             │  │
                │  │    - denylist alerts           │  │
                │  └────────────────────────────────┘  │
                └──────────────────────────────────────┘
```

→ Detail: [docs/05-decision-flow.md](docs/05-decision-flow.md).

---

## The 5-check decision flow

```
                         ┌──────────────────┐
                         │ Install candidate │
                         └────────┬─────────┘
                                  ↓
                  CHECK 1 ─ native equivalent?
                                  │
                          yes ────┴──── no
                           │            │
                       ┌───┘            ↓
                 BLOCK + suggest   CHECK 2 ─ allowlist match?
                                          │
                                  yes ────┴──── no
                                   │            │
                               ┌───┘            ↓
                              ALLOW       CHECK 3 ─ denylist match?
                              silent              │
                                          yes ────┴──── no
                                           │            │
                                       ┌───┘            ↓
                                      BLOCK    CHECK 4 ─ exotic?
                                      + log    (binary / vendoring / git+)
                                                       │
                                              yes ─────┴──── no
                                               │             │
                                           ┌───┘             ↓
                                          BLOCK   CHECK 5 ─ Category D?
                                          + log         (crypto/auth/orm/…)
                                                              │
                                                     yes ─────┴──── no
                                                      │             │
                                                  ┌───┘             ↓
                                                 BLOCK         Category A
                                                 + PR-msg     or threshold?
                                                                    │
                                                           yes ─────┴──── no
                                                            │             │
                                                        ┌───┘             ↓
                                                     REWRITE         ANALYZER PIPELINE
                                                     LOCAL           ┌───────────────┐
                                                                     │ - manifest diff│
                                                                     │ - script det. │
                                                                     │ - OSV         │
                                                                     │ - static pat. │
                                                                     │ - obfuscation │
                                                                     │ - binary det. │
                                                                     │ - version cmp.│
                                                                     └───────┬───────┘
                                                                             ↓
                                                                  ┌──────────┴──────────┐
                                                                  │ Aggregate to tier   │
                                                                  └──┬─────────┬─────┬──┘
                                                                     ↓ tier1   ↓ tier2  ↓ tier3 / clean
                                                                   BLOCK    BLOCK     ALLOW
                                                                            unless    (with
                                                                            build-    warning
                                                                            scripts   if tier3)
                                                                            allowed
```

→ Detail: [docs/05-decision-flow.md](docs/05-decision-flow.md), [docs/03-categories.md](docs/03-categories.md).

---

## Coverage — what gets gated

```
                ┌───────────────────────────────────────────────────────────┐
                │                  Tool call intercepted                     │
                └─────────────────────────────┬─────────────────────────────┘
                                              ↓
        ┌─────────────────┬───────────────────┼──────────────────┬─────────────┐
        ↓                 ↓                   ↓                  ↓             ↓
   ┌─────────┐      ┌──────────┐       ┌───────────┐      ┌──────────┐  ┌──────────┐
   │ Package │      │ Skill    │       │   MCP     │      │Instruction│  │Vendoring │
   │ install │      │activation│       │ addition  │      │   edit    │  │ / binary │
   └────┬────┘      └─────┬────┘       └─────┬─────┘      └─────┬────┘  └────┬─────┘
        ↓                 ↓                  ↓                  ↓            ↓
   5-check flow     allowlist+         allowlist+        injection scan   default
   per candidate    content hash       binary hash +     of content       block
                                       per-tool approval
```

Detectors cover npm, pnpm, yarn, bun, pip, poetry, uv, cargo, go, skills, vendoring, binaries.

→ Detail: [docs/04-coverage.md](docs/04-coverage.md).

---

## Policy — three-layer cache, online-first

```
                  ┌──────────────────────────┐
                  │   Online (origin)        │
                  │ github.com/.../policy/   │   ← source of truth
                  └─────────────┬────────────┘
                                │ fetch (each session)
                                ↓
                  ┌──────────────────────────┐
                  │   Runtime cache          │   ~/.claude/plugins/yieldos/
                  │   TTL 5 min              │   .runtime-cache/
                  └─────────────┬────────────┘
                                │ fallback if origin unreachable
                                ↓
                  ┌──────────────────────────┐
                  │   Shipped cache          │   plugin/policy-cache/
                  │   updated on release     │   always present
                  └──────────────────────────┘
```

Refresh triggers:
- `SessionStart` — force refresh (ignore TTL).
- `UserPromptSubmit` — refresh if stale.
- `PreToolUse` — refresh if TTL expired.

→ Detail: [docs/07-policy.md](docs/07-policy.md).

---

## Architecture — module map

```
plugins/yieldos/
├── .claude-plugin/plugin.json
├── hooks/hooks.json
├── config/defaults.json
├── policy-cache/        (shipped fallback)
├── scripts/
│   ├── pre-install-gate.js     ← PreToolUse entry
│   ├── post-install-audit.js   ← PostToolUse entry
│   ├── on-session-start.js     ← SessionStart entry
│   ├── on-prompt-submit.js     ← UserPromptSubmit entry
│   ├── decide.js               ← 5-check flow
│   ├── policy-fetcher.js       ← three-layer cache
│   ├── policy-lookup.js        ← lists/categories lookups
│   ├── logger.js               ← append-only, secret-redacted
│   ├── self-defense.js         ← protected-path detection
│   ├── injection-scanner.js    ← prompt-injection patterns
│   ├── instruction-watcher.js  ← hash CLAUDE.md/AGENTS.md
│   ├── transitive-auditor.js   ← post-install lockfile audit
│   ├── code-audit/             ← commit/push source-code audit loop
│   ├── classifiers/   (12 detectors)
│   ├── analyzers/     (9 modules)
│   └── rewriter/      (Category A scaffold gen)
├── skills/dependency-gate/SKILL.md
└── tests/  (node:test)
```

→ Detail: [docs/06-architecture.md](docs/06-architecture.md).

---

## For humans

You don't have to do anything. yieldOS works in the background:

- **Safe installs go through silently.** If the package is on the official allowlist, it just installs.
- **Dangerous installs are blocked.** You'll see a one-line message: `[yieldOS] BLOCK bloqueó {package}: {reason}`.
- **Tiny utility packages get rewritten locally.** You'll see: `[yieldOS] REWRITE realizó una optimización de la instalación de {package}`. The code lives in `src/lib/yieldos/` in your project.
- **Critical packages (crypto, auth, frameworks, ORMs) require official approval.** yieldOS will ask you to update the reviewed root `policy/` files through a normal PR.
- **CVEs in transitive dependencies are flagged** post-install — you'll see `[yieldOS] BLOCK CVE detectado en transitiva: {cve_id}`.

Everything is logged to `<project>/security/dependency-events.md`. You can read it any time to audit what yieldOS decided and why.

When stderr is an interactive terminal, yieldOS colorizes the status label. In
non-interactive agent runs, CI, or `NO_COLOR=1`, output stays plain text. The
machine-readable line is always unstyled: `[yieldOS:verdict] <verdict>`.

You do not need to:

- Approve installs.
- Edit allowlist or denylist.
- Run any commands manually.

If you want to add a package that yieldOS blocked, the path is: open a PR that updates the reviewed root [`policy/`](../policy) files and keeps the plugin `policy-cache/` synchronized.

---

## For AI agents

If you are an AI coding agent operating in a project protected by yieldOS:

1. **Hooks run regardless of your intent.** `PreToolUse` intercepts `Bash`, `Write`, `Edit`, and `Read` calls. If yieldOS returns exit code `2`, the action did not run.

2. **Read the verdict from stderr.** Lines starting with `[yieldOS:verdict]` carry the machine-readable verdict:

   | Verdict                       | What you should do                                                                  |
   | ----------------------------- | ----------------------------------------------------------------------------------- |
   | `allowlist-match`             | The action ran. Continue.                                                            |
   | `denylist-match`              | Do not retry. Inform the user using yieldOS's message verbatim.                      |
   | `category-d-blocked`          | Critical category. Tell the user a PR to the policy repo is required.                |
   | `category-a-rewrite`          | Read `[yieldOS:rewrite-target]` for the scaffold path. Populate it per the dependency-gate skill. |
   | `verification-failed`         | Analysis flagged the package. Do not retry.                                          |
   | `verification-passed`         | Action ran. Continue.                                                                |
   | `native-suggest`              | Use the native API mentioned. Do not install.                                        |
   | `build-script-not-approved`   | Build script not in `policy/build-scripts-allowed.json`. Tell the user.              |
   | `skill-approved`              | The approved skill action ran. Continue.                                             |
   | `skill-blocked`               | Do not retry. The skill is not approved in `policy/skills.json`.                     |
   | `mcp-blocked`                 | Do not retry direct MCP registration. Use a reviewed agent pack/tool-surface flow.   |
   | `self-defense-block`          | You attempted to modify a yieldOS-protected file. Stop. This is not a bug.           |
   | `injection-blocked`           | Detected prompt-injection in instruction-file edit. Reconsider the edit.             |
   | `code-audit-fix-applied`      | A security fix was applied to staged code. Review the change and rerun `git commit`. |
   | `code-audit-blocked`          | Source-code audit found unresolved blocking risk. Fix it before committing/pushing.  |
   | `code-audit-clean`            | The audited commit or push diff passed. Continue.                                    |
   | `credentials-read-blocked`    | Do not read credential files through `Read` or `Bash` unless yieldOS gives a target nonce and the user sends it exactly. |
   | `credentials-read-authorized` | The structured `Read` retry has transcript proof of the target-bound nonce.          |

3. **The rewrite flow (Category A)**: when yieldOS blocks with `category-a-rewrite`, follow the `dependency-gate` skill that's loaded automatically.

4. **Self-defense.** Do not attempt to modify yieldOS's own files. The blocks are deliberate.

5. **Instruction-file edits are scanned for injection.** Edits to `CLAUDE.md`, `AGENTS.md`, or `.cursorrules` that contain "ignore previous instructions", "disable yieldOS", etc., are blocked.

→ Detail: [docs/05-decision-flow.md](docs/05-decision-flow.md), [docs/04-coverage.md](docs/04-coverage.md).

---

## Logging

`<project>/security/dependency-events.md`. Append-only. Eight entry types:

- `Allowed Install` — allowlist match.
- `Blocked Install` — denylist, Category D, exotic, or analysis verdict.
- `Verified Install` — passed analysis but not allowlisted.
- `Rewritten Locally` — Category A package rewritten under `src/lib/yieldos/`.
- `Transitive Audit` — post-install summary.
- `Self-Defense Trigger` — yieldOS blocked a modification of its own files.
- `Blocked Instruction File Edit (injection)` — prompt-injection detected.
- `Required Settings Applied` — yieldOS inserted missing manager settings.
- `Code Audit` — commit/push source-code audit result in `security/code-audit-events.md`.

Sensitive values (tokens, bearer headers, private keys, sk-*, ghp_*) are redacted before being written.

---

## Tests

```bash
cd yieldOS/plugins/yieldos
node --test tests/*.test.js
```

Zero external dependencies (uses `node:test`). Coverage:

- `classifier.test.js` — 38 cases across all package managers and edge inputs.
- `policy-lookup.test.js` — allowlist/denylist matching, ecosystem mapping, native equivalents.
- `analyzer.test.js` — static patterns, script detection, manifest diff, version comparison, obfuscation, binary detection.
- `decide.test.js` — full decision-tree verdicts with mocked policy.
- `injection-scanner.test.js` — prompt-injection patterns against fixtures and shipped patterns.
- `instruction-watcher.test.js` — hash-based change detection on `CLAUDE.md`/`AGENTS.md`.
- `logger.test.js` — log entry shape and secret redaction.
- `self-defense.test.js` — protected path matching.
- `code-audit.test.js` — staged/push diff collection, red/blue loop, audit state, CI verification, hook routing.
- `code-audit-agents.test.js` — optional local Claude/Codex agent boundary and patch validation.
- `ui.test.js` — terminal labels, color gating, exact machine-readable verdicts.
- `e2e.test.js` — end-to-end runs of the pre-install gate with realistic inputs.

---

## Documentation

| File | What's inside |
|---|---|
| [docs/01-philosophy.md](docs/01-philosophy.md) | First principles. Why deterministic policy comes before model judgment. |
| [docs/02-rewrite-evolution.md](docs/02-rewrite-evolution.md) | The most-iterated decision: how "rewrite" went from replacement to last-resort salvage. |
| [docs/03-categories.md](docs/03-categories.md) | The four categories A/B/C/D, the keyword fallback, the threshold check. |
| [docs/04-coverage.md](docs/04-coverage.md) | Every vector yieldOS gates: packages, skills, MCPs, instruction files, vendoring, binaries. |
| [docs/05-decision-flow.md](docs/05-decision-flow.md) | The full 5-check pipeline plus pre/post-hook details. |
| [docs/06-architecture.md](docs/06-architecture.md) | Plugin layout, module dependency graph, runtime sequences, three caches. |
| [docs/07-policy.md](docs/07-policy.md) | Policy fetching, the three-layer cache, refresh triggers, PR flow. |
| [docs/08-tradeoffs.md](docs/08-tradeoffs.md) | What we gave up on purpose and why. |
| [docs/09-decision-log.md](docs/09-decision-log.md) | Every meaningful decision in order, with rationale. |
| [docs/10-code-audit.md](docs/10-code-audit.md) | Commit/push source-code security audit loop. |
| [docs/11-ci-cd.md](docs/11-ci-cd.md) | Planned CI/CD enforcement. |
| [docs/12-dockerfile-scanner.md](docs/12-dockerfile-scanner.md) | Planned Dockerfile scanner. |
| [docs/13-audit-command.md](docs/13-audit-command.md) | On-demand Deepsec source-code audit. |
| [docs/14-custom-instructions.md](docs/14-custom-instructions.md) | Preview-first AGENTS.md / CLAUDE.md generation. |
| [docs/15-pentest-loop.md](docs/15-pentest-loop.md) | Red-team / blue-team loop with persistent local lessons. |
| [docs/16-agent-rules-and-playbooks.md](docs/16-agent-rules-and-playbooks.md) | Planning and research for reviewed playbooks. |
| [docs/17-team-agent-packs.md](docs/17-team-agent-packs.md) | Policy-validated team agent packs. |
| [docs/19-oracle-driven-harness.md](docs/19-oracle-driven-harness.md) | Oracle-driven security harness and pass/fail/unknown acceptance model. |
| [docs/20-oracle-evidence-artifacts.md](docs/20-oracle-evidence-artifacts.md) | Hashable generated evidence boundaries. |
| [docs/21-counterexample-driven-security-contracts.md](docs/21-counterexample-driven-security-contracts.md) | Baseline-fail plus fixed-pass security contracts. |
| [docs/22-oracle-demo-script.md](docs/22-oracle-demo-script.md) | Missing-auth proof demo flow. |
| [docs/23-oracle-evals.md](docs/23-oracle-evals.md) | Oracle evaluation and benchmark framing. |
| [docs/25-oracle-contract-catalog.md](docs/25-oracle-contract-catalog.md) | Oracle contract catalog for validation and benchmarks. |
| [docs/enterprise-boundaries.md](docs/enterprise-boundaries.md) | Current enforcement levels, data flows, and claim rules. |

---

## What yieldOS is not

- It is not a replacement for `npm audit` / Dependabot / Snyk. It is a pre-install gate plus a transitive auditor; existing tools still cover known CVEs in installed code.
- It is not an "auto-customization assistant" — the rewrite path exists only for tiny, low-risk packages where rewriting is safer than installing. The customization to your project is a side effect, not the goal.
- Installed policy is not edited locally. Reviewed policy changes go through this repository's root `policy/` files and are shipped into the plugin cache on release.
- It is not a daemon. It is a set of hooks that the Claude Code harness invokes on the right events. The "always-on" feel comes from being hooked into every relevant tool call.

---

## License

MIT
