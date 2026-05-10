---
allowed-tools: Bash(yieldos-pack:*)
description: Preview, verify, or write yieldOS agent packs
---

# Pack

Preview generated agent-pack outputs:

```bash
yieldos-pack $ARGUMENTS
```

Default mode previews files. Use `write` or `--write` to create them.

Useful variants:

```bash
yieldos-pack preview --pack yield.agent-pack.yaml
yieldos-pack verify --pack yield.agent-pack.yaml
yieldos-pack write --pack yield.agent-pack.yaml
yieldos-pack write --pack yield.agent-pack.yaml --force
```

Generated output can include `AGENTS.md`, `CLAUDE.md`, Cursor rules, GitHub Copilot instructions, Windsurf rules, repo-local skill folders, `.yield/pack-report.md`, and `yield.agent-pack.lock.json`. It validates referenced skills and MCP tool surfaces against yieldOS policy before writing.
