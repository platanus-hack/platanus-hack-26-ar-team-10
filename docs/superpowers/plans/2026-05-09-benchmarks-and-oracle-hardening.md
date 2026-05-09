# Benchmarks And Oracle Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build multiple documented benchmark reports and strengthen the oracle catalog with more benchmarkable security cases.

**Architecture:** Keep real-repo benchmarking separate from controlled fixture benchmarking. Real-repo reports prove workflow behavior in real repositories; fixture reports exercise every deterministic rule and safe control; coverage reports explain oracle maturity without overstating runnable proof.

**Tech Stack:** Node.js ESM scripts, existing yieldOS pre-install hook, existing oracle contract data modules, `node:test`.

---

### Task 1: Code-Audit Fixture Benchmark

**Files:**
- Create: `scripts/code-audit-benchmark.mjs`
- Test: `yieldOS/plugins/yieldos/tests/code-audit-benchmark.test.js`

- [x] Add controlled git fixture cases for deterministic red-team rules: hardcoded secret, missing authz, SQL injection, shell injection, path traversal, unsafe file mutation, SSRF, removed security guard, dangerous instruction edit, sensitive logging auto-fix, and open redirect auto-fix.
- [x] Add safe negative controls for guarded admin route, parameterized SQL, `execFile` argv usage, and benign instruction-file edits.
- [x] Invoke the real `yieldOS/plugins/yieldos/scripts/pre-install-gate.js` hook instead of calling internals directly.
- [x] Write a sanitized JSON report with no raw logs by default.
- [x] Test that blocked, fixed, and allowed counts match expected outcomes.

### Task 2: Oracle Coverage Report

**Files:**
- Create: `scripts/oracle-coverage-report.mjs`
- Create: `benchmarks/oracle-coverage-2026-05-09.json`
- Test: `yieldOS/plugins/yieldos/tests/oracle-coverage-report.test.js`

- [x] Read current oracle contracts and public oracle registry.
- [x] Label every contract as `benchmarked`, `active-demo`, `active-adapter`, or `contract-only`.
- [x] Write summary totals by status and kind.
- [x] Test that known benchmarked code-audit cases and active adapters are represented.

### Task 3: Oracle Catalog Hardening

**Files:**
- Modify: `yieldOS/plugins/yieldos/scripts/oracles/templates/web.js`
- Modify: `yieldOS/plugins/yieldos/scripts/oracles/templates/api-agentic.js`
- Modify: `yieldOS/plugins/yieldos/tests/oracle.test.js`

- [x] Add `dangerous-file-upload` template mapped to OWASP/CWE dangerous upload guidance.
- [x] Add CWE-639 mapping to `idor-bola`.
- [x] Add CWE-770 mapping to resource-consumption.
- [x] Add persistent-memory prompt-injection template as an agentic benchmark target.
- [x] Test catalog IDs, standards mappings, and immutability.

### Task 4: Benchmark Docs And Real Repo Reports

**Files:**
- Modify: `benchmarks/README.md`
- Create: `benchmarks/code-audit-benchmark-2026-05-09.json`
- Create: `benchmarks/real-repo-benchmark-4repos-2026-05-09.json`
- Modify: `yieldOS/docs/23-oracle-evals.md`

- [x] Run code-audit fixture benchmark and store the report.
- [x] Run real-repo benchmark against clean local candidates: `Documents/New project`, `tax-recopilator`, `vocero-platform`, and `Automation-Agency`.
- [x] Update docs to explain benchmark families, latest results, and limits.
- [x] Keep report paths and logs sanitized.

### Task 5: Verification And Reviews

**Files:**
- All changed files.

- [x] Run focused tests for new scripts.
- [x] Run full plugin test suite.
- [x] Run `node scripts/plugin-check.mjs`.
- [x] Run `git diff --check`.
- [x] Run yieldOS code-audit verification and commit evidence.
- [x] Use subagent review for spec compliance and code quality before finalizing.

Evidence:

- `node --test tests/real-repo-benchmark.test.js tests/code-audit-benchmark.test.js tests/oracle-coverage-report.test.js tests/oracle.test.js` from `yieldOS/plugins/yieldos`: 27/27 passing.
- `node --test tests/*.test.js` from `yieldOS/plugins/yieldos`: 364/364 passing.
- `node scripts/plugin-check.mjs`: plugin structure OK.
- `git diff --check -- <benchmark/oracle scoped paths>`: clean.
- Sanitization scan over benchmark reports/scripts/docs: no raw logs, raw-output hashes, local absolute paths, or known secret/instruction strings in committed reports.
- Commit-mode yieldOS code-audit over staged benchmark/oracle scope: `code-audit-clean`, 18 audited files, 0 findings.
- Subagent spec/code reviews completed; the P2/P3 benchmark-evidence findings were resolved by adding fixed-outcome verification and removing raw-output hashes from committed reports.
