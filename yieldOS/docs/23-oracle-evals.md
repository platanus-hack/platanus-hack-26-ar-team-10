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
