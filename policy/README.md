# yieldOS Policy

This directory is the online source of truth for yieldOS policy files. The installed plugin carries a `policy-cache/` release snapshot for offline use, but local edits to that cache are not policy authority.

Installed plugins refresh these files from:

```text
https://raw.githubusercontent.com/yieldos/yieldos/main/policy/<file>
```

Refresh behavior:

- `SessionStart` forces a policy refresh.
- `UserPromptSubmit` and `PreToolUse` refresh when the runtime cache TTL expires.
- The default TTL is 5 minutes.
- If the network or `/policy/` is unavailable, yieldOS falls back to the runtime cache and then to the bundled `policy-cache/` snapshot shipped inside the plugin.

Policy files:

- `allowlist.json` approves reviewed packages with explicit decision metadata.
- `denylist.json` blocks known bad packages with severity, rationale, and references.
- `categories.json` drives rewrite/block categories.
- `native-equivalents.json` maps packages to native APIs.
- `injection-patterns.json` detects instruction-file injection.
- `build-scripts-allowed.json` permits known lifecycle scripts.
- `required-settings.json` documents package-manager hardening.
- `skills.json` and `mcps.json` list approved Claude Code extensions.
- `version.json` is the cache invalidation marker.

Runtime precedence:

1. Denylist wins.
2. Native-equivalent suggestions can block with a safer replacement.
3. Allowlist can allow reviewed package identities.
4. Unlisted or risky packages still go through category and analyzer checks.

Allowlist keys may be pinned (`npm:react@18.3.1`) or name-only (`npm:react`). Name-only entries must set `allow_any_version: true` with a rationale so reviewers can distinguish an intentional rolling allowance from an accidental broad match.

To update policy, open a PR against this directory, include the review rationale in JSON, keep `policy-cache/` in sync, run `node scripts/policy-check.mjs`, and bump `version.json` when the policy decision set changes.
