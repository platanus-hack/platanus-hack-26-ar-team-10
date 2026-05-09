# Real Repo Benchmarks And Preventive Learning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove yieldOS on disposable copies of real repos and turn security incidents into future agent workflow rules, not only one-off fixes.

**Architecture:** Keep benchmark execution deterministic and local: clone real repos into temporary working directories, run identical attack tasks in a control arm and a yieldOS-gated arm, then write compact reports into this repo only when results are useful. Add preventive learning as append-only project policy under `security/agent-learnings.md`; generated `AGENTS.md`/`CLAUDE.md` instructions tell agents to read it before coding, and the pentest loop promotes blue-team lessons into that file.

**Tech Stack:** Node.js CommonJS for plugin code and tests, Node.js ESM for root utility scripts, built-in `node:test`, local git clones, existing yieldOS code-audit and pentest-loop modules.

---

## Cause Analysis

The failure mode is not just "the code had a bug." The deeper cause is workflow memory loss:

- The agent fixes the immediate diff but the root cause is not converted into a preventive coding rule.
- Existing `security/pentest-memory.md` is useful for later pentest rounds, but normal coding instructions do not require reading those lessons before edits.
- Generated `AGENTS.md`/`CLAUDE.md` files contain general safety defaults, but they do not currently point at project-specific incident learnings.
- Benchmarks are mostly demo/replay-local today; they do not yet compare the same task on real repos with and without yieldOS.

The product fix is to change the agentic loop:

1. Detect or fix an issue.
2. Record root cause and preventive policy.
3. Make future agents read that policy before editing similar code.
4. Benchmark that the gate prevents the bad task in real repos where a normal commit would accept it.

## Task 1: Preventive Learning Policy

**Files:**
- Create: `yieldOS/plugins/yieldos/scripts/code-audit/pentest-loop/learning-policy.js`
- Modify: `yieldOS/plugins/yieldos/scripts/code-audit/pentest-loop/memory.js`
- Modify: `yieldOS/plugins/yieldos/scripts/code-audit/pentest-loop/orchestrator.js`
- Modify: `yieldOS/plugins/yieldos/scripts/code-audit/pentest-loop/blue-agent.js`
- Modify: `yieldOS/plugins/yieldos/scripts/init-profiles.js`
- Modify: `yieldOS/plugins/yieldos/scripts/init-command.js`
- Test: `yieldOS/plugins/yieldos/tests/pentest-loop.test.js`
- Test: `yieldOS/plugins/yieldos/tests/init-command.test.js`

- [ ] Add tests showing a pentest lesson also writes `security/agent-learnings.md`.
- [ ] Add tests showing generated project instructions tell agents to read `security/agent-learnings.md` before coding.
- [ ] Extend the blue-team JSON contract with optional `root_cause` and `preventive_policy`.
- [ ] Implement append-only learning blocks with root cause, preventive rule, verification habit, source round, and affected file.
- [ ] Wire orchestrator lessons into the preventive learning file without changing application source code.
- [ ] Keep old lesson JSON responses backward-compatible.
- [ ] Run `node --test tests/pentest-loop.test.js tests/init-command.test.js`.

Acceptance:

- A mocked red/blue pentest round writes both `security/pentest-memory.md` and `security/agent-learnings.md`.
- Generated `AGENTS.md` includes a concise instruction to read `security/agent-learnings.md` when present.
- Existing generated instructions still pass the prompt-injection scanner.

## Task 2: Real Repo Benchmark Harness

**Files:**
- Create: `scripts/real-repo-benchmark.mjs`
- Create: `benchmarks/README.md`
- Modify: `package.json`
- Test: `yieldOS/plugins/yieldos/tests/real-repo-benchmark.test.mjs`

- [ ] Add a benchmark runner that accepts `--repo <path>` multiple times, `--out <path>`, and `--runs N`.
- [ ] For each repo, clone `HEAD` into temporary control and yieldOS arms.
- [ ] Apply identical benchmark tasks to both arms: hardcoded secret, missing admin authz, SSRF, and shell injection.
- [ ] In the control arm, run a normal `git commit` and record whether the bad task would land.
- [ ] In the yieldOS arm, run the real `pre-install-gate.js` hook payload for `git commit` and record verdict, exit code, duration, findings, and whether the bad task was prevented.
- [ ] Write a JSON report containing source repo path, branch, commit, task results, aggregate prevention rate, control commit success rate, and timing.
- [ ] Keep temp clones outside the repo; only reports under `benchmarks/` are committed.
- [ ] Add tests using two temporary git repos so the harness is verified without network or mocks.

Acceptance:

- Running the script against two repos produces one JSON report.
- Control arm commits succeed for the attack tasks.
- yieldOS arm blocks or fixes the same attack tasks before commit.
- The report is deterministic enough for judging: includes exact repos, commits, commands, durations, and verdicts.

## Task 3: Run Real Benchmarks And Record Evidence

**Files:**
- Create: `benchmarks/real-repo-benchmark-YYYY-MM-DD.json`
- Modify: `benchmarks/README.md`
- Modify: `yieldOS/docs/23-oracle-evals.md`

- [ ] Run the benchmark harness on two local real repos outside `/Users/estevito/Desktop/vibeOS`.
- [ ] Inspect the JSON results and only keep the report if the run is meaningful.
- [ ] Summarize the benchmark in docs: what was tested, what was not tested, and why this is workflow prevention rather than app-level vulnerability proof.
- [ ] Run full plugin tests and root plugin check.
- [ ] Regenerate and commit `security/code-audit-state.json`.

Acceptance:

- A checked-in benchmark report shows two real repo paths and exact source commits.
- Docs clearly distinguish "yieldOS blocked this workflow attack" from "the whole repo is secure."
- `node --test tests/*.test.js`, benchmark tests, `node scripts/plugin-check.mjs`, and `code-audit ci-verify` pass.
