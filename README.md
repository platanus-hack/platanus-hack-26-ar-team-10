# yieldOS

<img src="./project-logo.png" alt="yieldOS logo" width="200" />

Track: AI Security

yieldOS is a Claude Code security plugin that gates the risky things AI agents do before they happen: dependency installs, skill/plugin/MCP additions, vendored code, remote bootstrap commands, and instruction-file edits.

It also protects credentials: prompts that look like they contain API keys trigger a no-echo security directive with a guided `.env` remediation panel, and reads of `.env`, `.ssh`, `.aws`, `.kube`, and similar credential paths require the exact local authorization phrase `AUTORIZO A LEER LAS CREDENCIALES`.

It now also audits source-code changes before `git commit` and `git push`: staged or outgoing diffs are red-teamed, safe fixes are applied when possible, and machine-verifiable audit state is written under `security/`. For user-invoked review, `/yieldos:audit` runs Deepsec on demand, scoped to changed code by default, and keeps a small command log at `security/audit-events.md`.

For project setup and deeper review, yieldOS also ships `/yieldos:init` to generate preview-first `AGENTS.md` / `CLAUDE.md` safety instructions, `/yieldos:pack` to compile policy-validated team agent packs into reviewable host-native guidance files, plus `/yieldos:pentest` for an explicit red-team / blue-team adversarial loop with persistent local memory.

Team agent packs let a repo carry one reviewed source of truth for approved skills, MCPs, safety profiles, playbooks, and target agents. The compiler validates the manifest against `policy/skills.json` and `policy/mcps.json`, then can generate `AGENTS.md`, `CLAUDE.md`, Cursor rules, GitHub Copilot instructions, Windsurf rules, repo-local skill folders, `.yield/pack-report.md`, and `yield.agent-pack.lock.json`. `yieldos-pack verify` also requires a lock when generated files are active and checks lock metadata plus file hashes.

Runtime policy lives in [`policy/`](./policy). Installed plugins refresh that online policy first and fall back to the bundled `policy-cache/` snapshot when offline.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/platanus-hack/platanus-hack-26-ar-team-10/main/install.sh | sh
```

Manual install:

```bash
claude plugins marketplace add platanus-hack/platanus-hack-26-ar-team-10
claude plugins install yieldos@yieldos
```

## Update

Once installed, update yieldOS from Claude Code with:

```text
/yieldos:update
```

Or from a terminal:

```bash
claude plugins marketplace update yieldos
claude plugins update yieldos@yieldos
```

Run `/reload-plugins` or restart Claude Code after updating so hooks switch to the new cached version.

## Audit

Run a changed-code source audit from Claude Code:

```text
/yieldos:audit
```

Useful variants:

```text
/yieldos:audit --staged
/yieldos:audit --working
/yieldos:audit --base origin/main
/yieldos:audit --full
```

Deepsec is external tooling. If it is not installed, `/yieldos:audit setup` prints the setup steps.

## Init And Pentest

Generate reviewable agent instructions:

```text
/yieldos:init
```

Preview the internal dogfood agent pack:

```text
/yieldos:pack preview --pack yieldOS/packs/yieldos-internal-security/yield.agent-pack.yaml
```

Run an adversarial red/blue loop:

```text
/yieldos:pentest --max-rounds 3 --converge 2 --dry-run
```

For longer audits, use `yieldos-pentest launch`, `yieldos-pentest watch`, and
`yieldos-pentest stop`. The terminal feed stays colored in a real TTY, and new
red/blue events can also surface in Claude Code chat through markdown diff
blocks. The pentest loop stores local state under `security/pentest-*` files so
rounds and lessons can be inspected later.

Open the local live dashboard when you want a browser view of the same
red/blue stream:

```bash
yieldos-pentest dashboard --start
yieldos-pentest dashboard --status
yieldos-pentest dashboard --stop
```

The dashboard listens on `http://127.0.0.1:5473` by default. Session-start
dashboard launch is opt-in only: set `YIELDOS_DASHBOARD_AUTO=1` or
`YIELDOS_DASHBOARD=auto` if you want Claude Code sessions to start it
automatically.

Maintainers publish a new plugin version from the repository root with:

```bash
node scripts/release.mjs bump patch --note "Describe the change"
node scripts/plugin-check.mjs
(cd yieldOS/plugins/yieldos && node --test tests/*.test.js)
git add .
git commit -m "Release yieldOS vX.Y.Z"
git tag yieldos--vX.Y.Z
git push origin main yieldos--vX.Y.Z
```

Claude Code uses the plugin version in `plugin.json` and the marketplace manifests to decide whether `/plugin update` has something new to install, so every release must bump those files together.

Reload or restart Claude Code after installing. The plugin is declared from this repository's root marketplace manifest and lives at:

```text
yieldOS/plugins/yieldos
```

## Validate Locally

```bash
sh install.sh --dry-run
claude plugins validate .
claude plugins validate yieldOS/plugins/yieldos

cd yieldOS/plugins/yieldos
node --test tests/*.test.js
```

Requires Claude Code with plugin support and Node.js 18+.

## Team

- Ignacio Estevo ([@NachoEstevo](https://github.com/NachoEstevo))
- Sebastian Buffo Sempe ([@sbuffose](https://github.com/sbuffose))
- Franco Ferreira ([@frxnnk](https://github.com/frxnnk))
- Mauro Proto Cassina ([@MauroProto](https://github.com/MauroProto))
