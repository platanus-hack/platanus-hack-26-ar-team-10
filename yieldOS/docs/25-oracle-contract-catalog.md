# Oracle Contract Catalog

The oracle catalog is the research-backed backlog for validation and benchmarks. It lives as executable data in:

```text
yieldOS/plugins/yieldos/scripts/oracles/templates/
```

Use it from the CLI:

```bash
yieldos-oracle contracts --json
```

The CLI also keeps `yieldos-oracle templates` as a compatibility alias; the public concept is an oracle contract.

## What An Oracle Contract Means

Each contract defines:

- standards mapping: OWASP Web/API/LLM, OWASP Cheat Sheets, and CWE where applicable.
- detection signals: code or policy shapes worth turning into deterministic checks.
- required evidence: source line, attacker-controlled input, sensitive sink, exploit path, and impact.
- acceptance criteria: what makes a scoped oracle `pass`, `fail`, or `unknown`.
- negative controls: benign cases that must not fire.
- benchmark fixtures and metrics: the test data and measurements needed before claiming coverage.

This is deliberately stricter than a scanner rule. A scanner can report a suspicion; a yieldOS oracle must produce scoped evidence or return `unknown`.

## Covered Families

The current catalog has 35 contracts:

- Web/API authorization: `missing-authz`, `idor-bola`, `removed-security-guard`, `broken-authentication`.
- API object properties and data exposure: `mass-assignment-bopla`, `excessive-data-exposure`.
- Injection: `sql-injection`, `nosql-injection`, `shell-injection`, `xss-unsafe-html`.
- File/network abuse: `path-traversal`, `unsafe-file-mutation`, `dangerous-file-upload`, `ssrf`, `open-redirect`, `csrf-missing-token`.
- Secrets and configuration: `sensitive-logging`, `hardcoded-secret`, `weak-crypto-random`, `security-misconfiguration`.
- Supply chain and integrity: `vulnerable-outdated-component`, `software-integrity-postinstall`, `unsafe-consumption-of-apis`, `insecure-deserialization`.
- Resource/cost/business controls: `unrestricted-resource-consumption`, `business-flow-abuse`.
- Agentic/LLM risks: `dangerous-instruction-edit`, `prompt-injection`, `persistent-memory-prompt-injection`, `excessive-agency`, `system-prompt-leakage`, `rag-vector-poisoning`, `llm-output-to-sensitive-sink`, `llm-data-model-poisoning`, `llm-misinformation-critical-decision`.

## Research Sources

Primary references used for the catalog:

- [OWASP Top 10:2021](https://owasp.org/Top10/2021/): web application risk families, especially A01, A02, A03, A04, A05, A06, A07, A08, A09, and A10.
- [OWASP API Security Top 10:2023](https://owasp.org/API-Security/editions/2023/en/0x00-header/): BOLA, broken authentication, BOPLA, broken function authorization, business-flow abuse, unrestricted resource consumption, SSRF, security misconfiguration, unsafe API consumption, and inventory/dependency risk.
- [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/): authorization, SQL injection prevention, OS command injection defense, SSRF prevention, and CSRF prevention.
- [OWASP Top 10 for LLM Applications 2025](https://genai.owasp.org/resource/owasp-top-10-for-llm-applications-2025/): prompt injection, sensitive information disclosure, supply chain, data/model poisoning, improper output handling, excessive agency, system prompt leakage, vector/embedding weaknesses, misinformation, and unbounded consumption.
- [MITRE CWE](https://cwe.mitre.org/data/index.html): missing authorization, incorrect authorization, improper authentication, hardcoded credentials, command injection, SSRF, open redirect, business logic errors, unsafe deserialization, and related weakness identifiers.

## Benchmark Implications

The next benchmark phase should not measure only whether `yieldos-oracle` exits quickly. It should measure:

- detection accuracy per contract: true positive, false positive, and `unknown` correctness.
- evidence completeness: whether the result contains source, input, sink, exploit path, and impact.
- replay reliability for runtime contracts: baseline/fixed pass rate and flake rate.
- artifact weight: bytes written under `security/oracles/**`.
- cost controls: runtime duration, local process count, token/tool-call budget where an agent is involved.
- real-repo behavior: pass/fail/unknown on repos that were not created for the demo.

## Boundaries

The catalog is not a claim that every contract has a complete runnable oracle today. It is the acceptance contract for turning each security family into a tested oracle. Existing runnable coverage remains:

- `instruction-policy`
- `agent-pack-lock`
- `code-audit-state`
- `project-tests`
- `cdsc-replay`
- `cdsc-proof`

Contracts that are not yet runnable should still be used for benchmark design. A benchmark should clearly label each case as `benchmarked`, `active-adapter`, `active-demo`, or `contract-only`.
