---
allowed-tools: Bash(yieldos-update:*), Bash(claude plugins list:*)
description: Update yieldOS to the latest published version
---

# Update yieldOS

Run the bundled updater:

```bash
yieldos-update $ARGUMENTS
```

Then verify the installed version:

```bash
claude plugins list
```

If the update succeeds, tell the user to run `/reload-plugins` or restart Claude Code so hooks and skills switch to the new cached version.
