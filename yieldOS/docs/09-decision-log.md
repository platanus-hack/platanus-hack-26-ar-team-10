# Decision log

Every meaningful decision made during yieldOS design, in roughly the order they were made, with the rationale captured.

---

## D1 — Build it as a Claude Code plugin (not standalone)

**Decision**: yieldOS is a Claude Code plugin (hooks + skill + slash commands), not a standalone CLI.

**Rationale**: the threat model is "the AI agent installs code". The natural intercept point is Claude Code's tool-call lifecycle. A standalone CLI would require explicit user invocation; a plugin runs deterministically on every relevant tool call.

---

## D2 — Hook on `PreToolUse` + `PostToolUse` + `SessionStart` + `UserPromptSubmit`

**Decision**: register four hooks.

**Rationale**:
- `PreToolUse` is the gate point for installs and edits.
- `PostToolUse` runs the transitive auditor after a successful install.
- `SessionStart` refreshes policy and validates instruction files at the start of every session.
- `UserPromptSubmit` keeps the policy fresh during long sessions.

Alternative considered: only `PreToolUse`. Rejected because we need post-install transitive auditing and per-session refresh.

---

## D3 — Block via exit code 2

**Decision**: a blocking decision is signaled by exiting with code 2 and writing to stderr.

**Rationale**: exit 2 is Claude Code's signal that "this hook blocked the action and stderr is feedback for the agent". Verdicts like `[yieldOS:verdict] denylist-match` go to stderr alongside the human-readable message.

---

## D4 — Centrally curated policy

**Decision**: all runtime policy (allowlist, denylist, categories, skills, MCPs, injection patterns, etc.) lives in this repository's root `policy/` directory and is mirrored into the plugin's shipped `policy-cache/` on release. The user does not edit installed policy locally.

**Rationale**: see [docs/07-policy.md](07-policy.md). Local editing is a footgun.

---

## D5 — Three-layer cache (online + runtime + shipped)

**Decision**:
- Online (origin) is the source of truth.
- Runtime cache at `~/.claude/plugins/yieldos/.runtime-cache/` with TTL 5 min.
- Shipped cache at `policy-cache/` inside the plugin tarball, always present.

**Rationale**: online-first keeps the policy fresh; runtime cache amortizes reads; shipped cache makes the plugin work offline from first install.

---

## D6 — Online refresh on `SessionStart` + per-prompt + TTL on PreToolUse

**Decision**: force refresh at SessionStart; refresh if stale on UserPromptSubmit; check TTL on each PreToolUse.

**Rationale**: keeps policy fresh during a session. The 5-min TTL is short enough to pick up urgent denylist additions.

---

## D7 — Five-check decision flow

**Decision**: for every install candidate, run checks in order: native → allowlist → denylist → exotic → categorize.

**Rationale**: short-circuits the cheap cases first. By the time we reach the analyzer pipeline (the expensive step), most candidates have already resolved.

---

## D8 — Native-first principle

**Decision**: if the platform offers a native equivalent (e.g., `crypto.randomUUID()` for `uuid`), suggest it and block the install.

**Rationale**: the best dependency is the one that doesn't exist. Native APIs are zero-risk.

Alternative considered: list it as a warning but allow. Rejected because users (especially non-technical) ignore warnings.

---

## D9 — Allowlist match by exact `name@version`

**Decision**: an allowlist entry is `<ecosystem>:<name>@<version>` (or `<ecosystem>:<name>` for any version).

**Rationale**: pinned versions prevent rolling updates from carrying compromised payloads. Name-only is allowed for pre-vetted packages where any version is acceptable, but it's the weaker form.

---

## D10 — Denylist by version OR by name (any version)

**Decision**: denylist entries can be exact version (`event-stream@3.3.6`) or just name (`colors`).

**Rationale**: some packages are completely toxic at any version (`event-stream`, `crossenv`). Others have one bad version. Both forms are needed.

---

## D11 — Denylist beats allowlist when both match

**Decision**: if a package matches both lists, deny wins.

**Rationale**: defense in depth. If we ever add a dual entry by mistake, the safe behavior is block.

---

## D12 — Categories A/B/C/D for unlisted packages

**Decision**: classify unlisted packages into four categories — A (rewrite-safe), B (rewrite with care), C (dangerous to rewrite), D (never rewrite, requires explicit policy approval).

**Rationale**: see [docs/03-categories.md](03-categories.md). Each tier corresponds to a different action.

---

## D13 — Category D match → block, no auto-resolution

**Decision**: any package matching D (explicit list or keyword fallback) is blocked. The path forward is a PR to the policy repo.

**Rationale**: D contains crypto, auth, frameworks, ORMs — anything where a wrong decision is high-cost. Auto-resolution is too dangerous.

---

## D14 — Category A → rewrite local

**Decision**: explicit Category A packages get a local rewrite (small scaffold + content-hash marker; agent populates via dependency-gate skill).

**Rationale**: see [docs/02-rewrite-evolution.md](02-rewrite-evolution.md). Final form: rewrite is a last-resort salvage for tiny utility packages.

---

## D15 — Threshold-based fallback for unlisted-not-D

**Decision**: if a package is not D and metadata shows it's small (< 50 KB unpacked, < 30 files, ≤ 1 dep), treat it as Category A.

**Rationale**: the Cat A explicit list can never be complete. Threshold check catches small utilities the maintainer hasn't categorized yet.

**Caveat (D15a, added later)**: require *positive evidence* of small size. If metadata is missing the size field (e.g., PyPI doesn't always provide it), do NOT auto-rewrite. This was tightened after the matplotlib false positive (decision #19 below).

---

## D16 — Manifest analysis pipeline for non-A non-D unlisted

**Decision**: when a package falls through to the analyzer pipeline, run all analyzers in parallel (script-detector, OSV, static-patterns, obfuscation, binary, version-comparator).

**Rationale**: catches the realistic supply-chain attacks (postinstall scripts, exfiltration patterns, suspicious URLs).

---

## D17 — Tier 1/2/3 + Clean verdicts from analyzers

**Decision**: aggregate analyzer findings to highest tier:
- Tier 1 (eval, child_process_exec, .ssh access, critical CVE, downgrade) → block.
- Tier 2 (build scripts, native bindings) → block unless in `build-scripts-allowed.json`.
- Tier 3 (medium CVE, oversized, version too young, env access) → allow with warning.
- Clean → allow.

**Rationale**: gradient of severity. Tier 2 is special because some packages legitimately need build scripts (sharp, bcrypt) and the allowlist for that is narrow.

---

## D18 — Manifest edits are parsed by diff, not by filename

**Decision**: when the agent writes or edits dependency manifests (`package.json`, `requirements.txt`, `pyproject.toml`, `Cargo.toml`, `go.mod`, etc.), yieldOS reconstructs the full new file, diffs it against the previous content, and validates only the added or changed dependency entries.

**Rationale**: the original "pass through" rule avoided a real bug: the classifier treated the filename (`requirements.txt`) as a package name and blocked legitimate edits. The corrected rule keeps that lesson but closes the silent-edit gap. A manifest file path is never a package candidate; only parsed dependency entries from the manifest diff become candidates.

---

## D19 — `meetsCategoryAThresholds` requires positive size evidence

**Decision**: if metadata doesn't have a size field, treat as "not Category A". Only positive confirmation that the package is small qualifies.

**Rationale**: another bug — matplotlib (a 10MB+ scientific library) was being routed to Category A rewrite because PyPI metadata uses a different field for size than npm, so the size check returned `undefined`, which evaluated as "passes the threshold". Fixed by requiring affirmative evidence.

---

## D20 — Add scientific Python packages to Category D explicit list

**Decision**: matplotlib, numpy, pandas, scipy, seaborn, plotly, bokeh, scikit-learn, tensorflow, torch, keras, etc. are explicitly listed in Category D.

**Rationale**: defense in depth. Even if the keyword fallback fails or the threshold check fails, the explicit list catches them.

---

## D21 — Rewrite scaffold has a content-hash header

**Decision**: every rewritten file starts with:

```
/**
 * yieldOS-rewrite
 * source: npm:lodash@4.17.21
 * source-url: https://github.com/lodash/lodash/tree/4.17.21
 * generated-at: 2026-05-09T...
 * content-hash: sha256:...
 */
```

**Rationale**: the marker survives revalidation cycles. If the user modifies the file by hand, the content hash mismatch tells yieldOS not to auto-update on next upstream change.

---

## D22 — Index of rewrites in `security/yieldos-rewrites.json`

**Decision**: every rewrite is also tracked in a project-local index file.

**Rationale**: enables bulk operations (revalidate all, list all, detect orphans).

---

## D23 — `security/dependency-events.md` is append-only and secret-redacted

**Decision**: the log is markdown, append-only, with secret patterns redacted before write.

**Rationale**:
- Append-only because edits would erase audit history.
- Markdown because humans read it directly.
- Secret-redacted because the log might capture commands that contain tokens (`-H "Authorization: Bearer ..."`).

---

## D24 — Self-defense: protect yieldOS's own files

**Decision**: writes/edits to `.claude/plugins/yieldos/**`, `security/dependency-events.md`, `security/yieldos-rewrites.json`, etc. are blocked by the hook.

**Rationale**: if a malicious skill or instruction file tries to disable the gate, the gate must refuse. Self-defense closes the loop.

---

## D25 — Skills/MCPs/instruction files are non-package vectors with their own flows

**Decision**: separate detection for skills (`npx skills add`), MCPs (`claude plugin add`), and instruction files (`CLAUDE.md`/`AGENTS.md`/`.cursorrules`).

**Rationale**: skills manipulate the agent, MCPs run as processes, instruction files modify policy. Each requires different verification.

---

## D26 — Prompt-injection scanner for instruction files

**Decision**: when a `Write`/`Edit` targets `CLAUDE.md`/`AGENTS.md`/`.cursorrules`, scan content for prompt-injection patterns from `policy/injection-patterns.json`.

**Rationale**: a compromised instruction file is a vector to disable yieldOS or run arbitrary commands. Blocking the edit at write time is cheap and effective.

---

## D27 — Transitive audit with 10-day-rule

**Decision**: after install, audit the lockfile diff. For each new transitive:
- If allowlisted exact version → mark validated.
- Else if publish_date > 10 days ago → allow, log "10-day rule".
- Else → suggest downgrade to last version with ≥10 days.
- Run OSV check.
- Match against denylist.

**Rationale**: 10 days is enough time for the community to catch an obvious supply-chain compromise. Brand-new versions are higher-risk.

---

## D28 — Required-settings enforcement

**Decision**: yieldOS reads `policy/required-settings.json` and ensures the project's `.npmrc` / `pnpm-workspace.yaml` / etc. have specific settings (`ignore-scripts=true`, `minimum-release-age=10`, etc.). Inserts missing ones at SessionStart.

**Rationale**: the package manager itself can enforce many of yieldOS's rules natively (`ignore-scripts` blocks postinstall by default; `minimum-release-age` enforces the 10-day rule). Use the manager's facilities, don't reinvent.

---

## D29 — No mocks in the harness

**Decision**: when benchmarking yieldOS against real-world packages, all metadata fetches hit real registries (npm, PyPI, OSV).

**Rationale**: the analyzers depend on real registry data shapes. Mocking hides bugs (the matplotlib bug would have been masked by a fixture).

---

## D30 — node:test, zero deps for tests

**Decision**: the test suite uses `node:test` (built into Node ≥18) with no external testing framework.

**Rationale**: dogfooding. yieldOS preaches dependency minimization; its own tests should not require a heavy framework.

---

## D31 — Marketplace-based plugin install

**Decision**: yieldOS is installed via Claude Code's official plugin CLI (`claude plugins marketplace add yieldos/yieldos; claude plugins install yieldos@yieldos`).

**Rationale**: tracks with how Claude Code expects plugins to be installed. Direct file copying to `~/.claude/plugins/yieldos/` works for testing but bypasses the official registration; the CLI flow registers the plugin properly in `installed_plugins.json`.

---

## D32 — Public marketplace structure: repo root manifest + plugin bundle

**Decision**: the public repository exposes `.claude-plugin/marketplace.json` at the repo root and points Claude Code to `yieldOS/plugins/yieldos/`. The nested `yieldOS/.claude-plugin/marketplace.json` remains valid for local marketplace testing from the `yieldOS/` directory.

**Rationale**: Claude Code validates and installs GitHub marketplaces from the repository root. Keeping the root marketplace valid makes `claude plugins marketplace add yieldos/yieldos` work the same way public plugin repositories like Guard do.

---

## D33 — `author` field is an object, not a string

**Decision**: `plugin.json` uses `"author": { "name": "..." }`, not `"author": "..."`.

**Rationale**: Claude Code's manifest schema requires the object form. Discovered the hard way during install.

---

## D34 — Plugin contents at root of plugin dir, only `plugin.json` in `.claude-plugin/`

**Decision**: the layout is:
```
plugins/yieldos/
├── .claude-plugin/plugin.json
├── hooks/
├── scripts/
├── ...
```

NOT:
```
plugins/yieldos/.claude-plugin/{hooks,scripts,...}
```

**Rationale**: matches the official marketplace's layout. Discovered the hard way: when the contents were inside `.claude-plugin/`, the install copied only `plugin.json` and the rest was missing.

---

## D35 — Versioning + bump-and-reinstall flow for fixes

**Decision**: every meaningful fix bumps the plugin version (0.1.0 → 0.1.1 → 0.1.2 → ...) and reinstalls via `claude plugins uninstall && claude plugins install`.

**Rationale**: the marketplace caches the install path by version. Without a bump, the cached files don't update.

---

## D36 — Hook output stamps use `hookSpecificOutput.additionalContext`

**Decision**: PreToolUse hooks emit structured JSON on stdout with `hookSpecificOutput.additionalContext`, including the verdict, per-candidate summary, and the exact visual stamp the agent should append to the user-facing reply.

**Rationale**: stderr is visible for blocked hooks, but allowed hooks can complete without reliably reinjecting stderr into the model context. `additionalContext` makes yieldOS visible to the agent on allow, block, rewrite, native-suggest, instruction-injection, and self-defense paths.

---

## D37 — CI/CD and Dockerfile scanner remain planning docs until implemented

**Decision**: the CI/CD gate and Dockerfile scanner designs live in `docs/11-ci-cd.md` and `docs/12-dockerfile-scanner.md` as plans only. They are not enabled by the plugin runtime yet.

**Rationale**: both ideas extend the same policy engine beyond the current Claude Code hook surface, but shipping them requires new classifiers, reporters, and CI entrypoints. Keeping them as explicit plans prevents the docs from implying capabilities the project does not yet provide.

---

## D38 — Instruction generation stays separate from installation

**Decision**: `/yieldos:init` generates previewable `AGENTS.md` and `CLAUDE.md` instructions for project, local, personal, and organization scopes. `install.sh` does not accept configuration flags for those files.

**Rationale**: plugin installation is global, while instruction files are policy artifacts with different blast radii. A preview-first init command keeps the output reviewable and avoids surprising global install side effects.

---

## D39 — Agent packs are source of truth, not equal enforcement everywhere

**Decision**: `yield.agent-pack.yaml` is the reviewed source of truth for team agent profiles, skills, MCPs, playbooks, and target adapters. `yieldos-pack` validates the pack against policy and generates native files, reports, and a lockfile. Claude Code has the strongest runtime enforcement through hooks; Cursor, GitHub Copilot, Windsurf, Codex-style, and universal outputs are guidance unless their host exposes equivalent controls.

**Rationale**: teams need one reviewable configuration artifact instead of hand-maintained rules per agent. The product must stay honest: native outputs reduce drift and ambiguity, but they do not create hard enforcement in hosts that only support guidance.
