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

The checked-in `benchmarks/real-repo-benchmark-2026-05-09.json` used:

- `tax-recopilator` at `2cf5b96b`,
- `vocero-platform` at `58d810ac`.

Results:

- 8/8 unsafe control commits succeeded without yieldOS.
- 8/8 matching yieldOS-gated commits were blocked before commit.
- YieldOS hook runtime: p50 109 ms, p95 126 ms.

This proves workflow prevention for the tested tasks: hardcoded secret, missing admin authz, SSRF, and shell injection. It does not prove either target repository is fully secure.
