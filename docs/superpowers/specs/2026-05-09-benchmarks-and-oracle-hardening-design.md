# Benchmarks And Oracle Hardening Design

## Goal

Build a benchmark surface that is credible for a hackathon and useful for product development: multiple benchmark reports, clear documentation, more oracle cases, and real-repo evidence that distinguishes what yieldOS blocks, fixes, allows, and still only describes as a template.

## Current State

- `benchmarks/` had one real-repo report and a short README.
- `scripts/real-repo-benchmark.mjs` proves four unsafe tasks against disposable clones of real repositories.
- The oracle catalog is broad, but many cases are contract-only.
- Runtime CDSC proof is strongest for missing authorization, while deterministic code audit has more implemented rules than the real-repo benchmark currently exercises.

## Design

Add three benchmark layers:

1. `real-repo` benchmark: run the existing hook against several real repositories in disposable clones. This proves workflow prevention on real repo shapes, not whole-repo security.
2. `code-audit-fixture` benchmark: run controlled fixture repos through the real hook for every deterministic code-audit rule, plus safe negative controls and deterministic auto-fix cases.
3. `oracle-coverage` report: map oracle contracts to current maturity so docs make clear which cases are benchmarked, active adapters/demos, or still contract-only.

Improve the oracle catalog with high-value gaps from OWASP API, OWASP LLM, WSTG, and CWE:

- add dangerous file upload,
- add CWE-639 to BOLA/IDOR,
- add CWE-770 to resource-consumption,
- add persistent memory prompt-injection as a distinct agentic case.

## Evidence Requirements

- No benchmark report should store raw hook logs, absolute local paths, or secret-like literals by default.
- Reports must include aggregate counts and per-case expected-vs-observed outcomes.
- Docs must explain differences between real-repo benchmarks, fixture benchmarks, runtime CDSC, active adapters, and contract-only oracle entries.
- Tests must cover report generation and the added catalog metadata.

## Out Of Scope

- No browser or visual verification.
- No heavy builds in external repositories.
- No claim that benchmarked repositories are fully secure.
