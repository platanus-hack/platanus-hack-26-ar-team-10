# Audit Command

`/yieldos:audit` is the on-demand source-code review command in yieldOS. It is
user-invoked and separate from automatic dependency hooks.

## Behavior

Default mode runs Deepsec against changed code:

```bash
yieldos-audit
```

That maps to:

```bash
deepsec process --diff origin/main
```

Supported options:

- `--base <ref>` changes the diff base.
- `--staged` audits staged changes.
- `--working` audits uncommitted and untracked changes.
- `--full` runs full Deepsec `scan` and `process`; this is explicit because it
  can be expensive.
- `--agent codex|claude` passes the agent choice through to Deepsec.

Deepsec is external tooling. yieldOS does not bundle it and does not install it
automatically. If it is missing, run:

```bash
npx deepsec init
cd .deepsec
pnpm install
```

Then complete `.deepsec/data/<id>/INFO.md`.

## Logging

Each run appends a small summary to:

```text
security/audit-events.md
```

The log records mode, base, Deepsec status, exit status, and artifact paths. It
does not store prompts, full diffs, raw findings, or secrets.

## Composition

When the `code-audit` module is available, `/yieldos:audit` runs a read-only
deterministic code-review pass after Deepsec over the same staged or base diff.
V1 reports high and critical findings only. It does not patch code; autofix
behavior stays in commit/push hooks.
