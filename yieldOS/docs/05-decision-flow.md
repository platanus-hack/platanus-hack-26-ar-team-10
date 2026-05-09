# Decision flow — the full pipeline

Every install candidate goes through the same 5-check flow. Decisions are deterministic from `(candidate, policy)`.

## High-level diagram

```
                      ┌───────────────────────────────────┐
                      │  PreToolUse hook fires             │
                      │  Bash | Write | Edit               │
                      └───────────────┬───────────────────┘
                                      ↓
                      ┌───────────────────────────────────┐
                      │  Self-defense check                │
                      │  Is target a yieldOS-protected    │
                      │  file?                             │
                      └───────────────┬───────────────────┘
                              yes ┌───┴───┐ no
                                  ↓       ↓
                              BLOCK    ┌───────────────────────────┐
                              exit 2   │  Instruction-file edit?    │
                                       └───────────┬────────────────┘
                                              yes ┌┴┐ no
                                                  ↓  ↓
                                           Scan for ┌──────────────────────┐
                                           injection│ Classify Bash command │
                                                  ↓ │ or W/E target         │
                                          tier1/2 ↓ └────────┬─────────────┘
                                          → BLOCK ↓          ↓
                                          else: pass        For each candidate:
                                                            run 5-check flow
                                                            ↓
                                       ┌────────────────────┴───────────────────┐
                                       ↓                                        │
                                       │ CHECK 1: native equivalent?            │
                                       └─┬─yes─→ BLOCK with suggestion        │
                                         ↓ no                                   │
                                       ┌─────────────────────────────────────┐ │
                                       │ CHECK 2: allowlist match?           │ │
                                       └─┬─yes─→ ALLOW + log (silent)        │ │
                                         ↓ no                                  │ │
                                       ┌─────────────────────────────────────┐ │
                                       │ CHECK 3: denylist match?            │ │
                                       └─┬─yes─→ BLOCK + log + user msg      │ │
                                         ↓ no                                  │ │
                                       ┌─────────────────────────────────────┐ │
                                       │ CHECK 4: exotic source?             │ │
                                       │ (binary/vendoring/local/git)         │ │
                                       └─┬─yes─→ BLOCK (default deny)        │ │
                                         ↓ no                                  │ │
                                       ┌─────────────────────────────────────┐ │
                                       │ CHECK 5: classify A/D + thresholds  │ │
                                       └────┬─────────┬───────────────┬──────┘ │
                                            ↓ D       ↓ A or threshold ↓ none  │
                                          BLOCK    REWRITE LOCAL     ANALYZE   │
                                                                       ↓        │
                                                          ┌────────────────────┐│
                                                          │ Tier 1?  → BLOCK   ││
                                                          │ Tier 2 build script││
                                                          │   in allowlist?    ││
                                                          │   no → BLOCK       ││
                                                          │   yes → ALLOW      ││
                                                          │ Tier 3 → ALLOW + warn│
                                                          │ Clean  → ALLOW     ││
                                                          └────────────────────┘│
                                                                                │
                                  ↓ (any allow path)                            │
                                  ↓                                             │
                      Comando se ejecuta normalmente                            │
                                  ↓                                             │
                      ┌───────────────────────────────┐                         │
                      │ PostToolUse: transitive audit │                         │
                      │ (only when lockfile changed)  │                         │
                      └───────────────┬───────────────┘                         │
                                      ↓                                         │
                                Audit findings logged ←─────────────────────────┘
```

## Check-by-check semantics

### CHECK 1 — Native equivalent

Lookup `policy/native-equivalents.json` for `<ecosystem>:<package-name>`.

If found:
- Verdict: `native-suggest`
- Action: block install, suggest the native API
- User msg: `yieldOS sustituyó <pkg> por API nativa: <api>`

Examples:
- `npm install uuid` → suggest `crypto.randomUUID()`
- `npm install node-fetch` → suggest native `fetch` (Node 18+)
- `npm install lodash.clonedeep` → suggest `structuredClone()`
- `npm install dotenv` → suggest `node --env-file=.env` (Node 20+)

### CHECK 2 — Allowlist

Lookup `policy/allowlist.json` for an exact match `<ecosystem>:<name>@<version>`. If no version match, lookup `<ecosystem>:<name>` (any version).

If found:
- Verdict: `allowlist-match`
- Action: allow
- Log: silent (just an entry in `dependency-events.md`)

### CHECK 3 — Denylist

Lookup `policy/denylist.json` for `<ecosystem>:<name>@<version>` or `<ecosystem>:<name>`.

If found:
- Verdict: `denylist-match`
- Action: block
- User msg: `yieldOS bloqueó <pkg>: <reason>`

If a candidate matches both allowlist and denylist, denylist wins.

### CHECK 4 — Exotic source

If candidate `type` is `binary` or `vendored-code`, or `exotic === true`:
- Verdict: `verification-failed`
- Action: block
- User msg: `yieldOS bloqueó <pkg>: instalación de tipo <type> no permitida sin allowlist explícita`

This catches:
- `git clone` (vendoring)
- `curl | sh` / `wget | bash` (binaries)
- `npm install file:./local`
- `npm install github:user/repo`
- `pip install git+https://...`

### CHECK 5 — Categorize

Run the rewriter's `evaluate(candidate, metadata, policy, thresholds)`:

```
1. Is the package in categories.D_never_rewrite or matches keyword fallback?
   yes → block-category-d
   no  → continue
2. Is the package in categories.A_safe_to_rewrite?
   yes → rewrite-category-a
   no  → continue
3. Does the package metadata satisfy Category A thresholds?
   (size < 50KB AND files < 30 AND deps ≤ 1)
   yes → rewrite-by-threshold
   no  → large-lib-analysis
```

#### Category D match → block

User msg: `yieldOS bloqueó <pkg>: categoría crítica, requiere aprobación del equipo de seguridad`

#### Category A → rewrite local

Generate scaffold at `<project>/src/lib/yieldos/<package>/index.js` with header marker. User msg: `yieldOS realizó una optimización de la instalación de <pkg>`. Skill `dependency-gate` is loaded so the agent knows to populate the scaffold.

#### Else → analyzers (large-lib analysis)

Run all analyzers in parallel:
- `script-detector` — preinstall/install/postinstall/prepare scripts.
- `osv-checker` — known CVEs via OSV API.
- `static-patterns` — eval, child_process, .ssh, .aws, .npmrc access, suspicious TLDs.
- `obfuscation-detector` — entropy, hex strings, base64, short identifiers.
- `binary-detector` — `.node`, `.so`, `.dll`, etc. in tarball.
- `version-comparator` — bump type detection.

Aggregate to highest tier:
- **tier1** (eval, child_process_exec, .ssh access, critical CVE, downgrade, obfuscation) → **BLOCK**
- **tier2** (build scripts, native bindings) → BLOCK unless package is in `policy/build-scripts-allowed.json`
- **tier3** (medium CVE, oversized package, version too young, missing lockfile, env access) → ALLOW with warning
- **clean** → ALLOW as `verification-passed`

User msg by verdict:
- tier1 block: `yieldOS detectó señales sospechosas en <pkg> y bloqueó la instalación`
- tier2 block: `yieldOS bloqueó <pkg>: requiere aprobación de build scripts`
- tier3 allow: `yieldOS instaló <pkg> con advertencias (ver log)`
- clean: silent

## Verdict table

| Verdict | Action | Exit code | User message |
|---|---|---|---|
| `native-suggest` | block | 2 | `yieldOS sustituyó <pkg> por API nativa…` |
| `allowlist-match` | allow | 0 | (silent) |
| `denylist-match` | block | 2 | `yieldOS bloqueó <pkg>: <reason>` |
| `category-d-blocked` | block | 2 | `yieldOS bloqueó <pkg>: categoría crítica…` |
| `category-a-rewrite` | block + scaffold | 2 | `yieldOS realizó una optimización…` |
| `verification-passed` | allow | 0 | (silent or warning) |
| `verification-failed` | block | 2 | `yieldOS detectó señales sospechosas…` |
| `build-script-not-approved` | block | 2 | `yieldOS bloqueó <pkg>: requiere aprobación de build scripts` |
| `injection-blocked` | block | 2 | `yieldOS bloqueó edición de <file>: detectó intento de inyección` |
| `self-defense-block` | block | 2 | `yieldOS bloqueó modificación de archivo protegido…` |

## Post-install: transitive audit

When `PostToolUse` fires after a successful install, yieldOS runs the transitive auditor:

```
For each new transitive in the lockfile diff:
  1. Whitelist exact version match? → mark validated, log
  2. Else, fetch publish date.
     If publish_date > 10 days ago → mark "10-day rule", log
     Else → mark "incomplete audit", suggest downgrade to last version with ≥10 days
  3. OSV check → log CVE alerts
  4. Denylist match → alert + suggest rollback
```

Result is appended to the log as `Transitive Audit`. The user sees per-CVE alerts via stderr but nothing prompts.

## Pre-session and per-prompt hooks

`SessionStart`:
1. Force refresh policy from origin (online-first, fall back to cache).
2. Validate manager-required settings (`.npmrc`, `pnpm-workspace.yaml`, etc.); apply if missing.
3. Hash-check instruction files (`CLAUDE.md`, `AGENTS.md`, `.cursorrules`); flag changes.

`UserPromptSubmit`:
1. Refresh policy if cache is stale (TTL 5 minutes).
