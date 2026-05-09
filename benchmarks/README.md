# Benchmarks

This directory stores benchmark reports that were run against disposable copies of real repositories.

Current real-repo benchmark command:

```bash
node scripts/real-repo-benchmark.mjs \
  --repo /absolute/path/to/real/repo-a \
  --repo /absolute/path/to/real/repo-b \
  --out benchmarks/real-repo-benchmark-YYYY-MM-DD.json
```

The runner creates temporary control and yieldOS-gated clones for each repository. The control arm commits the same unsafe task with normal `git commit`; the yieldOS arm sends the same commit through the real `pre-install-gate.js` hook and records whether the unsafe change was blocked or fixed before commit.

These reports prove workflow prevention for the tested tasks. They do not prove that the whole target repository is secure.

## Current Checked-In Report

- `real-repo-benchmark-2026-05-09.json`
- Repos:
  - `tax-recopilator` at `2cf5b96b`
  - `vocero-platform` at `58d810ac`
- Tasks: hardcoded secret, missing admin authz, SSRF, shell injection.
- Aggregate result: 8/8 unsafe control commits succeeded; 8/8 yieldOS-gated commits were blocked before commit.
- Hook runtime: p50 109 ms, p95 126 ms for the yieldOS arm.
