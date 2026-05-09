# Architecture

## Plugin layout

```
plugins/yieldos/
├── .claude-plugin/
│   └── plugin.json                    Manifest
├── hooks/
│   └── hooks.json                     Hook registration
├── config/
│   └── defaults.json                  Plugin config (policy URL, TTLs, paths)
├── policy-cache/                      Shipped offline-fallback cache
│   ├── allowlist.json
│   ├── denylist.json
│   ├── categories.json
│   ├── native-equivalents.json
│   ├── injection-patterns.json
│   ├── build-scripts-allowed.json
│   ├── required-settings.json
│   ├── skills.json
│   ├── mcps.json
│   └── version.json
├── scripts/
│   ├── pre-install-gate.js            PreToolUse entrypoint
│   ├── post-install-audit.js          PostToolUse entrypoint
│   ├── on-session-start.js            SessionStart entrypoint
│   ├── on-prompt-submit.js            UserPromptSubmit entrypoint
│   ├── yieldos-impact-trigger.js      PostToolUse impact event bridge
│   ├── audit-command.js               /yieldos:audit Deepsec wrapper
│   ├── oracle-command.js              /yieldos:oracle runner
│   ├── init-command.js                /yieldos:init generator
│   ├── agent-pack-command.js          /yieldos:pack compiler
│   ├── decide.js                      Decision tree (5-check flow)
│   ├── policy-fetcher.js              Online → runtime cache → shipped
│   ├── policy-lookup.js               Allowlist/denylist/native lookups
│   ├── logger.js                      Append-only log writer w/ secret redaction
│   ├── self-defense.js                Protected-path detection
│   ├── instruction-watcher.js         Hash-check on CLAUDE.md/AGENTS.md
│   ├── injection-scanner.js           Prompt-injection patterns
│   ├── transitive-auditor.js          Lockfile + OSV + age rule
│   ├── ui.js                          Terminal presenter + exact verdict lines
│   ├── code-audit/                    Commit/push source-code audit loop
│   ├── classifiers/
│   │   ├── index.js                   Orchestrator
│   │   ├── npm.js, pnpm.js, yarn.js, bun.js
│   │   ├── pip.js, poetry.js, uv.js
│   │   ├── cargo.js, go.js
│   │   ├── skills.js
│   │   ├── vendoring.js
│   │   └── binaries.js
│   ├── analyzers/
│   │   ├── index.js                   Orchestrator (parallel)
│   │   ├── script-detector.js
│   │   ├── osv-checker.js
│   │   ├── static-patterns.js
│   │   ├── obfuscation-detector.js
│   │   ├── binary-detector.js
│   │   ├── manifest-diff.js
│   │   ├── version-comparator.js
│   │   ├── settings-validator.js
│   │   └── lockfile-validator.js
│   └── rewriter/
│       ├── index.js
│       ├── analyze-viability.js       Categories A/D + threshold check
│       ├── inspect-source.js          Fetches package metadata
│       ├── read-project-context.js    Reads CLAUDE.md + project structure
│       └── generate-local.js          Writes scaffold + marker + index
├── skills/
│   └── dependency-gate/
│       └── SKILL.md                   Loaded when relevant
└── tests/
    ├── fixtures/                      Mocked policy & data for tests
    └── *.test.js                      node:test suites
```

## Hooks

Registered in `hooks/hooks.json`:

```
PreToolUse        Bash | Write | Edit | Read  → pre-install-gate.js
PostToolUse       Bash                        → post-install-audit.js, yieldos-impact-trigger.js
PostToolUse       Write | Edit | NotebookEdit → yieldos-impact-trigger.js
SessionStart                           → on-session-start.js
UserPromptSubmit                       → on-prompt-submit.js
```

`${CLAUDE_PLUGIN_ROOT}` is substituted by Claude Code with the absolute path of the installed plugin.

## Module dependency graph

```
                          ┌─────────────────────────┐
                          │   pre-install-gate.js   │
                          └────┬────────────────────┘
                               ↓
                   ┌───────────┼─────────────┬─────────────────┐
                   ↓           ↓             ↓                 ↓
            ┌──────────┐ ┌────────────┐ ┌──────────┐ ┌──────────────────┐
            │self-defense│ classifiers│ │ decide  │ │ injection-scanner │
            └──────────┘ └─────┬──────┘ └────┬─────┘ └──────────────────┘
                               ↓             ↓
                               │       ┌─────┼─────────────┐
                               │       ↓     ↓             ↓
                               │  policy-  rewriter   analyzers
                               │  lookup   ├──┬──┐    ├──┬──┬──┬──┐
                               │           │  │  │    │  │  │  │  │
                               │        analyze inspect read   script osv
                               │        viability source project detector checker
                               │                       context
                               ↓                                static
                          policy-fetcher                        patterns
                                                                ...
                          ↓
                  ┌──────────────────┐
                  │   logger.js      │ (used by all paths)
                  └──────────────────┘
```

## Runtime sequence — package install

```
agent: Bash("npm install lodash@4.17.21")
  │
  ↓
[Claude Code harness]
  │ env: CLAUDE_PLUGIN_ROOT=/.../yieldos/0.1.x
  ↓
PreToolUse hook fires
  │ stdin: {"tool_name":"Bash","tool_input":{...},"cwd":"/proj"}
  │
  ├─► self-defense.isProtectedPath()  → no
  │
  ├─► policy-fetcher.getPolicy()
  │     ├─ check runtime cache TTL
  │     ├─ if stale: fetch raw GitHub
  │     ├─ on failure: fall back to runtime
  │     └─ on no runtime: fall back to shipped
  │
  ├─► classifiers.classifyBashCommand()
  │     └─ npm classifier matches → [{name:"lodash", version:"4.17.21", manager:"npm"}]
  │
  ├─► For each candidate:
  │     decide.decide(candidate, policy, opts)
  │       ├─ check 1: native equivalent? → no
  │       ├─ check 2: allowlist? → yes
  │       └─ return {verdict:"allowlist-match", action:"allow"}
  │
  └─► logger.logAllowed()
      exit 0 (action proceeds)

[Claude Code harness] runs the actual `npm install`
  │
  ↓
PostToolUse hook fires
  │
  ├─► detectChangedManifests() → ["package-lock.json"]
  │
  ├─► transitive-auditor.audit(projectRoot, parent, policy, opts)
  │     ├─ list deps from lockfile
  │     └─ For each transitive:
  │         ├─ whitelist match? → mark
  │         ├─ publish date < 10 days? → suggest downgrade
  │         ├─ osv-check.checkPackage() → CVE alerts
  │         └─ denylist match? → alert
  │
  └─► logger.logTransitiveAudit()
```

## Runtime sequence — credential read

```
agent: Read({file_path: "/proj/.env"})
  │
  ↓
PreToolUse hook
  │
  ├─► credentials-scanner.isCredentialsPath() → yes
  │
  ├─► authorization flag active?
  │       yes → allow, log credentials-read-authorized
  │       no  → block, tell the user the exact local authorization phrase
  │
  └─► exit 2 unless user has explicitly authorized the read
```

## Runtime sequence — instruction file edit

```
agent: Edit({file_path: "/proj/CLAUDE.md", new_string: "...ignore previous..."})
  │
  ↓
PreToolUse hook
  │
  ├─► self-defense.isProtectedPath() → no
  │
  ├─► handleInstructionEdit():
  │     │ basename matches /CLAUDE\.md|AGENTS\.md|\.cursorrules/
  │     ↓
  │     scan content with policy['injection-patterns.json']
  │     ↓
  │     findings tier1/tier2 → BLOCK
  │
  └─► exit 2, log "Blocked Instruction File Edit (injection)"
```

## Three caches

1. **Shipped cache** — `policy-cache/` inside the plugin tarball. Updated only when the plugin itself releases. Always present.

2. **Runtime cache** — `~/.claude/plugins/yieldos/.runtime-cache/`. Refreshed online with TTL 5 min. Survives across sessions until invalidated.

3. **OSV cache** — `~/.claude/plugins/yieldos/.osv-cache/`. Per-package `<ecosystem>__<name>__<version>.json`. TTL 1 hour. Avoids hammering OSV API for the same `(pkg, version)` repeatedly.

## Logging And Audit State

Every hook can append to `<project>/security/dependency-events.md`. Format: markdown sections, append-only, secret-redacted.
Code audit also appends human-readable events to `<project>/security/code-audit-events.md` and writes the latest machine-verifiable state to `<project>/security/code-audit-state.json`.

```
## YYYY-MM-DD HH:mm - <Heading>
- Type: <library|skill|mcp|binary|vendored-code|instruction-file|...>
- Name: <pkg>
- Version: <ver>
- Source: <npm|pypi|...|repo URL>
- Requested by: agent
- Reason: <free-form>
- Command: <sanitized>
- ...
```

Headings used:
- `Allowed Install`
- `Blocked Install`
- `Verified Install (not allowlisted, passed analysis)`
- `Rewritten Locally`
- `Transitive Audit`
- `Self-Defense Trigger`
- `Blocked Instruction File Edit (injection)`
- `Required Settings Applied`
- `Instruction File Change Detected`
- `Credentials Read Blocked (no authorization)`
- `Credentials Read Allowed (under active authorization)`

Secret patterns redacted before write:
- `password|secret|token|api_key|access_key|private_key=...`
- `Bearer ...`
- `https://user:pass@host`
- `xox[abprs]-...` (Slack)
- `sk-...{20+}` (OpenAI/Anthropic)
- `ghp_...{20+}` (GitHub PAT)

## Self-defense

Paths protected from agent edit:

```
/.claude/plugins/yieldos/**
/.claude-plugin/{plugin.json,hooks/,scripts/,policy-cache/,config/}
/security/dependency-events.md
/security/code-audit-events.md
/security/code-audit-state.json
/security/yieldos-rewrites.json
/security/.yieldos-instruction-hashes.json
```

If a `Write` or `Edit` targets one of these, the hook blocks with `self-defense-block`. Same for `rm -rf .claude*`.

This makes yieldOS resistant to manipulation by:
- A malicious skill that asks the agent to disable yieldOS.
- An instruction-file edit that modifies the gate's behavior.
- An agent that tries to "clean up" the security log to hide a previous block.

## Process model

yieldOS does not run as a daemon. Each hook invocation is:

1. Claude Code spawns `node <hook-script>`.
2. The script reads stdin, does its job, writes stderr, exits.
3. Process dies.

There is no shared state between invocations except:
- The runtime cache files.
- The OSV cache files.
- The instruction-hash state file.
- The log file.

This makes the plugin trivially debuggable: one process, one input, one output.
