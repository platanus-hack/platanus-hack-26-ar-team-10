# yieldOS Policy

This directory is the online source of truth for yieldOS policy files.

Installed plugins refresh these files from:

```text
https://raw.githubusercontent.com/platanus-hack/platanus-hack-26-ar-team-10/main/policy/<file>
```

Refresh behavior:

- `SessionStart` forces a policy refresh.
- `UserPromptSubmit` and `PreToolUse` refresh when the runtime cache TTL expires.
- The default TTL is 5 minutes.
- If the network or `/policy/` is unavailable, yieldOS falls back to the runtime cache and then to the bundled `policy-cache/` snapshot shipped inside the plugin.

Policy files:

- `allowlist.json` approves trusted packages.
- `denylist.json` blocks known bad packages.
- `categories.json` drives rewrite/block categories.
- `native-equivalents.json` maps packages to native APIs.
- `injection-patterns.json` detects instruction-file injection.
- `build-scripts-allowed.json` permits known lifecycle scripts.
- `required-settings.json` documents package-manager hardening.
- `skills.json` and `mcps.json` list approved Claude Code extensions.
- `version.json` is the cache invalidation marker.

To update policy, open a PR against this directory and bump `version.json`.
