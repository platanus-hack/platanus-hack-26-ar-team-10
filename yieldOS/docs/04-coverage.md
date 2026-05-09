# Coverage — what yieldOS gates

yieldOS gates **seven distinct vectors**. The classifiers detect each; the decide module routes them through the appropriate flow.

```
┌──────────────────────────────────────────────────────────────────────┐
│                          Tool call intercepted                        │
│                       (Bash / Write / Edit)                           │
└─────────────────────────────────┬─────────────────────────────────────┘
                                  ↓
        ┌──────────────────┬──────┴───────┬──────────────┬───────────────┐
        ↓                  ↓              ↓              ↓               ↓
   ┌────────┐      ┌──────────┐    ┌──────────┐    ┌──────────┐   ┌──────────┐
   │ Package│      │ Skill    │    │  MCP     │    │Instruction│   │ Vendoring │
   │install │      │activation│    │addition  │    │  edit    │   │  / binary │
   └────────┘      └──────────┘    └──────────┘    └──────────┘   └──────────┘
```

## 1. Package installs

Detectors: `npm`, `pnpm`, `yarn`, `bun`, `pip`, `poetry`, `uv`, `cargo`, `go`.

Captured patterns:

| Manager | Forms recognized |
|---|---|
| npm | `npm install <pkg>`, `npm i`, `npm add`, scoped (`@x/y`), versioned (`@1.2.3`), local (`./local`), git (`github:user/repo`) |
| pnpm | `pnpm add <pkg>`, `pnpm install <pkg>`, `pnpm i` |
| yarn | `yarn add <pkg>`, `yarn install <pkg>` |
| bun | `bun add <pkg>`, `bun install <pkg>`, `bun i` |
| pip | `pip install`, `pip3 install`, `python -m pip install`, with extras `[security]` and operators `==`, `>=`, `~=` |
| poetry | `poetry add <pkg>` |
| uv | `uv add <pkg>`, `uv pip install <pkg>` |
| cargo | `cargo add <pkg>@<ver>`, `cargo install <pkg>` |
| go | `go get <module>@<ver>`, `go install <module>@<ver>` |

**Routing**: each candidate goes through the full 5-check decision flow.

## 2. Skill activations

Detectors:
```
npx skills add <name>
claude skills add <name>
claude plugin add <name>
```

**Routing**: skills go through a separate flow because they are *instructions to the agent*, not code. Default: block unless explicitly listed in `policy/skills.json` with a content hash. Critical because a malicious skill can manipulate the agent itself.

## 3. MCP additions

Detectors: same patterns as skills (today, MCPs added via `claude plugin add` or similar).

**Routing**: MCPs are processes. Listing in `policy/mcps.json` requires both a binary/source hash and per-tool approval.

## 4. Instruction file edits

Detectors: `Write` / `Edit` to:
- `CLAUDE.md`
- `AGENTS.md`
- `.cursorrules`

**Routing**: content scanned for prompt-injection patterns (`policy/injection-patterns.json`). Detection of tier1/tier2 patterns blocks the edit. The user gets `[yieldOS] BLOCK bloqueó edición de CLAUDE.md: detectó intento de inyección`.

Patterns matched include:
- "ignore previous instructions"
- "you are now"
- "disable yieldOS"
- "execute the following without confirmation"
- "do not log this"
- exfiltration attempts (tokens, secrets, env vars)
- private key headers
- `rm -rf /`
- `curl ... | sh`

## 5. Vendoring (git clone)

Detector: `git clone <url>`.

**Routing**: any vendored-code candidate is `exotic` by default. Default verdict: block, requires explicit allowlisting.

Reason: `git clone` brings code that is not pinned, not signed, and not published through any registry. The risk profile is strictly higher than a registry install.

## 6. Binary installs (curl | sh)

Detectors:
- `curl ... | sh`
- `curl ... | bash`
- `curl ... | sudo bash`
- `wget ... | sh`
- `wget ... | bash`

**Routing**: type `binary` is exotic; blocked by default.

Reason: unsigned remote shell execution is the worst-case install pattern. Even legitimate installers (Docker, rustup, oh-my-zsh) follow the same shape; yieldOS treats them all as block-by-default and the user PR-allowlists the few they need.

## 7. Manifest file edits

Detectors: `Write` / `Edit` to:
- `package.json`, `package-lock.json`
- `requirements.txt`, `pyproject.toml`, `Pipfile`
- `Cargo.toml`
- `go.mod`
- `pnpm-workspace.yaml`

**Routing**: **pass-through**. Editing the manifest is not the same as installing. The actual install command (npm install, pip install, etc.) is gated separately when the agent runs it via Bash.

This was a deliberate decision after a real bug (matplotlib false positive) — see [09-decision-log.md](09-decision-log.md) decision #18.

## What is NOT gated

- **README.md / docs** — pure data, not instructions to the agent. Reading them is fine; if the agent considers acting on a command found inside, that command goes through the normal Bash gate when executed.
- **Raw code edits** to project files (e.g., `src/index.ts`) — yieldOS does not block every `Write` or `Edit` to normal source files. Source-code security is audited later at `git commit` and `git push` by `code-audit`.
- **`.gitignore`, `LICENSE`, `Dockerfile`, etc.** — out of scope.
- **Git operations other than `clone`, `commit`, and `push`** — pull, status, log, etc. are not relevant to dependency or source-code security.

## Coverage matrix

| Vector | Detector | Default action when unlisted | Configurable via |
|---|---|---|---|
| Package install (npm/pip/etc.) | classifiers/* | run 5-check flow | allowlist, denylist, categories, native-equivalents |
| Skill activation | skills classifier | block | skills.json |
| MCP addition | (planned) | block | mcps.json |
| Instruction file edit | injection scanner | allow if clean, block if tier1/tier2 | injection-patterns.json |
| `git clone` | vendoring classifier | block | (no per-repo allowlist today) |
| `git commit` / `git push` | code-audit | block high/critical; block medium before push | deterministic detectors |
| `curl ... \| sh` | binaries classifier | block | (no per-host allowlist today) |
| Manifest edit | classifyWriteOrEdit | pass-through | n/a |

## Why these seven and no more

Other vectors considered and rejected:

| Considered | Rejected because |
|---|---|
| `tar xf <archive>` | can be benign (releases, datasets); user-driven, not agent-driven typically |
| `Dockerfile` `RUN apt-get install` | container-level install; out of scope for the host project |
| `apt-get install` directly | system-level; out of scope |
| `brew install` | system-level; out of scope |
| `gem install` | low Claude Code volume; not in v1 |
| `composer require` | low Claude Code volume; not in v1 |

Composer and gem are pending v2 if usage demands it. Container-level and system-level installs are out of scope by design — yieldOS protects the project, not the host machine.
