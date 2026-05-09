# Oracle-Driven Security Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pivot yieldOS from “agent security tools and packs” into an oracle-driven acceptance layer for risky AI-agent coding actions in protected repos.

**Architecture:** Keep the existing hook/policy/code-audit/pack infrastructure, but introduce a narrow oracle contract that normalizes executable acceptance evidence. Existing gates become oracle families only when they can emit scoped `pass`, `fail`, or `unknown` results with hashes, limits, and enforcement semantics. The actual category proof is CDSC: a controlled contract + counterexample + baseline-fail + fixed-pass loop for one high-impact runnable class.

**Tech Stack:** Node.js 22, CommonJS plugin scripts, `node:test`, existing Claude Code plugin hooks/commands, existing code-audit and agent-pack modules, Next.js landing app.

---

## Executive Decision

The pivot is valid, but the first plan overclaimed and mixed too many things.

New center:

> yieldOS is an oracle-driven security harness for AI coding agents.

Precise implementation claim:

> yieldOS is an oracle-driven acceptance layer for risky AI-agent coding actions in protected Claude Code repos and CI-verified workflows.

This matters because the repo should not accept risky agent actions based only on model explanation. It should accept them only when a configured oracle returns scoped evidence.

An oracle is not “anything that sounds like a check.” In yieldOS, an oracle is a versioned result object produced by executable or mechanically verifiable work:

- `pass`: the exact subject passed the exact configured check.
- `fail`: the exact subject violated the configured check.
- `unknown`: yieldOS could not produce enough evidence.

For sensitive actions, `unknown` blocks by default.

## What Is Actually New

Not new:

- Dependency allow/deny policy.
- Claude Code hooks.
- Code-audit static findings.
- Agent packs.
- Project tests.
- Deepsec command wrapper.
- Local red/blue pentest loop.

Actually new:

- A common oracle result schema with explicit `scope`, `limits`, `blocking_reason`, timing, evidence hashes, and tamper-resistant artifacts.
- A runner that separates acceptance from model opinion.
- A CI-safe acceptance layer where model calls are never required to verify a PR.
- CDSC for a narrow but high-impact class: a missing-auth route produces a contract, a counterexample replay, baseline failure evidence, fixed-pass evidence, and a proof manifest.

The pitch should not say “we invented checks.” It should say:

> The model can propose. The oracle decides.

## Current Product Surface After Pivot

Keep as core implementation:

- Claude Code PreToolUse/PostToolUse/UserPromptSubmit/SessionStart hook integration.
- Dependency, skill, MCP, instruction-file, credential-read, commit, and push gates.
- `security/code-audit-state.json` commit-bound evidence.
- CI diff verification.
- Agent-pack lock verification.
- Pack generation for guidance files and skill distribution.

Demote from headline:

- “Nine package managers.”
- Category A local rewrite.
- Deepsec as a brand-name centerpiece.
- Pentest dashboard as main product.
- Cross-agent pack builder as main category.
- Vector DB/token-saving as primary proof.

Do not remove these from the code. They become supporting proof points, not the first sentence.

Do not claim:

- “Every AI coding agent is enforced.”
- “The repo is proven safe.”
- “Model-assisted findings are deterministic.”
- “Cursor/Copilot/Windsurf are hard-gated locally.”
- “CDSC works for arbitrary apps/classes.”

## Reviewer Corrections Incorporated

This plan supersedes the previous version. The following issues were explicitly fixed:

- Proof-of-fix now requires **baseline fail** plus **fixed pass**.
- Replay artifacts are JSON contracts executed by a built-in runner, not arbitrary generated JS.
- Replay runtime errors map to blocking `unknown`, not `fail`.
- Sensitive `unknown` blocks by default through an action-impact policy.
- Evidence hashes include full result/proof subjects, not only evidence arrays.
- `security/oracles/**` has an explicit generated-evidence policy and cannot accidentally poison code-audit diff hashes.
- Code-audit oracle preserves committed-state requirements for push/PR.
- Agent-sourced findings cannot become oracle evidence until deterministically grounded in current file content and diff hash.
- Project tests are reused/deduped from existing `runDetectedChecks` and never run on every tool call.
- Agent packs do not become the center; they distribute approved oracles and guidance only after oracles are stable.
- Product/landing changes wait until at least one real oracle path and one CDSC demo exist.

## PR Sequence

Ship this as seven reviewable PRs:

1. **PR A: Oracle Core, No Rebrand Yet**  
   Result schema, runner, list-only CLI, command registration, docs. No landing hero rewrite.

2. **PR B: Existing Checks As Oracle Adapters**  
   Code-audit state, agent-pack lock, instruction policy, dependency policy, and project tests emit oracle results with exact pass/fail/unknown semantics. No hook behavior changes.

3. **PR C: Evidence Artifact Policy**  
   Define `security/oracles/**`, redaction, size caps, hash strategy, generated-evidence diff exclusion, CI verification behavior, and tamper tests.

4. **PR D: CDSC Missing-Auth Demo**  
   Controlled Express route class only. Generate contract/replay JSON, prove baseline fail, prove fixed pass, write proof manifest.

5. **PR E: Demo Surface And Single Command**  
   Add a visible `/oracle-demo` or local demo command that shows the unsafe route, failed oracle, replay, fix, passing oracle, and scoped acceptance.

6. **PR F: Metrics And Benchmarks**  
   Measure deterministic resolution, agent calls, runtime cost, replay flake, artifact size, CI delta.

7. **PR G: Product Reframe And Agent Pack Packaging**  
   Update landing/docs/pitch. Add optional `oracles.include` to packs only after at least three real oracles exist and are measured.

Each PR must pass the full current suite unless explicitly scoped to docs only.

---

## Shared Oracle Result Contract

Every oracle result must use this shape:

```js
{
  version: '0.1',
  id: 'code-audit-state',
  kind: 'policy|test|evidence|counterexample|model-assisted',
  status: 'pass|fail|unknown',
  blocking: true,
  blocking_reason: 'sensitive-action-missing-evidence',
  subject: {
    type: 'git-diff|agent-pack|dependency|instruction-file|http-route|replay',
    ref: 'optional exact subject identifier'
  },
  scope: {
    checked: ['exact things checked'],
    not_checked: ['explicit limits']
  },
  limits: [
    'A pass is scoped to this subject and evidence only.'
  ],
  summary: 'Human-readable one-line result.',
  evidence: [
    { type: 'diff-hash', value: 'sha256:...' }
  ],
  metrics: {
    duration_ms: 0,
    timeout_ms: 30000,
    timed_out: false,
    evidence_bytes: 0
  },
  hashes: {
    subject: 'sha256:...',
    evidence: 'sha256:...',
    result: 'sha256:...'
  }
}
```

Core rules:

- `status=fail` is always blocking for security-sensitive actions.
- `status=unknown` is blocking for auth, production, credentials, dependencies, MCPs, skills, instruction files, git commit/push, and all CDSC flows.
- `status=unknown` may be nonblocking only for explicitly advisory or manually invoked non-sensitive checks.
- No model-only output may produce `pass`.
- Agent/Deepsec output may produce candidate findings, but oracle acceptance requires deterministic grounding or executable replay.

## Artifact Policy

Generated oracle artifacts live under:

```text
security/oracles/<oracle-id>/
  manifest.json
  contract.json
  replay.json
  baseline-result.json
  fixed-result.json
```

Rules:

- `security/oracles/**` is generated evidence, not source code.
- Add `security/oracles/**` to the code-audit generated-evidence exclusion list.
- Store artifact hashes in `security/code-audit-state.json`.
- CI verifies artifact hashes and the current diff hash.
- Artifacts must be size-capped.
- Evidence text must be redacted with the existing logger sanitizer or a shared sanitizer.
- Do not store raw secrets, full model transcripts, or unbounded command output.

Size caps:

- Single evidence string: 2 KB.
- Single oracle result JSON: 16 KB.
- Single proof manifest: 64 KB.
- Larger outputs must be summarized and hashed.

## CDSC Proof Rules

CDSC proof requires both:

1. **Baseline fail**: the replay proves the vulnerable version violates the contract.
2. **Fixed pass**: the same replay proves the patched version satisfies the observable contract.

If either side cannot run, the result is blocking `unknown`.

For v0, the contract is intentionally narrow:

```text
Unauthenticated request to a sensitive Express route must return 401 or 403.
```

Do not claim “handler was not reached” unless the controlled demo app includes a deterministic handler-reach sentinel. Otherwise the claim is only:

```text
Unauthenticated request received an acceptable denied HTTP response.
```

## Runtime Replay Rules

Do not generate replay JavaScript and execute it as arbitrary local code.

Use JSON replay specs executed by a built-in runner:

```json
{
  "version": "0.1",
  "id": "express-admin-route-requires-auth",
  "type": "http",
  "request": {
    "method": "GET",
    "path": "/admin/users",
    "headers": {}
  },
  "expect": {
    "status": [401, 403]
  }
}
```

Runtime manifest:

```json
{
  "version": "0.1",
  "command": "${NODE}",
  "args": ["demo-oracle-server.js"],
  "health_url": "http://127.0.0.1:${PORT}/healthz",
  "base_url": "http://127.0.0.1:${PORT}",
  "ready_timeout_ms": 10000,
  "env_allowlist": ["NODE_ENV", "PORT"]
}
```

Replay exit semantics:

- `0`: pass.
- `1`: fail, counterexample reproduced.
- `2`: unknown, infrastructure/config/runtime issue.

Timeout, signal, `ECONNREFUSED`, malformed replay JSON, hash mismatch, missing runtime manifest, and missing health check are blocking `unknown`.

---

## PR A: Oracle Core, No Rebrand Yet

**Goal:** Add oracle vocabulary and executable CLI skeleton without claiming the product pivot publicly.

**Create:**

- `yieldOS/plugins/yieldos/scripts/oracles/result.js`
- `yieldOS/plugins/yieldos/scripts/oracles/runner.js`
- `yieldOS/plugins/yieldos/scripts/oracles/registry.js`
- `yieldOS/plugins/yieldos/scripts/oracle-command.js`
- `yieldOS/plugins/yieldos/bin/yieldos-oracle`
- `yieldOS/plugins/yieldos/commands/oracle.md`
- `yieldOS/plugins/yieldos/tests/oracle.test.js`
- `yieldOS/docs/19-oracle-driven-harness.md`

**Modify:**

- `scripts/plugin-check.mjs`
- `.github/workflows/plugin.yml`
- `yieldOS/plugins/yieldos/.claude-plugin/plugin.json`

### Task A1: Result Schema

- [ ] Write failing tests in `yieldOS/plugins/yieldos/tests/oracle.test.js` for `pass`, `fail`, `unknown`, full result hash tamper detection, `scope`, `limits`, `metrics`, and blocking unknown.

- [ ] Implement `yieldOS/plugins/yieldos/scripts/oracles/result.js` with:

```js
function pass(input) {}
function fail(input) {}
function unknown(input) {}
function makeResult(status, input) {}
function canonicalJson(value) {}
function hashObject(value) {}
function capEvidence(evidence, maxBytes) {}
```

- [ ] Ensure `hashes.result` covers status, blocking, subject, scope, limits, evidence, metrics excluding volatile duration.

- [ ] Run:

```bash
(cd yieldOS/plugins/yieldos && node --test tests/oracle.test.js)
```

Expected: pass.

### Task A2: Runner With Timeouts

- [ ] Add tests for serial execution, timeout, exception-to-blocking-unknown, evidence byte caps, and blocking summary.

- [ ] Implement `yieldOS/plugins/yieldos/scripts/oracles/runner.js`:

```js
async function runOne(oracle, options = {}) {}
async function runMany(oracles, options = {}) {}
```

Rules:

- Default timeout: 30 seconds.
- Timeout result: blocking `unknown`.
- Runner records `duration_ms`, `timeout_ms`, `timed_out`, `evidence_bytes`.
- Runner does not run oracles in parallel by default.

### Task A3: List-Only CLI And Command

- [ ] Implement `yieldOS/plugins/yieldos/scripts/oracles/registry.js` with metadata only:

```js
[
  { id: 'code-audit-state', kind: 'evidence', maturity: 'active-adapter' },
  { id: 'agent-pack-lock', kind: 'policy', maturity: 'active-adapter' },
  { id: 'instruction-policy', kind: 'policy', maturity: 'active-adapter' },
  { id: 'dependency-policy', kind: 'policy', maturity: 'internal-adapter' },
  { id: 'project-tests', kind: 'test', maturity: 'active-adapter' },
  { id: 'cdsc-replay', kind: 'counterexample', maturity: 'active-demo' },
  { id: 'cdsc-proof', kind: 'counterexample', maturity: 'active-demo' }
]
```

- [ ] Implement `yieldos-oracle list`.

- [ ] Add `yieldOS/plugins/yieldos/commands/oracle.md` as a list-only discovery command:

```markdown
---
allowed-tools: Bash(yieldos-oracle list:*)
description: List yieldOS security oracles
---

# Oracle

```bash
yieldos-oracle $ARGUMENTS
```
```

- [ ] Add `yieldOS/plugins/yieldos/bin/yieldos-oracle` and make executable.

- [ ] Update `scripts/plugin-check.mjs`.

- [ ] Update `.github/workflows/plugin.yml` so `sh -n` covers `yieldos-oracle`.

- [ ] Add command registration tests to `oracle.test.js`.

- [ ] Run:

```bash
(cd yieldOS/plugins/yieldos && node --test tests/oracle.test.js)
node scripts/plugin-check.mjs
sh -n yieldOS/plugins/yieldos/bin/yieldos-oracle
```

### Task A4: Internal Doctrine Docs Only

- [ ] Create `yieldOS/docs/19-oracle-driven-harness.md`.

- [ ] Do **not** rewrite landing hero yet.

- [ ] Do **not** rewrite top-level README headline yet.

- [ ] Add docs index link using local filename:

```markdown
| [19-oracle-driven-harness.md](19-oracle-driven-harness.md) | Oracle-driven acceptance model and pass/fail/unknown semantics. |
```

### PR A Verification

```bash
(cd yieldOS/plugins/yieldos && node --test tests/oracle.test.js)
node scripts/plugin-check.mjs
git diff --check
```

Commit:

```bash
git add .
git commit -m "feat: add oracle result contract"
```

---

## PR B: Existing Checks As Oracle Adapters

**Goal:** Wrap existing checks as oracle adapters without changing hook behavior.

**Create:**

- `yieldOS/plugins/yieldos/scripts/oracles/adapters/code-audit-state.js`
- `yieldOS/plugins/yieldos/scripts/oracles/adapters/agent-pack-lock.js`
- `yieldOS/plugins/yieldos/scripts/oracles/adapters/instruction-policy.js`
- `yieldOS/plugins/yieldos/scripts/oracles/adapters/dependency-policy.js`
- `yieldOS/plugins/yieldos/scripts/oracles/adapters/project-tests.js`

**Modify:**

- `yieldOS/plugins/yieldos/scripts/oracle-command.js`
- `yieldOS/plugins/yieldos/scripts/oracles/registry.js`
- `yieldOS/plugins/yieldos/scripts/agent-pack-command.js`
- `yieldOS/plugins/yieldos/scripts/code-audit/state.js`
- `yieldOS/plugins/yieldos/tests/oracle.test.js`

### Required Semantics

Code-audit state:

- `verified` => `pass`.
- `blocking-findings` => `fail`.
- `state-missing`, `diff-unavailable`, `diff-hash-mismatch` => blocking `unknown`.
- Push/PR pass requires exact committed state when checking acceptance.

Agent-pack lock:

- Active files verified against lock => `pass`.
- Lock stale, metadata mismatch, hash mismatch, blocked MCP/skill => `fail`.
- Manifest-only verification with no generated files active => `unknown`, not pass.

Instruction policy:

- Use `regex`, not `pattern`, because `injection-scanner.scan()` reads `p.regex`.
- Findings => `fail`.
- Clean scan => `pass`.
- Missing policy patterns for sensitive instruction files => blocking `unknown`.

Dependency policy:

- Map from canonical `decision.action`, not verdict text.
- `action === 'block'` => `fail`.
- `action === 'allow'` or rewrite success => `pass`.
- Policy unavailable/incomplete => blocking `unknown`.

Project tests:

- Reuse `code-audit/verify.runDetectedChecks`.
- Do not run on every tool call.
- Only run in commit/push/manual oracle contexts.
- No tests detected => advisory `unknown` for non-sensitive manual calls; blocking `unknown` for CDSC/auth acceptance unless explicitly downgraded.

### Task B1: Expose Verification Metadata From Agent Pack

- [ ] Modify `runPack(... verify ...)` so callers can inspect whether active generated files were actually checked.

Required shape:

```js
return {
  exitCode: 0,
  message,
  files,
  pack,
  verification: {
    checked: true,
    generatedFileCount: 21
  }
}
```

- [ ] Add regression test: manifest-only `verify` returns exit 0 for CLI compatibility but oracle adapter maps it to `unknown`.

### Task B2: Implement Adapters With Exact Mapping

- [ ] Add tests for each mapping above.

- [ ] Implement adapters.

- [ ] Extend CLI:

```bash
yieldos-oracle run code-audit-state --mode commit
yieldos-oracle run agent-pack-lock --pack yield.agent-pack.yaml
yieldos-oracle run instruction-policy --file AGENTS.md
yieldos-oracle run project-tests --context commit
```

- [ ] For `dependency-policy`, expose adapter functions for hook logging first; do not add public CLI until the input format is stable.

### Task B3: Do Not Change Hook Behavior

- [ ] Any hook output changes must be additive and hidden in logs/evidence.

- [ ] Existing tests for `pre-install-gate`, `decide`, `credentials`, `e2e`, and `agent-pack` must pass unchanged.

### PR B Verification

```bash
(cd yieldOS/plugins/yieldos && node --test tests/oracle.test.js tests/agent-pack.test.js tests/code-audit.test.js tests/decide.test.js tests/e2e.test.js)
node scripts/plugin-check.mjs
git diff --check
```

Commit:

```bash
git add .
git commit -m "feat: expose existing checks as oracles"
```

---

## PR C: Evidence Artifact Policy

**Goal:** Make oracle artifacts safe, bounded, redacted, hashable, and compatible with commit-bound audit state.

**Create:**

- `yieldOS/plugins/yieldos/scripts/oracles/artifacts.js`
- `yieldOS/plugins/yieldos/scripts/oracles/redact.js`
- `yieldOS/plugins/yieldos/tests/oracle-artifacts.test.js`
- `yieldOS/docs/20-oracle-evidence-artifacts.md`

**Modify:**

- `yieldOS/plugins/yieldos/scripts/code-audit/git.js`
- `yieldOS/plugins/yieldos/scripts/code-audit/state.js`
- `yieldOS/plugins/yieldos/scripts/code-audit/ci-verify.js`
- `yieldOS/plugins/yieldos/tests/code-audit.test.js`

### Artifact Decision

`security/oracles/**` is generated evidence. It is excluded from source diff hashes, like `security/code-audit-state.json`, but referenced by hash from audit state.

This prevents self-pollution:

- The source diff hash represents app/source changes.
- Oracle artifacts are committed or uploaded as evidence.
- CI verifies artifact hashes separately.

### Task C1: Exclude Generated Oracle Artifacts From Source Hash

- [ ] Extend generated evidence paths in `code-audit/git.js`:

```js
const AUDIT_PATHS = [
  'security/code-audit-events.md',
  'security/code-audit-state.json',
];

const AUDIT_PATH_PREFIXES = [
  'security/oracles/',
];
```

- [ ] Add tests:

```js
collectStagedDiff ignores security/oracles artifacts for source hash and files
collectPushDiff ignores committed security/oracles artifacts for source hash and files
```

### Task C2: Artifact Writer

- [ ] Implement `artifacts.writeArtifactSet(projectRoot, artifactSet)`.

Rules:

- All writes must stay under `security/oracles/<id>/`.
- Reject path traversal and symlink traversal.
- Redact output.
- Enforce size caps.
- Write:
  - `manifest.json`
  - `contract.json`
  - `replay.json`
  - `baseline-result.json` when present
  - `fixed-result.json` when present

- [ ] Add tests for traversal, symlink, redaction, size cap, stable hashes.

### Task C3: CI Verification

- [ ] Add artifact hash references to `buildAuditState`.

- [ ] Extend `ci-verify.js` so PR verification fails when referenced oracle artifacts are missing or hash-mismatched.

### PR C Verification

```bash
(cd yieldOS/plugins/yieldos && node --test tests/oracle-artifacts.test.js tests/code-audit.test.js)
node scripts/plugin-check.mjs
git diff --check
```

Commit:

```bash
git add .
git commit -m "feat: define oracle evidence artifacts"
```

---

## PR D: CDSC Missing-Auth Demo

**Goal:** Produce the first real category proof: contract + counterexample + baseline fail + fixed pass for one controlled route class.

**Create:**

- `yieldOS/plugins/yieldos/scripts/oracles/cdsc/missing-auth-contract.js`
- `yieldOS/plugins/yieldos/scripts/oracles/cdsc/replay-runner.js`
- `yieldOS/plugins/yieldos/scripts/oracles/cdsc/proof.js`
- `yieldOS/plugins/yieldos/tests/cdsc.test.js`
- `yieldOS/fixtures/oracle-demo/` with a small runnable Express-style or Node HTTP demo app.
- `yieldOS/docs/21-counterexample-driven-security-contracts.md`

**Modify:**

- `yieldOS/plugins/yieldos/scripts/code-audit/index.js`
- `yieldOS/plugins/yieldos/scripts/code-audit/state.js`
- `yieldOS/plugins/yieldos/scripts/oracles/registry.js`
- `yieldOS/plugins/yieldos/scripts/oracle-command.js`

### Task D1: Deterministically Ground Missing-Auth Findings

- [ ] Generate contracts only from deterministic `missing-authz` findings or agent findings that were grounded.

Grounding requires:

- current file content hash.
- exact file path.
- exact line text or line span.
- source diff hash.
- route parsed from current file content, not only finding JSON.
- finding source: `deterministic` or `agent-grounded`.

- [ ] If grounding fails, return blocking `unknown`; do not write proof.

### Task D2: Contract And Replay JSON

- [ ] Contract:

```json
{
  "version": "0.1",
  "id": "express-admin-route-requires-auth",
  "source": {
    "rule_id": "missing-authz",
    "file": "server.js",
    "file_hash": "sha256:...",
    "diff_hash": "sha256:..."
  },
  "subject": {
    "type": "http-route",
    "method": "GET",
    "path": "/admin/users"
  },
  "observable_must": "Unauthenticated request must receive 401 or 403.",
  "expect": {
    "status": [401, 403]
  }
}
```

- [ ] Replay:

```json
{
  "version": "0.1",
  "type": "http",
  "request": {
    "method": "GET",
    "path": "/admin/users",
    "headers": {}
  },
  "expect": {
    "status": [401, 403]
  }
}
```

### Task D3: Replay Runner

- [ ] Built-in runner reads replay JSON.

- [ ] It never executes generated JS.

- [ ] It uses runtime manifest with start command, health URL, base URL, timeout, fixture env allowlist, and cleanup.

- [ ] Result mapping:
  - expected denied status => pass.
  - got 200/2xx/3xx unexpectedly => fail.
  - network/startup/config/runtime error => blocking unknown.

### Task D4: Baseline Fail + Fixed Pass Proof

- [ ] Add command:

```bash
yieldos-oracle run cdsc-proof --contract security/oracles/<id>/contract.json --runtime yieldos.oracle-runtime.json --allow-runtime
```

- [ ] The proof runner must execute:
  - baseline vulnerable replay.
  - fixed replay.

- [ ] Proof manifest:

```json
{
  "version": "0.1",
  "contract_hash": "sha256:...",
  "replay_hash": "sha256:...",
  "baseline": {
    "status": "fail",
    "observed": { "status": 200 }
  },
  "fixed": {
    "status": "pass",
    "observed": { "status": 401 }
  },
  "proof_status": "pass"
}
```

- [ ] If baseline does not fail, proof is blocking `unknown`.

- [ ] If fixed does not pass, proof is `fail`.

### Task D5: Narrow Code-Audit Integration

- [ ] Do not thread CDSC through every `result()` return path.

- [ ] Add `attachCdscArtifacts(projectRoot, audit)` after an audit object is built.

- [ ] Only attach for:
  - commit mode.
  - blocking `missing-authz`.
  - deterministic or grounded finding.
  - replay class supported.

- [ ] Existing commit/push behavior must remain intact.

### PR D Verification

```bash
(cd yieldOS/plugins/yieldos && node --test tests/cdsc.test.js tests/code-audit.test.js tests/oracle.test.js)
node scripts/plugin-check.mjs
git diff --check
```

Commit:

```bash
git add .
git commit -m "feat: add counterexample security contracts"
```

---

## PR E: Demo Surface And Single Command

**Goal:** Make the “wow” visible for non-technical users and judges.

**Create:**

- `yieldOS/plugins/yieldos/scripts/oracles/demo-command.js`
- `yieldOS/plugins/yieldos/bin/yieldos-oracle-demo`
- `yieldOS/plugins/yieldos/commands/oracle-demo.md`
- `yieldOS/docs/22-oracle-demo-script.md`
- `landing/src/app/oracle-demo/page.tsx`
- `landing/src/components/oracle-demo-flow.tsx`

**Modify:**

- `scripts/plugin-check.mjs`
- `.github/workflows/plugin.yml`
- `landing/tests/landing-content.test.mjs`

### Required Demo Beats

The demo must show:

1. User asks the agent for an admin users feature.
2. Agent creates unauthenticated admin route.
3. `git commit` triggers yieldOS.
4. `missing-authz` oracle fails.
5. Contract is created.
6. Replay shows unauthenticated `GET /admin/users` got `200`.
7. Agent adds auth middleware.
8. Same replay now gets `401` or `403`.
9. Proof manifest shows baseline fail + fixed pass.
10. Final state says: accepted for this route and this replay only.

### Task E1: Single Demo Command

- [ ] Implement:

```bash
yieldos-oracle-demo missing-auth --open
```

Minimum behavior:

- Creates or uses fixture app.
- Runs vulnerable baseline.
- Runs fixed version.
- Prints oracle cards to terminal.
- Writes demo artifacts under temp dir or `security/oracles/`.
- Opens local landing route only if `--open` is passed.

No production app mutation.

### Task E2: Visual Route

- [ ] Add `/oracle-demo` route with non-marketing, proof-oriented cards:
  - `FAIL missing-authz`
  - `CONTRACT created`
  - `REPLAY baseline got 200`
  - `FIX applied`
  - `REPLAY fixed got 401`
  - `PASS scoped acceptance`

- [ ] Add small disclaimer on screen:

```text
This proves this route and replay, not the whole repo.
```

### Task E3: Tests

- [ ] Update `landing/tests/landing-content.test.mjs`.

- [ ] Add assertions for `/oracle-demo` copy.

### PR E Verification

```bash
(cd yieldOS/plugins/yieldos && node --test tests/cdsc.test.js tests/oracle.test.js)
node scripts/plugin-check.mjs
(cd landing && npm test && npm run lint && npm run build)
git diff --check
```

Commit:

```bash
git add .
git commit -m "feat: add oracle proof demo"
```

---

## PR F: Metrics And Benchmarks

**Goal:** Prove the cost/performance claim carefully.

**Create:**

- `yieldOS/plugins/yieldos/scripts/oracles/bench.js`
- `yieldOS/plugins/yieldos/tests/oracle-bench.test.js`
- `yieldOS/docs/23-oracle-evals.md`

### Metrics

Collect:

- `% decisions resolved without model`
- `agent_runs_per_audit`
- `agent_tokens_per_audit` when available
- `CI model calls` must equal `0`
- p50/p95 oracle runtime
- p50/p95 hook latency
- duplicate test invocations per commit
- replay startup time
- replay pass/fail/unknown rate
- flake rate across 10 repeated demo runs
- artifact size distribution
- CI wall-time delta versus baseline branch

### Reports

Generate:

```text
security/oracle-metrics.json
security/oracle-cost-baseline.json
security/oracle-flake-report.json
security/oracle-artifact-size-report.json
```

These reports are local/generated. Do not make them required committed files unless CI explicitly needs them.

### CI Budget

Targets:

- No more than +10% plugin test wall time.
- No network in matrix tests.
- CDSC replay integration only in one Ubuntu job.
- No model calls in CI verification.

### PR F Verification

```bash
(cd yieldOS/plugins/yieldos && node --test tests/oracle-bench.test.js tests/oracle.test.js)
node scripts/plugin-check.mjs
git diff --check
```

Commit:

```bash
git add .
git commit -m "feat: measure oracle cost and flake"
```

---

## PR G: Product Reframe And Agent Pack Packaging

**Goal:** Update public narrative after real oracle and CDSC proof exists.

**Create:**

- `yieldOS/docs/24-hackathon-pitch.md`

**Modify:**

- `README.md`
- `yieldOS/README.md`
- `yieldOS/docs/10-code-audit.md`
- `yieldOS/docs/17-team-agent-packs.md`
- `yieldOS/docs/18-agent-packs-pr-brief-es.md`
- `landing/src/app/page.tsx`
- `landing/src/app/agent-packs/page.tsx`
- `landing/src/components/agent-pack-section.tsx`
- `landing/src/components/agent-pack-builder.tsx`
- `landing/tests/landing-content.test.mjs`
- `yieldOS/plugins/yieldos/scripts/agent-pack-command.js`
- `yieldOS/plugins/yieldos/tests/agent-pack.test.js`
- `policy/SCHEMA.md`

### Reframe Rules

Headline:

```text
Oracle-driven security harness for AI coding agents.
```

Precise support copy:

```text
yieldOS wraps protected Claude Code repos and CI-verified workflows with executable oracles: policy checks, pack locks, code-audit state, project tests, and counterexample replays. The model can propose. The oracle decides.
```

Agent packs:

```text
Agent packs distribute approved oracles, skills, MCP policy, and guidance. They do not enforce by themselves.
```

CDSC:

```text
V0 proves one high-impact class: public admin routes in runnable demo apps. More contracts can be added.
```

### Hackathon Pitch Doc

Create `yieldOS/docs/24-hackathon-pitch.md` with:

- 60-second pitch.
- problem.
- why now.
- demo beats.
- what works today.
- what is prototype.
- why not just “more agents.”
- why not just a scanner.
- sponsor relevance.
- hard judge objections and answers.

### Agent Pack Oracle Packaging

Only after PR B/F evidence exists:

- [ ] Add optional `oracles.include` to pack manifest.

- [ ] Do not call them “oracle packs.”

- [ ] Validate only known reviewed oracle IDs.

- [ ] Lock records oracle IDs and oracle registry version, not proof that they ran.

- [ ] Generated files must say:

```text
This pack declares approved oracles. Run yieldos-oracle or CI to execute them.
```

### PR G Verification

```bash
(cd yieldOS/plugins/yieldos && node --test tests/agent-pack.test.js tests/oracle.test.js)
node scripts/plugin-check.mjs
(cd landing && npm test && npm run lint && npm run build)
git diff --check
```

Commit:

```bash
git add .
git commit -m "feat: reframe yieldOS around security oracles"
```

---

## What No Longer Belongs In The Current Main Story

Keep the code, demote the pitch:

- Category A rewrites: useful supply-chain wedge, not the category.
- Deepsec wrapper: useful external tool, not core differentiator.
- Pentest dashboard: useful advanced workflow, not the primary demo.
- Agent pack builder: distribution layer, not the “wow.”
- Token savings: expected mechanism, not proven claim until PR F.
- Cross-agent enforcement: future direction, not current claim.

What still belongs:

- Pre-action gates.
- Deterministic policy.
- Credential protection.
- Code-audit state.
- CI verification.
- Pack-lock verification.
- Counterexample replay and proof manifest.

## Final Acceptance Criteria For The Pivot

The pivot is real only when all are true:

- [ ] There is a stable oracle result schema.
- [ ] Existing checks emit scoped oracle evidence.
- [ ] Model-assisted findings cannot become pass without deterministic grounding.
- [ ] `unknown` blocks sensitive actions.
- [ ] `security/oracles/**` has safe artifact rules and CI verification.
- [ ] CDSC demo proves baseline fail + fixed pass.
- [ ] A non-technical viewer can understand the demo without reading code.
- [ ] Landing and pitch explain what is enforced today versus what is roadmap.
- [ ] Metrics show CI verification requires zero model calls.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-09-oracle-driven-security-harness.md`.

Recommended execution:

1. **Subagent-Driven** for PR A/B/C because tasks are separable and reviewable.
2. **Inline or pair-review** for PR D/E because CDSC/demo semantics are product-critical.
3. Do not start PR G public reframe until PR D proof works locally.
