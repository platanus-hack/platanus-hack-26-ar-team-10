# Agentic Code Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional native Claude Code / Codex CLI red-team and blue-team agents on top of the deterministic code-audit loop, without API keys or CI agent execution.

**Architecture:** The deterministic scan remains the controller and final verifier. Agent providers run only when explicitly enabled, use local user-authenticated CLIs, return structured JSON, and never directly mutate files; yieldOS applies validated patches and re-runs deterministic verification.

**Tech Stack:** Node.js built-ins, existing `node:test`, local `claude` CLI, local `codex` CLI, git diff/apply.

---

### Task 1: Agent Options And Provider Boundary

**Files:**
- Create: `yieldOS/plugins/yieldos/scripts/code-audit/agents/index.js`
- Test: `yieldOS/plugins/yieldos/tests/code-audit-agents.test.js`

- [ ] **Step 1: Write failing tests**

Add tests for:
- default mode is deterministic
- `YIELDOS_AGENT_CHILD=1` disables agent execution
- explicit `agent-review` and `agent-fix` modes enable providers
- provider command runners receive `YIELDOS_AGENT_CHILD=1`

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/code-audit-agents.test.js`
Expected: fail because the agent module does not exist.

- [ ] **Step 3: Implement options and provider boundary**

Create `agents/index.js` with:
- `agentOptionsFromEnv(env)`
- `isAgentReviewEnabled(options)`
- `isAgentFixEnabled(options)`
- `runAgentRedTeam(projectRoot, input, options)`
- `runAgentBlueTeam(projectRoot, input, findings, options)`

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/code-audit-agents.test.js`
Expected: pass.

### Task 2: Structured Agent JSON And Patch Application

**Files:**
- Create: `yieldOS/plugins/yieldos/scripts/code-audit/agents/json.js`
- Create: `yieldOS/plugins/yieldos/scripts/code-audit/agents/patch.js`
- Test: `yieldOS/plugins/yieldos/tests/code-audit-agents.test.js`

- [ ] **Step 1: Write failing tests**

Add tests for:
- parsing direct JSON objects
- parsing CLI JSON wrappers with `result` strings
- discarding findings without exploit evidence
- rejecting patches that touch files outside the audited diff
- applying a valid unified diff patch and staging the touched file

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/code-audit-agents.test.js`
Expected: fail because JSON and patch helpers do not exist.

- [ ] **Step 3: Implement helpers**

Implement:
- `parseJsonPayload(stdout)`
- `normalizeAgentFindings(payload)`
- `extractPatch(payload)`
- `parsePatchFiles(patch)`
- `applyAgentPatch(projectRoot, patch, allowedFiles)`

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/code-audit-agents.test.js`
Expected: pass.

### Task 3: Integrate Agentic Red/Blue Loop

**Files:**
- Modify: `yieldOS/plugins/yieldos/scripts/code-audit/index.js`
- Modify: `yieldOS/plugins/yieldos/scripts/code-audit/state.js`
- Test: `yieldOS/plugins/yieldos/tests/code-audit-agents.test.js`
- Test: `yieldOS/plugins/yieldos/tests/code-audit.test.js`

- [ ] **Step 1: Write failing tests**

Add tests for:
- `agent-review` blocks on an agent-only high finding
- `agent-fix` applies an agent patch and then deterministic verification passes
- agent mode does not run during `YIELDOS_AGENT_CHILD=1`
- audit state records agent mode/provider metadata

- [ ] **Step 2: Run tests to verify failure**

Run: `node --test tests/code-audit-agents.test.js tests/code-audit.test.js`
Expected: fail because the main loop ignores agent providers.

- [ ] **Step 3: Integrate loop**

Update `auditCommit` so each iteration:
1. collects deterministic findings
2. merges agent red-team findings when enabled
3. tries deterministic blue-team fix first
4. tries agent blue-team patch when enabled
5. re-collects staged diff and repeats up to 3 times

Update result metadata and audit state with:
- `agent_mode`
- `agent_provider`
- `agent_runs`
- `agent_findings`
- `agent_patch_applied`

- [ ] **Step 4: Run tests to verify pass**

Run: `node --test tests/code-audit-agents.test.js tests/code-audit.test.js`
Expected: pass.

### Task 4: Hook And Docs

**Files:**
- Modify: `yieldOS/plugins/yieldos/scripts/pre-install-gate.js`
- Modify: `yieldOS/docs/10-code-audit.md`
- Modify: `yieldOS/README.md`

- [ ] **Step 1: Write failing hook/doc test**

Extend existing tests to verify hook-driven code audit can receive agent options from env and still emits the same machine-readable verdict.

- [ ] **Step 2: Implement env wiring**

Update the hook to pass:
- `YIELDOS_CODE_AUDIT_MODE`
- `YIELDOS_CODE_AUDIT_AGENT`
- `YIELDOS_CODE_AUDIT_AGENT_TIMEOUT_MS`

Document:
- deterministic default
- `agent-review`
- `agent-fix`
- no API keys
- local Claude/Codex login requirement
- CI remains deterministic.

- [ ] **Step 3: Run focused tests**

Run: `node --test tests/code-audit-agents.test.js tests/code-audit.test.js tests/e2e.test.js`
Expected: pass.

### Task 5: Full Verification And Review

**Files:**
- All changed files

- [ ] **Step 1: Run full plugin tests**

Run: `(cd yieldOS/plugins/yieldos && node --test tests/*.test.js)`
Expected: all pass.

- [ ] **Step 2: Run release/tooling tests**

Run: `node scripts/plugin-check.mjs`
Expected: `plugin structure OK`.

Run: `node --test scripts/release.test.mjs`
Expected: all pass.

- [ ] **Step 3: Run diff check**

Run: `git diff --check`
Expected: no output.

- [ ] **Step 4: Review**

Review provider isolation, patch validation, recursion guard, state metadata, and docs. Fix any issue before committing.
