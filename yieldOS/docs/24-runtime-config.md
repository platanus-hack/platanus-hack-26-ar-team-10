# Runtime Config

yieldOS defaults to `standard` mode.

Create a repo config:

```bash
yieldos-config init --write
yieldos-config show
yieldos-config validate
yieldos-doctor
```

Default config:

```json
{
  "version": 1,
  "mode": "standard",
  "locale": "en",
  "ui": {
    "verbosity": "normal",
    "json": "claude-only"
  },
  "gates": {
    "dependencies": "standard",
    "skills": "review-unlisted",
    "mcps": "review-unlisted-readonly",
    "codeAudit": "block-high",
    "credentials": "block-with-nonce"
  },
  "orgOverlay": null
}
```

Resolution order:

1. `YIELDOS_MODE`
2. repo `.yieldos/config.json`
3. default `standard`

Invalid repo config fails closed for `yieldos-config validate`. Runtime hooks degrade to `standard` and print one warning so a bad config does not brick normal coding.

Modes:

- `monitor`: warnings/logs for lower-risk findings; still blocks credentials, protected yieldOS evidence, denylist hits, and critical code findings.
- `standard`: default. Blocks secrets, protected evidence, denylist, Category D, untrusted binaries/vendored code, and high-confidence code-audit findings. Low-risk unlisted skills and read-only MCPs route to review.
- `strict`: block-first posture with stricter medium code-audit and credential sentinel behavior.
- `enterprise`: strict plus verified pack lock and restrict-only org overlay.

Org overlays are restrict-only. They can raise the effective mode, disable globally allowed skills/MCPs, require profiles/playbooks/oracles, and add deny rules. They cannot approve a new skill or MCP outside global policy and cannot override the global denylist.
