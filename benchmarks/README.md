# Benchmarks

This directory stores sanitized benchmark reports for yieldOS. Reports are committed only when they are useful evidence and do not include raw hook logs, raw output hashes, local absolute paths, or secret values.

## Benchmark Types

| Report | What it proves | What it does not prove |
| --- | --- | --- |
| `real-repo-benchmark-*.json` | The real `pre-install-gate.js` blocks the same unsafe staged changes in disposable clones of real repositories. | Whole-repo security, false-positive rate, or deep framework understanding. |
| `code-audit-benchmark-*.json` | The deterministic code-audit gate blocks, fixes, and allows controlled fixture commits as expected. | Behavior on every framework shape or runtime exploitability. |
| `oracle-coverage-*.json` | Which oracle contracts are benchmarked, active adapters/demos, or still contract-only. | That contract-only cases are implemented. |

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
Real-repo reports also require a clean benchmark-runner checkout by default; `--allow-dirty-runner` is only for local debugging output that should not be committed.

## Current Reports

### `code-audit-benchmark-2026-05-09.json`

- Fixture cases: 15 total.
- Expected and observed outcomes: 9 blocked, 2 fixed, 4 allowed.
- Result: 15/15 expected outcomes matched.
- Auto-fix coverage: sensitive logging removal and open redirect replacement, both verified by file mutation, resolved-finding evidence, and post-fix pattern removal.
- Safe controls: guarded admin route, parameterized SQL, `execFile` argv, benign instruction edit.

### `oracle-coverage-2026-05-09.json`

- Oracle contracts: 35 total.
- Status: 11 benchmarked, 3 active-adapter, 21 contract-only.
- Kinds: 4 `cdsc-http`, 20 `static-diff`, 2 `dependency-policy`, 2 `instruction-policy`, 7 `agent-permission`.

## Real-Repo Evidence

No real-repo JSON report is currently committed. Regenerate one from a clean checkout before using it as PR or release evidence.
