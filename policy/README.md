# yieldOS — Policy (source of truth)

This directory is the **online source of truth** for the yieldOS plugin's gating decisions. The plugin pulls these files at runtime via:

```
https://raw.githubusercontent.com/platanus-hack/platanus-hack-26-ar-team-10/main/policy/<file>
```

Refresh schedule (per yieldOS install):
- `SessionStart` → force refresh
- `UserPromptSubmit` if cache TTL expired
- `PreToolUse` if cache TTL expired (5 min default)

If the network or this directory is unreachable, the plugin falls back to:
1. The user's runtime cache at `~/.claude/plugins/yieldos/.runtime-cache/`
2. A snapshot **shipped inside the plugin** at `plugins/yieldos/policy-cache/`

## Files

| File | Purpose |
|---|---|
| `allowlist.json` | Packages explicitly approved to install (npm, pip, etc.). Match by `<ecosystem>:<name>@<version>` or `<ecosystem>:<name>` (any version). |
| `denylist.json` | Packages that must always be blocked (supply-chain attacks, typosquats, self-sabotaged packages). |
| `categories.json` | A/B/C/D classification + `D_never_rewrite` keywords. Cat A is the only path that triggers a local rewrite; Cat D is a hard block. |
| `native-equivalents.json` | Pointers from third-party packages to platform-native APIs (e.g. `npm:uuid` → `crypto.randomUUID()`). |
| `injection-patterns.json` | Regex patterns for detecting prompt-injection attempts in instruction files (`CLAUDE.md`, `AGENTS.md`). |
| `build-scripts-allowed.json` | Packages whose `preinstall` / `postinstall` lifecycle scripts are explicitly approved (sharp, bcrypt, esbuild, etc.). |
| `required-settings.json` | Per-package-manager settings that yieldOS enforces in the project (`.npmrc`, `pnpm-workspace.yaml`, etc.). |
| `skills.json` | Approved Claude Code skills with content hashes. |
| `mcps.json` | Approved MCPs with their allowed tool surfaces. |
| `version.json` | Cache invalidation marker. Bump when any of the above changes. |

## How to update policy

1. Open a Pull Request modifying the relevant JSON in this directory.
2. Bump `version.json` so existing yieldOS installs invalidate their runtime cache on next refresh.
3. Once merged into `main`, every yieldOS install picks up the change at the next `SessionStart` (or within 5 minutes of any tool call).

**Users cannot edit allowlist or denylist locally**. The local file under `~/.claude/plugins/cache/yieldos-marketplace/yieldos/<version>/policy-cache/` is a baseline that ships with the plugin release; the runtime cache overrides it once an online refresh succeeds.

## Why a separate `/policy/` instead of using `plugins/yieldos/policy-cache/` directly

The shipped cache (`policy-cache/`) and this directory (`policy/`) serve two different purposes:
- **`policy/`** is the editable source of truth. Updating it does NOT require a plugin release.
- **`policy-cache/`** is a frozen snapshot bundled with each plugin version, so a brand-new install works offline immediately.

When releasing a new plugin version, copy `policy/` into `plugins/yieldos/policy-cache/` so the snapshot stays current.
