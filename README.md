# yieldOS

<img src="./project-logo.png" alt="yieldOS logo" width="200" />

**Executable security contracts for AI coding agents.**

AI coding agents can install dependencies, add tools, edit instruction files, read secrets, and commit code faster than a human reviewer can inspect every step. yieldOS is an oracle-driven security harness that turns risky agent actions into security contracts, counterexamples, and proof-of-fix evidence. The model can propose. The oracle decides.

## What Works Today

- Claude Code plugin hooks for `SessionStart`, `UserPromptSubmit`, `PreToolUse`, and `PostToolUse`.
- Pre-action gating for package installs, skill installs, direct MCP additions, manifest dependency edits, vendored code, remote shell installers, instruction-file edits, protected yieldOS evidence, and credential-file reads.
- Credential protection: reads of `.env`, `.ssh`, `.aws`, `.kube`, and similar paths require explicit local authorization.
- Commit/push source-code audit with red-team findings, deterministic blue-team fixes when safe, and commit-bound `security/code-audit-state.json`.
- Tamper-evident local audit events in `security/yieldos-events.jsonl`, with secret redaction, hash-chain verification, and an outside-repo tail checkpoint for review.
- Counterexample-driven security contracts: define the invariant, replay the unsafe baseline, replay the fixed runtime, and store scoped proof artifacts.
- Oracle runner with scoped `pass`, `fail`, and `unknown` results. Oracles execute contracts; for sensitive actions, `unknown` blocks by default.
- Team agent packs that validate approved skills, MCPs, playbooks, profiles, oracles, generated files, and pack locks.
- `/yieldos:audit`, `/yieldos:init`, `/yieldos:pack`, `/yieldos:oracle`, `/yieldos:pentest`, and `/yieldos:update` plugin commands.

## Install And Verify

Enterprise install flow verifies release files before execution:

```bash
curl -fsSLO https://github.com/yieldos/yieldos/releases/download/yieldos--v0.11.1/install.sh
curl -fsSLO https://github.com/yieldos/yieldos/releases/download/yieldos--v0.11.1/checksums.txt
shasum -a 256 -c checksums.txt --ignore-missing
sh install.sh --dry-run
sh install.sh
```

The public install uses the clean package at `dist/yieldos-plugin`. It ships hooks, commands, policy cache, dashboard runtime, skills, and oracle contracts. It does not ship tests, mocks, or intentionally vulnerable demo fixtures.

Inspect shipped oracle contracts:

```text
/yieldos:oracle contracts
```

For local product demos from a cloned repository, run the visible security-contract proof:

```text
yieldOS/plugins/yieldos/bin/yieldos-oracle-demo missing-auth
```

Expected demo beats:

1. A vulnerable admin route returns `200` without auth.
2. yieldOS writes a scoped contract: unauthenticated requests must get `401` or `403`.
3. The counterexample replay proves the baseline violates the contract.
4. The agent can patch the route, but the model does not get to declare victory.
5. The same replay proves the fixed runtime kills the counterexample.
6. The proof artifacts are hashable evidence under `security/oracles/`.

Run an explicit changed-code audit:

```text
/yieldos:audit
```

Run the local adversarial loop:

```text
/yieldos:pentest --max-rounds 3 --converge 2 --dry-run
```

Current benchmark evidence is summarized in [`benchmarks/README.md`](./benchmarks/README.md). The real-repo benchmark shows the tested workflow attacks were blocked before commit; it does not claim the target repositories are fully secure. Use `npm run evidence:verify -- <reports...>` to separate public-proof reports from internal review artifacts before making external claims.

For supported adapters, data flows, and claim boundaries, see [`yieldOS/docs/enterprise-boundaries.md`](./yieldOS/docs/enterprise-boundaries.md).

## Repository Map

| Path | Purpose |
| --- | --- |
| [`install.sh`](./install.sh) | Claude Code plugin installer. |
| [`policy/`](./policy) | Runtime policy source of truth: allowlist, denylist, skills, MCPs, categories, native equivalents, settings, and injection patterns. |
| [`yieldOS/plugins/yieldos/`](./yieldOS/plugins/yieldos) | The actual Claude Code plugin: hooks, commands, scripts, dashboard, shipped policy cache, and tests. |
| [`dist/yieldos-plugin/`](./dist/yieldos-plugin) | Clean installable plugin package used by the marketplace manifest. |
| [`yieldOS/docs/`](./yieldOS/docs) | Product and architecture docs. The docs index separates shipped surfaces from forward-looking plans. |
| [`examples/oracle-demo/`](./examples/oracle-demo) | Runnable missing-auth baseline/fixed demo fixture, kept outside the production plugin package. |
| [`yieldOS/packs/`](./yieldOS/packs) | Dogfood team agent pack manifest. |
| [`benchmarks/`](./benchmarks) | Checked-in benchmark reports and benchmark notes. |
| [`landing/`](./landing) | Next.js landing page, isolated from the plugin runtime. |

## Validate Locally

Plugin runtime supports Node.js 18+. The root/landing toolchain is pinned to Node.js 22.x.

```bash
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

## Current Boundaries

- Strong runtime enforcement is Claude Code hook enforcement. Codex, Cursor, Copilot, and Windsurf outputs generated by agent packs are reviewable guidance unless paired with host policy, yieldOS verification, or CI.
- Deepsec is optional external tooling for `/yieldos:audit`; yieldOS prints setup guidance if it is unavailable.
- Security-contract `pass` means the exact scoped subject passed the exact configured oracle check. It is not a blanket proof that the whole repository is secure.
- Runtime policy ships as JSON and refreshes from `/policy`; local user edits are not policy authority.
- Oracle contracts ship with status. Read `active-adapter`, `active-demo`, and `contract-only` literally; a contract-only entry is a reviewed contract shape, not a claim of runnable coverage.
- The production package excludes tests, mocks, and intentionally vulnerable demo fixtures. Reviewer demos live under `examples/`.
- Team agent packs validate MCP policy references and approved tool lists. Direct `claude mcp add` commands are blocked until source and tool-surface validation exists; reviewed MCP activation should go through pack verification.
- Dockerfile scanning and a standalone lockfile CI gate are design notes, not shipped runtime behavior.

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

Claude Code uses the plugin version in `yieldOS/plugins/yieldos/.claude-plugin/plugin.json` plus the marketplace manifests to decide whether an update is available.

## Team

- Ignacio Estevo ([@NachoEstevo](https://github.com/NachoEstevo))
- Sebastian Buffo Sempe ([@sbuffose](https://github.com/sbuffose))
- Franco Ferreira ([@frxnnk](https://github.com/frxnnk))
- Mauro Proto Cassina ([@MauroProto](https://github.com/MauroProto))
