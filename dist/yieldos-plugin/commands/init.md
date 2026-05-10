---
allowed-tools: Bash(yieldos-init:*)
description: Generate CLAUDE.md and AGENTS.md safety instructions
---

# Init

Preview generated instructions:

```bash
yieldos-init $ARGUMENTS
```

Default mode previews the files. Add `--write` to create them.

Useful variants:

```bash
yieldos-init list
yieldos-init --agent both --scope project --profile secrets-safe,dependency-safe,code-audit --write
yieldos-init --agent claude --scope local --profile read-only,db-safe --write
yieldos-init --scope personal --profile production-safe,secrets-safe --write
```

Organization scope is export-only and does not write files automatically.
