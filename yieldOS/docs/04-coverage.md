# Coverage — what yieldOS gates

yieldOS gates dependency acquisition, agent-tool expansion, instruction changes, credential reads, protected evidence, and source-code audit boundaries. The classifiers detect each candidate; the decide module routes it through the appropriate flow.

```
┌──────────────────────────────────────────────────────────────────────┐
│                          Tool call intercepted                        │
│                    (Bash / Write / Edit / Read)                       │
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

Detectors:
```
claude mcp add <name> ...
claude mcp add-json <name> ...
```

**Routing**: direct MCP additions are blocked by default, even when the name exists in `policy/mcps.json`, because a name alone does not prove the server binary, source, or announced tool surface. Reviewed MCPs are activated through `yieldos-pack verify/write`, where the pack compiler checks requested tools against `policy/mcps.json` and records generated-file hashes in the pack lock.

## 4. Instruction file edits

Detectors: `Write` / `Edit` to:
- `CLAUDE.md`
- `AGENTS.md`
- `.cursorrules`

**Routing**: content scanned for prompt-injection patterns (`policy/injection-patterns.json`). Detection of tier1/tier2 patterns blocks the edit. The user gets `yieldOS bloqueó edición de CLAUDE.md: detectó intento de inyección`.

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
- `package.json`
- `requirements.txt`, `pyproject.toml`, `Pipfile`
- `Cargo.toml`
- `go.mod`

**Routing**: dependency additions or version changes are reconstructed from the edit and sent through the same policy decision flow as install commands. No-op edits produce no candidates.

This replaced the earlier pass-through model after manifest edits became a practical way to introduce unreviewed dependencies without running an install command first.

## 8. Credential-file reads

Detector: `Read` against credential-looking paths:

- `.env`, `.env.*`, `.npmrc`, `.pypirc`
- `.ssh/`, `.aws/`, `.kube/`, `.gcloud/`, `.docker/`
- private-key filenames such as `id_rsa`

**Routing**: blocked unless the user has just replied with the exact phrase `AUTORIZO A LEER LAS CREDENCIALES`. The authorization window is local to the project and expires after 30 minutes.

## 9. Git commit and push audit

Detector: `Bash` commands that execute `git commit` or `git push`, including common shell wrappers such as `cd app && git commit`, `git -C app commit`, `command git push`, `env ... git push`, `bash -lc "git commit"`, `sh -c "git push"`, and absolute `.../git commit` paths.

**Routing**: staged or outgoing source-code diffs are audited by the code-audit loop. Blocking findings stop the command; safe deterministic fixes are applied and the original commit is blocked so the user can review and rerun.

## What is NOT gated

- **README.md / docs** — pure data, not instructions to the agent. Reading them is fine; if the agent considers acting on a command found inside, that command goes through the normal Bash gate when executed.
- **Ordinary code edits** to project files (e.g., `src/index.ts`) — yieldOS does not block every edit. Source-code security review happens at `git commit` / `git push` and through `/yieldos:audit`.
- **`.gitignore`, `LICENSE`, `Dockerfile`, etc.** — out of scope.
- **Git operations other than `clone`, `commit`, and `push`** — not part of the shipped gate.

## Coverage matrix

| Vector | Detector | Default action when unlisted | Configurable via |
|---|---|---|---|
| Package install (npm/pip/etc.) | classifiers/* | run 5-check flow | allowlist, denylist, categories, native-equivalents |
| Skill activation | skills classifier | block | skills.json |
| MCP addition | mcps classifier | block direct add; verify through packs | mcps.json |
| Instruction file edit | injection scanner | allow if clean, block if tier1/tier2 | injection-patterns.json |
| `git clone` | vendoring classifier | block | (no per-repo allowlist today) |
| `curl ... \| sh` | binaries classifier | block | (no per-host allowlist today) |
| Manifest dependency edit | classifyWriteOrEdit | run decision flow | allowlist, denylist, categories, native-equivalents |
| Credential-file read | credentials scanner | block without exact user authorization | n/a |
| `git commit` / `git push` | code-audit command detector | audit/fix/block | code-audit rules |

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
