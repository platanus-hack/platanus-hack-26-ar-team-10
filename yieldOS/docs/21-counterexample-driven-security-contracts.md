# Counterexample-Driven Security Contracts

Counterexample-driven security contracts are the clearest product shape for yieldOS. The oracle-driven security harness is the machinery; the contract is what reviewers can inspect, run, and falsify.

For v0, the supported class is intentionally narrow:

```text
Unauthenticated request to a sensitive HTTP route must receive 401 or 403.
```

The contract has four parts:

1. **Invariant**: what must be true.
2. **Counterexample**: the concrete request or payload that should break vulnerable code.
3. **Oracle replay**: the executable check that observes the runtime response.
4. **Proof of fix**: the same counterexample no longer reproduces after the patch.

The proof requires both sides:

1. Baseline vulnerable replay fails the contract.
2. Fixed replay passes the same contract.

If the baseline does not fail, yieldOS reports blocking `unknown`. If the fixed replay does not pass, yieldOS reports `fail`.

The runner executes JSON replay contracts, not generated replay JavaScript. Runtime manifests use a constrained argv schema, not shell strings. CDSC v0 only allows the local Node executable with a relative project script, loopback HTTP URLs on the selected runtime port, and root-relative replay paths. Runtime execution from `yieldos-oracle` requires explicit `--allow-runtime`; the slash command lists oracles only.

The pass is scoped. It proves this route and replay only, not the whole repo. That scope is a feature: yieldOS should make narrow claims with executable evidence instead of broad claims that depend on model judgment.
