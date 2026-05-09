---
allowed-tools: Bash(yieldos-audit:*)
description: Run a yieldOS source-code audit with Deepsec
---

# Audit

Run the bundled audit command:

```bash
yieldos-audit $ARGUMENTS
```

Default mode audits changed code only with Deepsec PR mode:

```bash
yieldos-audit --base origin/main
```

Useful variants:

```bash
yieldos-audit setup
yieldos-audit status
yieldos-audit --staged
yieldos-audit --working
yieldos-audit --full
```

If setup is missing, follow the printed Deepsec setup instructions. Do not
install Deepsec automatically.
