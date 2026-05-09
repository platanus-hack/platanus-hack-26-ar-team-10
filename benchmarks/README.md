# Benchmarks

This directory stores sanitized benchmark reports for yieldOS. Reports are committed only when they are useful evidence and do not include raw hook logs, raw output hashes, local absolute paths, or secret values.

## Benchmark Types

| Report | What it proves | What it does not prove |
| --- | --- | --- |
| `real-repo-benchmark-*.json` | The real `pre-install-gate.js` blocks the same unsafe staged changes in disposable clones of real repositories. | Whole-repo security, false-positive rate, or deep framework understanding. |
| `code-audit-benchmark-*.json` | The deterministic code-audit gate blocks, fixes, and allows controlled fixture commits as expected. | Behavior on every framework shape or runtime exploitability. |
| `oracle-coverage-*.json` | Which oracle templates are benchmarked, active adapters/demos, or still template-only. | That template-only cases are implemented. |

## Commands

```bash
node scripts/real-repo-benchmark.mjs \
  --repo /absolute/path/to/real/repo-a \
  --repo /absolute/path/to/real/repo-b \
  --out benchmarks/real-repo-benchmark-YYYY-MM-DD.json

node scripts/code-audit-benchmark.mjs \
  --out benchmarks/code-audit-benchmark-YYYY-MM-DD.json

node scripts/oracle-coverage-report.mjs \
  --out benchmarks/oracle-coverage-YYYY-MM-DD.json
```

Use `--include-raw-logs` only for local debugging. Raw logs and raw-output hashes should not be committed.

## Current Reports

### `real-repo-benchmark-4repos-2026-05-09.json`

- Repos: `New project`, `tax-recopilator`, `vocero-platform`, `Automation-Agency`.
- Tasks: hardcoded secret, missing admin authz, SSRF, shell injection.
- Result: 16/16 unsafe control commits succeeded; 16/16 matching yieldOS-gated commits were blocked before commit.
- Runtime: p50 96 ms, p95 118 ms for the yieldOS arm.

### `code-audit-benchmark-2026-05-09.json`

- Fixture cases: 15 total.
- Expected and observed outcomes: 9 blocked, 2 fixed, 4 allowed.
- Result: 15/15 expected outcomes matched.
- Auto-fix coverage: sensitive logging removal and open redirect replacement, both verified by file mutation, resolved-finding evidence, and post-fix pattern removal.
- Safe controls: guarded admin route, parameterized SQL, `execFile` argv, benign instruction edit.

### `oracle-coverage-2026-05-09.json`

- Oracle templates: 35 total.
- Status: 11 benchmarked, 3 active-adapter, 21 template-only.
- Kinds: 4 `cdsc-http`, 20 `static-diff`, 2 `dependency-policy`, 2 `instruction-policy`, 7 `agent-permission`.

## Legacy Report

`real-repo-benchmark-2026-05-09.json` is the original 2-repo run against `tax-recopilator` and `vocero-platform`: 8/8 control unsafe commits succeeded and 8/8 yieldOS-gated commits were blocked.
