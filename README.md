# yieldOS

<img src="./project-logo.png" alt="yieldOS logo" width="180" />

**Executable security contracts for AI coding agents.**

[![Plugin CI](https://github.com/platanus-hack/platanus-hack-26-ar-team-10/actions/workflows/plugin.yml/badge.svg)](https://github.com/platanus-hack/platanus-hack-26-ar-team-10/actions/workflows/plugin.yml)
[![Security CI](https://github.com/platanus-hack/platanus-hack-26-ar-team-10/actions/workflows/security.yml/badge.svg)](https://github.com/platanus-hack/platanus-hack-26-ar-team-10/actions/workflows/security.yml)
[![Latest release](https://img.shields.io/github/v/release/platanus-hack/platanus-hack-26-ar-team-10?label=release&filter=yieldos--*)](https://github.com/platanus-hack/platanus-hack-26-ar-team-10/releases)
[![Node 18+](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)](#validate-locally)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](#license)

AI coding agents can install dependencies, add tools, edit instruction files, read secrets, and commit code faster than manual review can inspect every step. yieldOS is an oracle-driven security harness that turns risky agent actions into security contracts, counterexamples, and proof-of-fix evidence. **The model can propose. The oracle decides.**

> Built at **Platanus Hack 26 — Buenos Aires** by team-10, AI Security track. Landing: [landing-yield.vercel.app](https://landing-yield.vercel.app/). Léelo en [español](./README.es.md).

---

## Table of Contents

- [Why](#why)
- [What Works Today](#what-works-today)
- [Quickstart](#quickstart)
- [Try The Demo](#try-the-demo)
- [Install And Verify](#install-and-verify)
- [Plugin Commands](#plugin-commands)
- [Repository Map](#repository-map)
- [Validate Locally](#validate-locally)
- [Documentation](#documentation)
- [Current Boundaries](#current-boundaries)
- [Release](#release)
- [Team](#team)
- [License](#license)

---

## Why

Every `npm install`, `pip install`, MCP registration, or `AGENTS.md` edit an AI agent runs is a trust decision the user usually never sees. The history of supply-chain attacks (`event-stream`, `node-ipc`, `ua-parser-js`, `colors`, `crossenv`) shows the cost of getting that decision wrong.

yieldOS makes those decisions **before** risky work is accepted, against policy and executable evidence that can be checked without model calls. For deeper context, read [`yieldOS/docs/01-philosophy.md`](./yieldOS/docs/01-philosophy.md).

---

## What Works Today

### Hooks

- Claude Code plugin hooks for `SessionStart`, `UserPromptSubmit`, `PreToolUse`, and `PostToolUse`.
- Native Git hook bridge for Codex, shells, and other hosts that do not run Claude Code plugin hooks.

### Pre-action gates

- Pre-action gating for package installs, skill installs, direct MCP additions, manifest dependency edits, vendored code, remote shell installers, instruction-file edits, protected yieldOS evidence, and credential-file reads.
- Credential protection: reads of `.env`, `.ssh`, `.aws`, `.kube`, and similar paths require explicit local authorization.

### Code audit and tamper-evident events

- Commit/push source-code audit with red-team findings, deterministic blue-team fixes when safe, and commit-bound `security/code-audit-state.json`.
- Tamper-evident local audit events in `security/yieldos-events.jsonl`, with secret redaction, hash-chain verification, and an outside-repo tail checkpoint for review.

### Oracles and security contracts

- Counterexample-driven security contracts: define the invariant, replay the unsafe baseline, replay the fixed runtime, and store scoped proof artifacts.
- Oracle runner with scoped `pass`, `fail`, and `unknown` results. Oracles execute contracts; for sensitive actions, `unknown` blocks by default.

### Team agent packs

- Team agent packs that validate approved skills, MCPs, playbooks, profiles, oracles, generated files, and pack locks.

### Plugin commands

- `/yieldos:audit`, `/yieldos:init`, `/yieldos:pack`, `/yieldos:oracle`, `/yieldos:oracle-demo`, `/yieldos:pentest`, and `/yieldos:update`. See the [commands table](#plugin-commands).

---

## Quickstart

Once Claude Code is installed and you have shell access, install yieldOS with one curl:

```bash
curl -fsSL https://raw.githubusercontent.com/platanus-hack/platanus-hack-26-ar-team-10/main/install.sh | sh -s -- --source platanus-hack/platanus-hack-26-ar-team-10
```

The `--source platanus-hack/platanus-hack-26-ar-team-10` flag tells the installer where the marketplace lives during the hackathon (the `yieldos/yieldos` org will publish the same plugin once it's up).

After install, restart Claude Code (or `/reload-plugins`) and yieldOS will gate `Bash`, `Write`, `Edit`, and `Read` tool calls automatically.

For the verified release flow with checksums, see [Install And Verify](#install-and-verify).

---

## Try The Demo

The fastest way to see yieldOS decide live, end-to-end, from a cloned checkout:

```bash
yieldOS/plugins/yieldos/bin/yieldos-oracle-demo missing-auth
```

What you should see, in order:

1. A vulnerable admin route returns `200` without auth.
2. yieldOS writes a scoped contract: unauthenticated requests must get `401` or `403`.
3. The counterexample replay proves the baseline violates the contract.
4. The agent can patch the route, but the model does not get to declare victory.
5. The same replay proves the fixed runtime kills the counterexample.
6. The proof artifacts are hashable evidence under `security/oracles/`.

To run an explicit changed-code audit against the current branch:

```text
/yieldos:audit
```

For Codex or plain shell demos, install native Git hooks in the test repo:

```bash
yieldOS/plugins/yieldos/bin/yieldos-git-hooks install
```

After that, ordinary `git commit` and `git push` commands hit the same
code-audit gate even when Claude Code plugin hooks are not running.

To run the local adversarial red-team / blue-team loop:

```text
/yieldos:pentest --max-rounds 3 --converge 2 --dry-run
```

Inspect every shipped oracle contract:

```text
/yieldos:oracle contracts
```

Walk-through detail and what each output line means: [`yieldOS/docs/22-oracle-demo-script.md`](./yieldOS/docs/22-oracle-demo-script.md).

---

## Install And Verify

Enterprise install flow verifies release files before execution:

```bash
curl -fsSLO https://github.com/platanus-hack/platanus-hack-26-ar-team-10/releases/download/yieldos--v0.14.0/install.sh
curl -fsSLO https://github.com/platanus-hack/platanus-hack-26-ar-team-10/releases/download/yieldos--v0.14.0/checksums.txt
shasum -a 256 -c checksums.txt --ignore-missing
sh install.sh --source platanus-hack/platanus-hack-26-ar-team-10 --dry-run
sh install.sh --source platanus-hack/platanus-hack-26-ar-team-10
```

The public install uses the clean package at [`dist/yieldos-plugin/`](./dist/yieldos-plugin). It ships hooks, commands, policy cache, dashboard runtime, skills, and oracle contracts. It does **not** ship tests, mocks, or intentionally vulnerable demo fixtures.

Current benchmark evidence is summarized in [`benchmarks/README.md`](./benchmarks/README.md). The real-repo benchmark shows the tested workflow attacks were blocked before commit; it does not claim the target repositories are fully secure. Use `npm run evidence:verify -- <reports...>` to separate public-proof reports from internal review artifacts before making external claims.

For supported adapters, data flows, and claim boundaries, see [`yieldOS/docs/enterprise-boundaries.md`](./yieldOS/docs/enterprise-boundaries.md).

---

## Plugin Commands

| Command | What it does | Detail |
| --- | --- | --- |
| `/yieldos:audit` | On-demand changed-code source review (Deepsec PR mode by default; `--staged`, `--working`, `--base <ref>`, `--full` available). | [`docs/13-audit-command.md`](./yieldOS/docs/13-audit-command.md) |
| `/yieldos:init` | Preview-first generation of `AGENTS.md` and `CLAUDE.md` safety instructions. Writes only with `--write`. | [`docs/14-custom-instructions.md`](./yieldOS/docs/14-custom-instructions.md) |
| `/yieldos:pack` | Compile a reviewed `yield.agent-pack.yaml` into host-native guidance (Claude Code, Codex, Cursor, Copilot, Windsurf), with pack lock and verification. | [`docs/17-team-agent-packs.md`](./yieldOS/docs/17-team-agent-packs.md) |
| `/yieldos:oracle` | Discover and run scoped oracle checks. Returns `pass`, `fail`, or `unknown`. | [`docs/19-oracle-driven-harness.md`](./yieldOS/docs/19-oracle-driven-harness.md) |
| `/yieldos:oracle-demo` | Visible counterexample → fix → proof flow for the `missing-auth` contract. | [`docs/22-oracle-demo-script.md`](./yieldOS/docs/22-oracle-demo-script.md) |
| `/yieldos:pentest` | Local adversarial red-team / blue-team loop with persistent memory and a live dashboard. | [`docs/15-pentest-loop.md`](./yieldOS/docs/15-pentest-loop.md) |
| `/yieldos:update` | Refresh the installed plugin to the latest release. Equivalent to `claude plugins update yieldos@yieldos`. | [`yieldOS/README.md`](./yieldOS/README.md#updates-and-releases) |

---

## Repository Map

| Path | Purpose |
| --- | --- |
| [`install.sh`](./install.sh) | Claude Code plugin installer. |
| [`policy/`](./policy) | Runtime policy source of truth: allowlist, denylist, skills, MCPs, categories, native equivalents, settings, and injection patterns. See [`policy/README.md`](./policy/README.md). |
| [`yieldOS/`](./yieldOS) | Product workspace: plugin source, docs, packs, playbooks, benchmark runner. |
| [`yieldOS/plugins/yieldos/`](./yieldOS/plugins/yieldos) | The actual Claude Code plugin: hooks, commands, scripts, dashboard, shipped policy cache, and tests. |
| [`yieldOS/docs/`](./yieldOS/docs) | Product and architecture docs. The docs index separates shipped surfaces from forward-looking plans. |
| [`yieldOS/packs/`](./yieldOS/packs) | Dogfood team agent pack manifest. |
| [`yieldOS/playbooks/`](./yieldOS/playbooks) | Reviewed playbooks compiled by `/yieldos:pack`. |
| [`dist/yieldos-plugin/`](./dist/yieldos-plugin) | Clean installable plugin package used by the marketplace manifest. |
| [`examples/oracle-demo/`](./examples/oracle-demo) | Runnable missing-auth baseline/fixed demo fixture, kept outside the production plugin package. See [`examples/oracle-demo/README.md`](./examples/oracle-demo/README.md). |
| [`benchmarks/`](./benchmarks) | Checked-in benchmark reports and benchmark notes. |
| [`landing/`](./landing) | Next.js landing page, isolated from the plugin runtime. |
| [`scripts/`](./scripts) | Repository-level tooling: release helper, plugin packaging, policy check, secret-scan smoke, evidence verifier, benchmark runners. |
| [`.github/workflows/`](./.github/workflows) | CI for plugin validation, security scans, release packaging, and the yieldOS test matrix. |

---

## Validate Locally

Plugin runtime supports **Node.js 18+**. The root and landing toolchain is pinned to **Node.js 22.x**.

From a fresh clone:

```bash
git clone https://github.com/platanus-hack/platanus-hack-26-ar-team-10.git
cd platanus-hack-26-ar-team-10
sh install.sh --dry-run
node scripts/plugin-check.mjs
npm run package:plugin
npm test
```

For plugin-only iteration:

```bash
cd yieldOS/plugins/yieldos
node --test tests/*.test.js
```

For landing-only iteration:

```bash
npm --prefix ./landing ci
npm --prefix ./landing run lint
npm --prefix ./landing run build
```

If Claude Code plugin support is available locally:

```bash
claude plugins validate .
claude plugins validate yieldOS/plugins/yieldos
```

---

## Documentation

| Document | What it covers |
| --- | --- |
| [`yieldOS/README.md`](./yieldOS/README.md) | Product README with the full decision-flow diagram and command reference. |
| [`yieldOS/docs/README.md`](./yieldOS/docs/README.md) | Index for all design docs (philosophy, architecture, decision log, oracles, agent packs, enterprise boundaries). |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | Local validation commands, security boundaries, and PR checklist. |
| [`SECURITY.md`](./SECURITY.md) | Supported versions, vulnerability reporting, triage expectations. |
| [`SUPPORT.md`](./SUPPORT.md) | Where to file bugs, false positives, and benchmark questions. |
| [`CHANGELOG.md`](./CHANGELOG.md) | Released versions and what shipped in each. |
| [`benchmarks/README.md`](./benchmarks/README.md) | Benchmark methodology, public vs. local-review evidence. |
| [`policy/README.md`](./policy/README.md) | Runtime policy schema and contribution flow. |
| [`landing/README.md`](./landing/README.md) | Landing page setup and Vercel configuration. |
| [`README.es.md`](./README.es.md) | This README in Spanish. |

---

## Current Boundaries

- Strong pre-tool runtime enforcement is Claude Code hook enforcement. Codex, Cursor, Copilot, and Windsurf outputs generated by agent packs are reviewable guidance unless paired with host policy, native yieldOS Git hooks, yieldOS verification, or CI.
- Deepsec is optional external tooling for `/yieldos:audit`; yieldOS prints setup guidance if it is unavailable.
- Security-contract `pass` means the exact scoped subject passed the exact configured oracle check. It is not a blanket proof that the whole repository is secure.
- Runtime policy ships as JSON and refreshes from `/policy`; local user edits are not policy authority.
- Oracle contracts ship with status. Read `active-adapter`, `active-demo`, and `contract-only` literally; a contract-only entry is a reviewed contract shape, not a claim of runnable coverage.
- The production package excludes tests, mocks, and intentionally vulnerable demo fixtures. Reviewer demos live under `examples/`.
- Team agent packs validate MCP policy references and approved tool lists. Direct `claude mcp add` commands are blocked until source and tool-surface validation exists; reviewed MCP activation should go through pack verification.
- Dockerfile scanning and a standalone lockfile CI gate are design notes, not shipped runtime behavior.

---

## Release

Maintainers publish a plugin release from the repository root:

```bash
node scripts/release.mjs bump patch --note "Describe the change"
npm run package:plugin
node scripts/plugin-check.mjs
(cd yieldOS/plugins/yieldos && node --test tests/*.test.js)
git add .
git commit -m "Release yieldOS vX.Y.Z"
git tag yieldos--vX.Y.Z
git push origin main yieldos--vX.Y.Z
```

Claude Code uses the plugin version in [`yieldOS/plugins/yieldos/.claude-plugin/plugin.json`](./yieldOS/plugins/yieldos/.claude-plugin/plugin.json) plus the marketplace manifests to decide whether an update is available.

---

## Team

team-10 — Platanus Hack 26, Buenos Aires.

- Ignacio Estevo — [@NachoEstevo](https://github.com/NachoEstevo)
- Sebastian Buffo Sempe — [@sbuffose](https://github.com/sbuffose)
- Franco Ferreira — [@frxnnk](https://github.com/frxnnk)
- Mauro Proto Cassina — [@MauroProto](https://github.com/MauroProto)

---

## License

MIT. See the license note in [`yieldOS/README.md`](./yieldOS/README.md#license).
