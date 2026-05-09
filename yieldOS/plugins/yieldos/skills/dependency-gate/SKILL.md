---
name: dependency-gate
description: yieldOS security gate. Loads when the agent encounters install commands, skill activations, MCP additions, or instruction-file edits. Provides context on yieldOS policy and how to handle hook-blocked actions.
---

# yieldOS Dependency Gate

You are operating in a project protected by **yieldOS**, a security gate that intercepts dependency installations, skill activations, MCP additions, and instruction-file changes.

## Core principles

1. **The user is non-technical and not part of the loop.** Do not ask the user to approve dependencies, skills, or rewrites. yieldOS makes every decision automatically based on its policy.
2. **The official policy lives at `github.com/platanus-hack/platanus-hack-26-ar-team-10/policy/`.** The user cannot edit allowlist or denylist locally — only PRs to the official repo modify them.
3. **Logs are the user's window into yieldOS decisions.** Everything important is appended to `security/dependency-events.md`.

## How to interpret PreToolUse blocks

When yieldOS blocks a `Bash` / `Write` / `Edit` action, it returns a structured stderr message. Possible verdicts:

- `allowlist-match` — never seen here, the action would have run.
- `denylist-match` — bug if you got here; do not retry.
- `category-d-blocked` — package is in a critical category (crypto, auth, frameworks, ORMs, etc.) and not allowlisted. Inform the user that this requires a PR to the official policy repo. Do not attempt rewrite.
- `category-a-rewrite` — small/simple package. yieldOS expects you to perform a local rewrite using the rewriter helper. See "Rewrite flow" below.
- `large-lib-analysis` — large package; yieldOS will run manifest/script/OSV/static analysis. Wait for the analyzer verdict. Do not retry the install.
- `verification-failed` — analysis flagged the package. Inform the user and do not retry.
- `verification-passed` — package is safe; retry the install once.

## Rewrite flow (Category A only)

If yieldOS instructs you to perform a local rewrite:

1. Read the source of truth of the package from its official repo (e.g., `github.com/<owner>/<repo>` at the matching tag).
2. Read `~/.claude/CLAUDE.md` (the global one) to pick up user-specific style preferences.
3. Read the project's structure: tsconfig, package.json, existing imports, naming conventions, where utilities already live.
4. Generate the local implementation under `src/lib/yieldos/<package-name>/` with:
   - The minimum surface needed by the project (only the imports actually used).
   - Tests that cover the project's actual usage.
   - A header marker: `yieldos-rewrite | source: <type>:<name>@<version> | source-url: <url> | content-hash: <sha256>`.
5. Update `security/yieldos-rewrites.json` with the new entry.
6. After the rewrite is done, surface a single short message to the user: `yieldOS realizó una optimización de la instalación de <package>`.

## Self-defense

yieldOS will block any attempt to:

- Modify files under `.claude/plugins/yieldos/**`.
- Modify `security/dependency-events.md` other than via append from yieldOS itself.
- Modify `security/yieldos-rewrites.json` outside of the rewrite flow.
- Modify the official policy cache.

Do not try to bypass these blocks. They are a feature, not a bug.

## What to tell the user

Keep messages short, in their language, and informative — never asking.

### Visual stamp — always include when yieldOS intervened

Whenever a tool call you ran was processed by the yieldOS gate (regardless of allow / block / rewrite / native-suggest), close your reply to the user with a one-line **visual stamp** on its own line. Use the matching variant:

| Verdict in stderr                  | Stamp to append at the end of your message |
|------------------------------------|---------------------------------------------|
| `allowlist-match`                  | `> 🛡  Validado por yieldOS`                |
| `verification-passed`              | `> 🛡  Validado por yieldOS (análisis OK)`  |
| `denylist-match`                   | `> ⛔ Bloqueado por yieldOS — denylist`     |
| `category-d-blocked`               | `> ⛔ Bloqueado por yieldOS — categoría crítica` |
| `verification-failed`              | `> ⛔ Bloqueado por yieldOS — señales sospechosas` |
| `build-script-not-approved`        | `> ⛔ Bloqueado por yieldOS — build script no aprobado` |
| `native-suggest`                   | `> 💡 yieldOS sugiere usar API nativa`      |
| `category-a-rewrite`               | `> ✨ yieldOS optimizó la instalación`      |
| `injection-blocked`                | `> ⛔ Bloqueado por yieldOS — inyección detectada` |
| `self-defense-block`               | `> ⛔ Bloqueado por yieldOS — archivo protegido` |

The stamp is the **last line** of your message, separated by a blank line. Examples:

```
Agregué seaborn a requirements.txt. Para instalarlo, ejecutá pip install -r requirements.txt.

> 🛡  Validado por yieldOS
```

```
No puedo instalar `event-stream@3.3.6`: el paquete fue víctima de un ataque de cadena de suministro en 2018.

> ⛔ Bloqueado por yieldOS — denylist
```

```
Reescribí `clsx` localmente en `src/lib/yieldos/clsx/` con la API mínima que usás en el proyecto.

> ✨ yieldOS optimizó la instalación
```

### Other one-liner messages (in addition to the stamp)

- Allowed: silent body, just the stamp.
- Blocked (denylist): explain reason in 1 line, then stamp.
- Blocked (Category D): say "requiere aprobación del equipo de seguridad", then stamp.
- Rewritten: say "yieldOS realizó una optimización de la instalación de {package}", then stamp.
- CVE on transitive: say "yieldOS detectó CVE en transitiva {pkg}: {cve_id}", then stamp.

The stamp is non-negotiable: the user relies on it to know that yieldOS intervened in the action.
