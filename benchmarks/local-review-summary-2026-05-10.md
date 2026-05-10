# Local Review Benchmark Summary - 2026-05-10

This is a local-review benchmark package for yieldOS. It is useful for product and technical review, but the `local-review` reports should be regenerated from a clean checkout before becoming public claims.

## Reports

- `real-repo-benchmark-public-local-review-2026-05-10.json`
- `real-repo-benchmark-local-private-review-2026-05-10.json`
- `coverage-calibration-benchmark-local-review-2026-05-10.json`
- `false-positive-benchmark-public-local-review-2026-05-10.json`
- `cost-benchmark-public-local-review-2026-05-10.json`
- `model-workflow-benchmark-local-review-2026-05-10.json`
- `model-workflow-benchmark-expanded-local-review-2026-05-10.json`
- `model-workflow-benchmark-premium-spotcheck-local-review-2026-05-10.json`
- `scanner-comparison-benchmark-local-review-2026-05-10.json`

## Deterministic Prevention

Pinned public repos:

- 16 unsafe control commits would have landed without yieldOS.
- 16/16 matching yieldOS-gated commits were blocked before commit.
- Tested prevention rate for this task set: 100%.
- Hook runtime: p50 98 ms, p95 138 ms.

Local/private repos:

- 16 unsafe control commits would have landed without yieldOS.
- 16/16 matching yieldOS-gated commits were blocked before commit.
- Tested prevention rate for this task set: 100%.
- Hook runtime: p50 110 ms, p95 115 ms.

This proves workflow prevention for the tested task classes: hardcoded secret, missing admin authz, SSRF, and shell injection. It does not prove the target repositories are fully secure.

## Coverage Calibration

The coverage-calibration report is a more realistic presentation layer than a pure 100% prevention claim. It runs a balanced set through the same deterministic hook:

- 12 total calibration cases.
- 7 known-risk cases stopped immediately.
- 3 safe controls accepted.
- 2 realistic deeper-review candidates not instantly detected.
- Immediate correct-decision rate: 83.33%.
- Deeper-review candidate rate: 16.67%.

The two deeper-review candidates are common engineering shapes rather than artificial failures: a mounted admin router where the sensitive path is split across lines/modules, and a Prisma raw SQL helper shape outside the current string-query matcher. This is the right framing for enterprise security review: yieldOS has a strong measured boundary today, and the benchmark makes future oracle coverage explicit instead of pretending prevention is universal.

## False Positives

Sampled public benign commits:

- 27 benign commits replayed.
- 27 allowed.
- 0 blocked.
- 0 unknown.
- Sample false-positive rate: 0%.

The sampler only kept commits whose changed files were docs, tests, README/license, or CI paths. Earlier loose sampling caught a source-changing commit, which was removed from the false-positive evidence because it was not a clean benign sample.

## Cost Model

The cost report now uses the coverage-calibration set for the presentation graph. This avoids a zero-cost story while keeping the claim bounded:

- Baseline model-review assumption: $0.60 per risky task.
- Agent-assisted escalation assumption: $0.36 per deeper-review candidate.
- Calibration set: 7 known-risk cases stopped deterministically.
- Calibration set: 3 safe controls allowed.
- Calibration set: 2 deeper-review candidates routed to agent-assisted review or fix attempt.
- Public false-positive run: 0 false-positive review events.
- Without yieldOS: $5.40.
- With yieldOS: $0.72.
- Difference: $4.68 for this small benchmark set.

This is not a broad token-savings claim and it does not claim the agent repaired the two deeper cases. It models routing cost: deterministic cases are resolved at the hook boundary, deeper cases are sent to the user's coding agent, and a future repair benchmark would be required before claiming those deeper cases were repaired.

## Live Model Workflow - Initial Matrix

The live workflow benchmark used one local repo and one pinned public repo with OpenAI and Anthropic models. Provider spend stayed far under the configured caps:

- OpenAI cap: $20.00; spent: $0.1416.
- Anthropic cap: $100.00; spent: $0.8476.
- Total measured provider spend: $0.9892.

Aggregate:

- 48/48 cases completed.
- 36 generated patches were evaluable by the hook.
- 13 unsafe generated changes were prevented by yieldOS.
- 23 generated changes were accepted by yieldOS.
- p50 case runtime: 9.1 s.
- p95 case runtime: 20.3 s.

By model and arm:

| Model / arm | Evaluable patches | Cost | Accepted | Prevented |
| --- | ---: | ---: | ---: | ---: |
| `openai:gpt-5.1 / raw-agent` | 5 | $0.0524 | 4 | 1 |
| `openai:gpt-5.1 / yieldos-guided-agent` | 4 | $0.0629 | 2 | 2 |
| `openai:gpt-5-mini / raw-agent` | 5 | $0.0123 | 3 | 2 |
| `openai:gpt-5-mini / yieldos-guided-agent` | 3 | $0.0140 | 1 | 2 |
| `anthropic:claude-sonnet-4-20250514 / raw-agent` | 6 | $0.0574 | 4 | 2 |
| `anthropic:claude-sonnet-4-20250514 / yieldos-guided-agent` | 4 | $0.0859 | 4 | 0 |
| `anthropic:claude-opus-4-1-20250805 / raw-agent` | 5 | $0.2787 | 1 | 4 |
| `anthropic:claude-opus-4-1-20250805 / yieldos-guided-agent` | 4 | $0.4256 | 4 | 0 |

Interpretation: this benchmark does not show that one model is better overall. It shows the workflow value: models propose changes, some generated patches need repair or retry handling, and yieldOS still gives an executable acceptance boundary before risky changes land.

## Live Model Workflow - Expanded Frontier Slice

The expanded local-review slice used two local repos and two pinned public repos (`express`, `fastify`) with `gpt-5.5` and `claude-opus-4-7`. It ran 64 live cases across raw-agent and yieldOS-guided arms, three risky coding tasks, and one benign public-read control.

- OpenAI cap: $200.00; spent in this report: $0.9520.
- Anthropic cap: $500.00; spent in this report: $3.1073.
- Provider usage in this report: $4.0593.
- 64/64 cases completed.
- 57 generated patches were evaluable by the hook.
- 15 generated changes were prevented by yieldOS.
- 42 generated changes were accepted by yieldOS.
- p50 case runtime: 12.8 s.
- p95 case runtime: 47.0 s.

By task:

| Task | Evaluable patches | Accepted | Prevented |
| --- | ---: | ---: | ---: |
| `admin-users-route` | 16 | 1 | 15 |
| `webhook-importer` | 11 | 11 | 0 |
| `sql-search-endpoint` | 16 | 16 | 0 |
| `public-profile-read` | 14 | 14 | 0 |

By model and arm:

| Model / arm | Evaluable patches | Cost | Accepted | Prevented |
| --- | ---: | ---: | ---: | ---: |
| `openai:gpt-5.5 / raw-agent` | 16 | $0.2675 | 12 | 4 |
| `openai:gpt-5.5 / yieldos-guided-agent` | 11 | $0.6845 | 7 | 4 |
| `anthropic:claude-opus-4-7 / raw-agent` | 16 | $0.7554 | 12 | 4 |
| `anthropic:claude-opus-4-7 / yieldos-guided-agent` | 14 | $2.3519 | 11 | 3 |

Interpretation: the strongest currently measured live-model claim is narrow and defensible: across four repos, yieldOS consistently blocks generated unauthenticated admin-route changes when the model produces that unsafe surface, while allowing benign public-read changes. The SSRF and SQL tasks were mostly accepted in this slice, so those should be described as coverage targets or deterministic-oracle work rather than proven live-model prevention claims.

## Live Model Workflow - Premium Spotcheck

The premium spotcheck used pinned `express` only, with all configured frontier models (`gpt-5.5`, `gpt-5.5-pro`, `claude-sonnet-4-6`, `claude-opus-4-7`) and two tasks (`admin-users-route`, `public-profile-read`).

- 16/16 cases completed.
- Provider usage: $2.4502.
- 14 generated patches were evaluable by the hook.
- Evaluable outcomes: 6 prevented, 8 accepted.
- p50 case runtime: 10.4 s.
- p95 case runtime: 2m 42s.

By model and arm:

| Model / arm | Evaluable patches | Cost | Accepted | Prevented |
| --- | ---: | ---: | ---: | ---: |
| `openai:gpt-5.5 / raw-agent` | 2 | $0.0166 | 1 | 1 |
| `openai:gpt-5.5 / yieldos-guided-agent` | 2 | $0.0549 | 1 | 1 |
| `openai:gpt-5.5-pro / raw-agent` | 2 | $0.7440 | 1 | 1 |
| `openai:gpt-5.5-pro / yieldos-guided-agent` | 0 | $1.2608 | 0 | 0 |
| `anthropic:claude-sonnet-4-6 / raw-agent` | 2 | $0.0175 | 1 | 1 |
| `anthropic:claude-sonnet-4-6 / yieldos-guided-agent` | 2 | $0.0325 | 2 | 0 |
| `anthropic:claude-opus-4-7 / raw-agent` | 2 | $0.0757 | 1 | 1 |
| `anthropic:claude-opus-4-7 / yieldos-guided-agent` | 2 | $0.2482 | 1 | 1 |

Interpretation: `gpt-5.5-pro` worked in the account smoke test and completed the spotcheck, but it was the slowest path and consumed most OpenAI spotcheck cost. That is a useful workflow-cost finding, not a model-quality conclusion.

## Scanner Comparison

Local scanner availability:

- `gitleaks`: ran.
- `semgrep`: not installed.
- `codeql`: not installed.
- `snyk`: not installed.

Scanner comparison is complementary evidence only. yieldOS is being measured as a pre-commit workflow control, not a scanner replacement.

## Next Review Questions

- Should patch-contract friction stay in raw JSON only, or should there be a separate agent-friction appendix?
- Should the two coverage candidates become deterministic rules, oracle escalations, or both?
- Should the deterministic real-repo benchmark add more safe controls beyond docs/tests/CI false-positive replay?
- Should the public report target at least 50 benign commits before external publication?
