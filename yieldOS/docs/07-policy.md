# Policy management

Reviewed policy lives at `github.com/yieldos/yieldos/policy/`. Installed plugins can fetch candidate bundles from that directory, but they only activate a bundle when `manifest.json` matches the manifest hash pinned in the installed plugin and every policy file matches the manifest. Policy is **not** editable locally.

## Policy files

```
policy/
├── allowlist.json              ← reviewed allow decisions for <ecosystem>:<name>[@version]
├── denylist.json               ← reviewed deny decisions with severity and references
├── categories.json             ← A/B/C/D + keyword fallback for unlisted
├── native-equivalents.json     ← which packages have a native API replacement
├── skills.json                 ← skill name → content hash
├── mcps.json                   ← mcp name → binary hash + allowed tools
├── injection-patterns.json     ← regex patterns for prompt-injection scanning
├── build-scripts-allowed.json  ← packages whose preinstall/postinstall is approved
├── required-settings.json      ← `.npmrc` / `pnpm-workspace.yaml` settings to enforce
├── version.json                ← policy version + decision-set hash
└── manifest.json               ← release-pinned file hashes
```

## Why centrally curated

Three reasons:

1. **Local edits are a footgun.** A user under pressure adds the malicious package to their local allowlist to "make it work". The protection is bypassed silently.

2. **Curation is a shared trust artifact.** When 100 users use the same policy, they benefit from the work of every PR reviewer. When they each maintain their own, nobody benefits.

3. **Updates flow through release trust.** A new supply-chain attack disclosed today can be added to denylist via PR, then shipped with a regenerated manifest and plugin pin. Installed clients reject mutable `main` drift until the release pin changes.

## Package policy shape

`allowlist.json` and `denylist.json` are runtime JSON, not prose. The stable identity is still `key`, for example `npm:react@18.3.1`, `npm:react`, or `python:requests==2.31.0`.

Allowlist entries require:

- `decision: "allow"`
- `category`
- `reviewed_by`
- `reviewed_at`
- `rationale`
- `allow_any_version: true` only for name-only entries

Denylist entries require:

- `decision: "deny"`
- `reason`
- `severity`
- `reviewed_by`
- `reviewed_at`
- `source_urls`

Runtime precedence is intentionally fail-closed: denylist wins before native-equivalent suggestions and allowlist matches. A package cannot be both allowlisted and denylisted without `scripts/policy-check.mjs` failing.

## Manifest-pinned cache

```
                   ┌──────────────────────┐
                   │  Online candidate    │  github.com/.../policy/
                   │  manifest + files    │
                   └──────────┬───────────┘
                              │ HTTPS fetch + sha256 verification
                              ↓
                   ┌──────────────────────┐
                   │  Runtime cache       │  ~/.claude/plugins/yieldos/.runtime-cache/
                   │  TTL 5 min           │  Last verified online bundle
                   └──────────┬───────────┘
                              │
                              ↓ fallback if online fails or is untrusted
                   ┌──────────────────────┐
                   │  Shipped cache       │  plugin/policy-cache/
                   │  Release-pinned      │  Always present, offline-safe
                   └──────────────────────┘
```

## Fetch strategy

```
getPolicy({ forceRefresh })
  │
  ├─ if (!forceRefresh && runtime cache fresh) → return runtime
  │
  ├─ try fetch manifest + files from origin
  │     ├─ manifest sha256 matches plugin pin
  │     ├─ every file sha256 matches manifest
  │     ├─ all JSON parses → atomically activate runtime cache, return online
  │     └─ any failure → discard candidate and fall through
  │
  ├─ try verified runtime cache → return runtime-cache-degraded
  │
  └─ try verified shipped cache → return shipped-cache-degraded
       └─ if missing too → unavailable (block on critical paths)
```

## Refresh triggers

| Event | Action |
|---|---|
| `SessionStart` | force refresh (ignore TTL) |
| `UserPromptSubmit` | refresh if TTL expired |
| `PreToolUse` per call | refresh if TTL expired (cache check) |

5-minute TTL means the runtime cache typically holds for the duration of a session, with at most one candidate refresh per 5 min on long sessions. The TTL does not bypass manifest verification.

## How to propose a policy change

The user does not edit policy locally. To add a package to the allowlist or denylist:

1. Open a PR to `github.com/yieldos/yieldos`.
2. Edit the relevant `policy/*.json` file.
3. Justify in the PR description (e.g., "this package is widely used and we have audited the postinstall script and verified the maintainer").
4. Maintainer reviews and runs `node scripts/generate-policy-manifest.mjs`.
5. Maintainer runs `node scripts/policy-check.mjs`.
6. The plugin release ships the updated `policy-cache/manifest.json` and pinned `policy.manifest_sha256`.
7. Installed clients accept the new online bundle only after their plugin pin matches it.

## What changes are valid in a PR

- Add a package to allowlist with a pinned version and rationale: `npm:lodash@4.17.21`.
- Add a name-only allowlist only when `allow_any_version: true` is justified.
- Add a package to denylist with a reason, severity, and source reference.
- Promote a package between categories (A → B, etc.).
- Add a native equivalent for a package.
- Add a skill content hash.
- Add an MCP allowance with limited tools.
- Refine an injection pattern (with documentation of why).
- Add a build script allowance with rationale.

## What is NOT valid

- Removing entries from the denylist without strong justification (the denylist is conservative and prefers false positives).
- Bulk allowlisting without per-package review.
- Wildcard matches (`npm:lodash.*`). Use a pinned key or an explicit name-only key with `allow_any_version: true`.

## Required-settings enforcement

`required-settings.json` lists per-manager settings that yieldOS enforces in the project:

```json
{
  "managers": {
    "pnpm": {
      "config_file": ".npmrc",
      "settings": {
        "minimum-release-age": "10",
        "block-exotic-subdeps": "true",
        "strict-dep-builds": "true",
        "trust-policy": "no-downgrade",
        "ignore-scripts": "true"
      }
    },
    "npm": {
      "config_file": ".npmrc",
      "settings": {
        "ignore-scripts": "true",
        "engine-strict": "true",
        "save-exact": "true"
      }
    },
    "yarn": {
      "config_file": ".yarnrc.yml",
      "settings": { "enableScripts": "false" }
    },
    "bun": {
      "config_file": "bunfig.toml",
      "settings": { "ignoreScripts": "true" }
    },
    "pip": {
      "config_file": "pip.conf",
      "settings": {
        "no-build-isolation": "false",
        "require-hashes": "true"
      }
    }
  }
}
```

`SessionStart` reads this and:
- Detects which managers the project uses (`package-lock.json`, `pnpm-lock.yaml`, `requirements.txt`, etc.).
- Reads the corresponding config file.
- Inserts missing settings.
- Logs `Required Settings Applied`.

## OSV cache

Separate from the policy cache. Per-package per-version, TTL 1 hour:

```
~/.claude/plugins/yieldos/.osv-cache/
├── npm__lodash__4.17.21.json
├── npm__react__18.3.1.json
├── PyPI__requests__2.31.0.json
└── ...
```

This avoids spamming `api.osv.dev` when checking the same package repeatedly during a session.

## Policy versioning

`version.json` carries:

```json
{
  "version": "1.0.0",
  "updated_at": "2026-05-09T00:00:00Z",
  "hash": "sha256:..."
}
```

The hash is the SHA-256 digest of the decision-bearing policy files, excluding `version.json` and `manifest.json`. `manifest.json` is the runtime integrity authority: it records each policy file's raw-byte SHA-256 and the installed plugin pins the manifest hash in `config/defaults.json`.

## Failure modes

| Failure | yieldOS behavior |
|---|---|
| Online unreachable, runtime cache present | Use runtime cache, log degraded mode |
| Online unreachable, runtime missing, shipped present | Use shipped, log degraded mode |
| All unreachable | Block on critical paths, log unavailable |
| Online returns malformed JSON | Treat as unreachable, fall back |
| Online returns 404 on one file | Discard the entire online candidate and fall back |
| Online manifest hash differs from plugin pin | Discard the online candidate and fall back |
| Runtime cache hash differs from manifest | Ignore runtime cache and fall back to shipped |
| Shipped cache hash differs from manifest | Treat policy as unavailable |

The system is **fail-closed** for critical paths: an unverified policy bundle is not used for dependency, skill, MCP, credential, or instruction decisions.
