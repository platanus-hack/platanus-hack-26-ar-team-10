# Benchmarks

This directory stores sanitized benchmark reports for yieldOS. Reports are committed only when they are useful evidence and do not include raw hook logs, raw output hashes, local absolute paths, or secret values.

## Benchmark Types

| Report | What it proves | What it does not prove |
| --- | --- | --- |
| `real-repo-benchmark-*.json` | The real `pre-install-gate.js` blocks the same unsafe staged changes in disposable clones of real repositories. | Whole-repo security, false-positive rate, or deep framework understanding. |
| `code-audit-benchmark-*.json` | The deterministic code-audit gate blocks, fixes, and allows controlled fixture commits as expected. | Behavior on every framework shape or runtime exploitability. |
| `oracle-coverage-*.json` | Which oracle contracts are benchmarked, active adapters/demos, or still contract-only. | That contract-only cases are implemented. |
| `false-positive-benchmark-*.json` | Benign commits replayed through the hook and whether they were allowed, blocked, or escalated as unknown. | That all safe developer work is frictionless. |
| `coverage-calibration-benchmark-*.json` | A balanced calibration set showing immediate prevention, safe controls, and deeper-review candidates. | That yieldOS prevents every possible security issue today. |
| `cost-benchmark-*.json` | Assumption-based dollar model derived from measured rates and explicit pricing/human-time assumptions. | Provider billing savings unless real API usage reports are attached. |
| `model-workflow-benchmark-*.json` | Live OpenAI/Anthropic coding-workflow runs, model usage costs, and yieldOS acceptance outcomes. | A universal ranking of model quality or whole-repo security. |
| `scanner-comparison-benchmark-*.json` | Which optional local scanners were available and what output-size/exit evidence they produced. | That yieldOS replaces scanners. |

## Claim Levels

- `measured`: directly observed by a committed benchmark report.
- `assumption-based`: derived from measured counts plus explicit pricing or human-time assumptions.
- `not measured`: not safe to claim.

## Evidence Classes

- Public proof: measured report from a clean checkout, pinned commit, deterministic command, and complete sanitized artifact.
- Internal review: local-review report, dirty checkout report, assumption-based model, or report generated during claim exploration.
- Not claimed: external provider billing savings, whole-repo vulnerability discovery, or universal cross-agent prevention unless a public-proof artifact exists.

## Public Reproducibility

Public benchmark reports must include repo URL, pinned commit, sanitized output counts, and no local absolute paths. A report generated from a dirty benchmark runner should stay local unless it is explicitly marked as local-review evidence.

## False Positives

False positives are benign commits that yieldOS blocks. `unknown` is tracked separately because it is a safety escalation, not a successful allow.

## Cost Reports

Cost reports are assumption-based unless provider billing logs or live model workflow reports are attached. The calibrated cost model estimates broad review without yieldOS versus agent-assisted escalation with yieldOS; it does not claim broad token savings or automatic repair unless a repair benchmark is attached. Live model workflow reports measure provider token usage for the tested cases only.

## Commands

```bash
node scripts/real-repo-benchmark.mjs \
  --repo /absolute/path/to/real/repo-a \
  --repo /absolute/path/to/real/repo-b \
  --out benchmarks/real-repo-benchmark-YYYY-MM-DD.json

node scripts/real-repo-benchmark.mjs \
  --repo-spec benchmarks/public-repos.json \
  --out benchmarks/real-repo-benchmark-public-YYYY-MM-DD.json

node scripts/coverage-calibration-benchmark.mjs \
  --out benchmarks/coverage-calibration-benchmark-YYYY-MM-DD.json

node scripts/false-positive-benchmark.mjs \
  --repo-spec benchmarks/public-repos.json \
  --out benchmarks/false-positive-benchmark-YYYY-MM-DD.json

node scripts/cost-benchmark.mjs \
  --real-report benchmarks/real-repo-benchmark-public-YYYY-MM-DD.json \
  --false-positive-report benchmarks/false-positive-benchmark-YYYY-MM-DD.json \
  --coverage-report benchmarks/coverage-calibration-benchmark-YYYY-MM-DD.json \
  --assumptions benchmarks/cost-assumptions.json \
  --out benchmarks/cost-benchmark-YYYY-MM-DD.json

YIELDOS_ALLOW_PROVIDER_EGRESS=1 node scripts/model-workflow-benchmark.mjs \
  --repo /absolute/path/to/local/repo \
  --repo-spec benchmarks/public-repos.json \
  --repo-id express \
  --model-id gpt-5.5 \
  --task-id admin-users-route \
  --config benchmarks/model-workflow-config.json \
  --costs benchmarks/cost-assumptions.json \
  --checkpoint-every 1 \
  --max-cases 12 \
  --out benchmarks/model-workflow-benchmark-local-review-YYYY-MM-DD.json

node scripts/scanner-comparison-benchmark.mjs \
  --out benchmarks/scanner-comparison-benchmark-YYYY-MM-DD.json

node scripts/benchmark-visual-dashboard.mjs \
  --out benchmarks/visuals/benchmark-dashboard.html

node scripts/code-audit-benchmark.mjs \
  --out benchmarks/code-audit-benchmark-YYYY-MM-DD.json

node scripts/oracle-coverage-report.mjs \
  --out benchmarks/oracle-coverage-YYYY-MM-DD.json

npm run evidence:verify -- benchmarks/*benchmark*.json benchmarks/oracle-coverage-*.json
```

Use `--include-raw-logs` only for local debugging. Raw logs and raw-output hashes should not be committed.
Real-repo reports also require a clean benchmark-runner checkout by default; `--allow-dirty-runner` is only for local debugging output that should not be committed.
Model workflow reports load `.env` from the repository root for `OPENAI_API_KEY` and `ANTHROPIC_API_KEY`, enforce provider budget caps before each request, and exclude raw model output by default. Live provider calls are blocked unless `YIELDOS_ALLOW_PROVIDER_EGRESS=1` is set after confirming benchmark prompts may leave the machine. `--dry-run` and provider-budget skips stay offline, do not clone public repo specs, and do not require the egress opt-in. Reports include a `provider_egress` summary for each case so local-review evidence distinguishes dry-runs, budget skips, missing-credential failures, provider requests, and whether checked-out repository content was included. The current model workflow sends benchmark task prompts, not repository source files, so live cases record `provider_request_sent: true` and `repo_content_sent: false`. Use `--repo-id`, `--model-id`, and `--task-id` to run reproducible slices of the full matrix; use `--checkpoint-every 1` for long provider runs so partial local-review evidence is written after each case.

There is no `scripts/peer-repo-repair/` provider-repair runtime in this checkout. Any future repair workflow that sends repository context to OpenAI, Anthropic, or another provider should use the same explicit egress gate and report summary before it is advertised as supported benchmark coverage.

The default model workflow config currently targets account-visible frontier models (`gpt-5.5`, `gpt-5.5-pro`, `claude-sonnet-4-6`, `claude-opus-4-7`) with explicit pricing assumptions in `cost-assumptions.json`. Treat those dollar figures as local benchmark estimates until provider pricing pages are refreshed and cited for publication.

When `cost-benchmark` receives a `coverage-calibration` report, the cost graph uses the more realistic agent-assisted escalation model: known-risk cases stopped deterministically, safe controls allowed, and deeper-review candidates routed to the user's coding agent. This models routing cost only; claiming repair for those deeper cases requires a separate repair benchmark.

The visual dashboard is a standalone HTML file generated from the local-review JSON reports. It is designed for presentation screenshots and browser review; regenerate it with `npm run benchmark:visuals` after benchmark reports change. It intentionally keeps patch-format failures out of the main safety charts and uses the coverage-calibration report to show that immediate prevention is strong but not universal.

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

### `real-repo-benchmark-public-local-review-2026-05-10.json`

- Public-spec repos: `express`, `fastify`, `hono`, and `ky` at pinned commits.
- Tested unsafe control commits: 16.
- Matching yieldOS-gated commits blocked before commit: 16/16.
- Scope: hardcoded secret, missing admin authz, SSRF, and shell injection control tasks.
- Boundary: local-review evidence generated while this benchmark branch was under development; regenerate from a clean checkout before treating it as public release evidence.

### `coverage-calibration-benchmark-local-review-2026-05-10.json`

- Calibration cases: 12.
- Known-risk cases stopped immediately: 7.
- Safe controls accepted: 3.
- Deeper-review candidates surfaced: 2.
- Boundary: the deeper-review candidates are routing evidence, not proof of automatic repair.

### `cost-benchmark-public-local-review-2026-05-10.json`

- Cost model basis: coverage calibration with agent-assisted escalation.
- Without yieldOS: `$5.40`.
- With yieldOS: `$0.72`.
- Boundary: assumption-based routing-cost model, not provider billing savings.

### `false-positive-benchmark-public-local-review-2026-05-10.json`

- Benign public commits replayed: 27.
- Allowed: 27.
- Blocked: 0.
- Boundary: sampled benign replay, not a universal false-positive guarantee.

## Local Review Reports

Reports with `local-review` in the filename are intended for local inspection first. They are useful for expert review because the claims are bounded, sanitized, and reproducible from the included commands, but public marketing claims should be regenerated from a clean checkout and current provider pricing.

`npm run evidence:verify -- benchmarks/*benchmark*.json benchmarks/oracle-coverage-*.json` classifies reports as `PUBLIC` or `INTERNAL` and exits non-zero when any report is not public proof. A rejected report can still guide product decisions, but it must not become public proof until the missing clean-run requirements are fixed.
