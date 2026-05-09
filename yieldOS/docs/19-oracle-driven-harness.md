# Oracle-Driven Harness

yieldOS now treats risky agent actions as acceptance decisions, not model opinions.

An oracle is a small executable or mechanically verifiable check that returns one of three scoped results:

- `pass`: this exact subject passed this exact check.
- `fail`: this exact subject violated this exact check.
- `unknown`: yieldOS could not produce enough evidence.

For sensitive actions, `unknown` blocks by default. This is the core safety rule for non-technical users: if yieldOS cannot prove a risky action is acceptable, the repo should not silently accept it.

The model can propose a patch, explanation, or finding. The oracle decides whether the repo accepts the result.

## Contract

Each oracle result includes:

- subject: the exact diff, pack, file, dependency, route, or replay checked.
- scope: what was checked and what was not checked.
- limits: why a pass is narrow.
- evidence: bounded, redacted facts.
- metrics: runtime, timeout, and evidence size.
- hashes: tamper-evident hashes for subject, evidence, and the result.

## Enforcement Boundary

Today, yieldOS can enforce strongest controls in protected Claude Code repos and CI-verified workflows. Cursor, Copilot, Windsurf, and Codex pack outputs are guidance until paired with yieldOS CLI verification, CI, or managed host policy.

## Why This Matters

Agent rules and skills are useful because they shape behavior before a risky action is attempted. Oracles are different: they decide whether the action is accepted after evidence exists.

This keeps the product honest:

- skills guide,
- policies constrain,
- hooks mediate,
- oracles accept or reject with scoped evidence,
- audit state records what happened.
