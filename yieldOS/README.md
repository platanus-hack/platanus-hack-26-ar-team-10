# yieldOS

**One security gate for every dependency, skill, and instruction your AI agent touches — built for humans and AI agents.**

yieldOS is a Claude Code plugin that intercepts every install command, skill activation, MCP addition, and instruction-file edit. It decides automatically — without putting a human in the loop — whether to allow, block, or rewrite the action, based on a centrally curated policy.

→ Full design documentation in [`docs/`](docs/README.md).

---

## Why

AI coding agents install code on behalf of users. Every `npm install`, every `pip install`, every skill or MCP added is a trust decision that the user usually never sees. The history of supply-chain attacks (`event-stream`, `node-ipc`, `ua-parser-js`, `colors`, `crossenv`) shows the cost of getting that decision wrong.

yieldOS makes the trust decision **before** the install runs, deterministically, against a policy that is curated centrally and shipped with the plugin so it works offline.

→ More: [docs/01-philosophy.md](docs/01-philosophy.md).

---

## Quickstart

```bash
# 1. Install from the public marketplace
curl -fsSL https://raw.githubusercontent.com/platanus-hack/platanus-hack-26-ar-team-10/main/install.sh | sh
```

Manual install:

```bash
claude plugins marketplace add platanus-hack/platanus-hack-26-ar-team-10
claude plugins install yieldos@yieldos

# Optional: run the test suite
cd plugins/yieldos
node --test tests/*.test.js
```

That's it. yieldOS auto-runs on `SessionStart`, `UserPromptSubmit`, and on every `Bash` / `Write` / `Edit` tool call.

Requires Node.js 18+ for `fetch` and `node:test`.

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
│   ├── classifiers/   (12 detectors)
│   ├── analyzers/     (9 modules)
│   └── rewriter/      (Category A scaffold gen)
├── skills/dependency-gate/SKILL.md
└── tests/  (node:test, 122 tests)
```

→ Detail: [docs/06-architecture.md](docs/06-architecture.md).

---

## For humans

You don't have to do anything. yieldOS works in the background:

- **Safe installs go through silently.** If the package is on the official allowlist, it just installs.
- **Dangerous installs are blocked.** You'll see a one-line message: `yieldOS bloqueó {package}: {reason}`.
- **Tiny utility packages get rewritten locally.** You'll see: `yieldOS realizó una optimización de la instalación de {package}`. The code lives in `src/lib/yieldos/` in your project.
- **Critical packages (crypto, auth, frameworks, ORMs) require official approval.** yieldOS will ask you to open a PR to the official policy repo.
- **CVEs in transitive dependencies are flagged** post-install — you'll see `yieldOS detectó CVE en transitiva {pkg}: {cve_id}`.

Everything is logged to `<project>/security/dependency-events.md`. You can read it any time to audit what yieldOS decided and why.

You do not need to:

- Approve installs.
- Edit allowlist or denylist.
- Run any commands manually.

If you want to add a package that yieldOS blocked, the path is: open a PR to the [official policy repo](https://github.com/platanus-hack/policy-yieldos).

---

## For AI agents

If you are an AI coding agent operating in a project protected by yieldOS:

1. **Hooks run regardless of your intent.** `PreToolUse` intercepts every `Bash`, `Write`, and `Edit` call. If yieldOS returns exit code `2`, the action did not run.

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
   | `self-defense-block`          | You attempted to modify a yieldOS-protected file. Stop. This is not a bug.           |
   | `injection-blocked`           | Detected prompt-injection in instruction-file edit. Reconsider the edit.             |

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

Sensitive values (tokens, bearer headers, private keys, sk-*, ghp_*) are redacted before being written.

---

## Tests

```bash
cd plugins/yieldos
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
- `e2e.test.js` — end-to-end runs of the pre-install gate with realistic inputs.

122/122 passing.

---

## Documentation

| File | What's inside |
|---|---|
| [docs/01-philosophy.md](docs/01-philosophy.md) | First principles. Why the user is not in the loop. The three guarantees. |
| [docs/02-rewrite-evolution.md](docs/02-rewrite-evolution.md) | The most-iterated decision: how "rewrite" went from replacement to last-resort salvage. |
| [docs/03-categories.md](docs/03-categories.md) | The four categories A/B/C/D, the keyword fallback, the threshold check. |
| [docs/04-coverage.md](docs/04-coverage.md) | Every vector yieldOS gates: packages, skills, MCPs, instruction files, vendoring, binaries. |
| [docs/05-decision-flow.md](docs/05-decision-flow.md) | The full 5-check pipeline plus pre/post-hook details. |
| [docs/06-architecture.md](docs/06-architecture.md) | Plugin layout, module dependency graph, runtime sequences, three caches. |
| [docs/07-policy.md](docs/07-policy.md) | Policy fetching, the three-layer cache, refresh triggers, PR flow. |
| [docs/08-tradeoffs.md](docs/08-tradeoffs.md) | What we gave up on purpose and why. |
| [docs/09-decision-log.md](docs/09-decision-log.md) | Every meaningful decision in order, with rationale. |

---

## What yieldOS is not

- It is not a replacement for `npm audit` / Dependabot / Snyk. It is a pre-install gate plus a transitive auditor; existing tools still cover known CVEs in installed code.
- It is not an "auto-customization assistant" — the rewrite path exists only for tiny, low-risk packages where rewriting is safer than installing. The customization to your project is a side effect, not the goal.
- It is not editable locally. Allowlist and denylist live in the official policy repo by design.
- It is not a daemon. It is a set of hooks that the Claude Code harness invokes on the right events. The "always-on" feel comes from being hooked into every relevant tool call.

---

## License

MIT
