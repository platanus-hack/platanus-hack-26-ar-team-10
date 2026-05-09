# Oracle Evals And Metrics

yieldOS should not claim lower token cost until it is measured.

The current oracle benchmark records:

- decisions resolved without model,
- agent runs per audit,
- CI model calls,
- replay pass/fail/unknown rate,
- replay p50/p95 runtime,
- replay flake rate,
- generated report paths.

Run:

```bash
node yieldOS/plugins/yieldos/scripts/oracles/bench.js
```

Reports are generated under `security/`:

- `security/oracle-metrics.json`
- `security/oracle-cost-baseline.json`
- `security/oracle-flake-report.json`
- `security/oracle-artifact-size-report.json`

These are local/generated reports. They are not required committed artifacts unless CI explicitly consumes them.

## Benchmark Reports

Benchmark reports live in `benchmarks/`.

Use the report type that matches the claim:

- real-repo reports prove hook behavior in disposable clones of real repositories,
- code-audit fixture reports prove deterministic block/fix/allow outcomes across controlled cases,
- oracle-coverage reports show which oracle contracts are implemented, active, or still contract-only.

Run the current benchmark family:

```bash
node scripts/code-audit-benchmark.mjs \
  --out benchmarks/code-audit-benchmark-YYYY-MM-DD.json

node scripts/oracle-coverage-report.mjs \
  --out benchmarks/oracle-coverage-YYYY-MM-DD.json
```

The checked-in `benchmarks/code-audit-benchmark-2026-05-09.json` covers 15 fixture cases:

- 9 blocked,
- 2 fixed,
- 4 allowed,
- 15/15 expected outcomes matched.

The checked-in `benchmarks/oracle-coverage-2026-05-09.json` records 35 templates:

- 11 benchmarked,
- 3 active-adapter,
- 21 contract-only.

Contract-only means the oracle contract exists, but yieldOS should not claim runnable proof for it yet.

## Real-Repo Workflow Benchmark

The real-repo benchmark compares identical unsafe coding tasks in disposable clones:

- control arm: normal `git commit`,
- yieldOS arm: the same staged change through the real `pre-install-gate.js` hook.

Run:

```bash
node scripts/real-repo-benchmark.mjs \
  --repo /absolute/path/to/repo-a \
  --repo /absolute/path/to/repo-b \
  --out benchmarks/real-repo-benchmark-YYYY-MM-DD.json
```

The latest checked-in `benchmarks/real-repo-benchmark-4repos-2026-05-09.json` used:

- `New project` at `188d9d6e`,
- `tax-recopilator` at `2cf5b96b`,
- `vocero-platform` at `58d810ac`,
- `Automation-Agency` at `3b6dfb4`.

Results:

- 16/16 unsafe control commits succeeded without yieldOS.
- 16/16 matching yieldOS-gated commits were blocked before commit.
- YieldOS hook runtime: p50 96 ms, p95 118 ms.

This proves workflow prevention for the tested tasks: hardcoded secret, missing admin authz, SSRF, and shell injection. It does not prove either target repository is fully secure.

The older `benchmarks/real-repo-benchmark-2026-05-09.json` remains as the first 2-repo run.
