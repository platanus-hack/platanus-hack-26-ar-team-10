# yieldOS Playbooks

Status: draft registry

This directory is the future source for reviewed agent playbooks. No runtime code reads it yet. It exists so yieldOS can evolve from "block risky actions" into "guide agents through safe, repeatable security work" without stuffing every instruction into always-on context.

## Contract

A playbook is a versioned procedure with:

- a narrow activation rule
- a permission contract
- required inputs
- ordered steps
- an output contract
- validation requirements
- source and last-verified metadata

If a playbook needs long background material, templates, or scripts, keep them in supporting files and load them only when the playbook is active.

## Registry

| ID | Status | Activation | Permission posture | Output |
| --- | --- | --- | --- | --- |
| `security-audit` | proposed | manual or commit/push audit | read/search/diff by default; writes only in fix phase | phased security report |
| `threat-model` | proposed | repo setup or audit start | read-only | assets, trust boundaries, attacker inputs, invariants |
| `finding-discovery` | proposed | after target diff exists | read-only | candidate source/control/sink/impact tuples |
| `validation` | proposed | after candidates exist | bounded test/build/PoC commands | validation rubric, evidence, proof gaps |
| `fix-finding` | proposed | validated or plausible finding | scoped writes to affected code/tests | patch, regression proof, remaining risk |
| `skill-review` | proposed | skill/plugin policy PR | read-only plus hash calculation | allow/deny/defer recommendation |
| `mcp-review` | proposed | MCP policy PR | read-only plus tool inventory | approved/denied tool surface |
| `instruction-file-review` | proposed | instruction/rule file edit | read-only plus injection scan | safe/unsafe instruction diff |
| [`agent-pack-review`](agent-pack-review.md) | draft | `yield.agent-pack.yaml` edit or export | read-only plus policy/schema validation | safe/unsafe pack diff and adapter warning list |

## Frontmatter Shape

Future playbooks should start with metadata like this:

```yaml
---
id: security-audit
name: Security Audit
version: 0.1.0
status: draft
activation: manual
scope: repo
token_budget_hint: high
permission_contract:
  allowed_tools:
    - read
    - search
    - git-diff
  denied_tools:
    - secret-read
    - production-write
    - unrestricted-network
last_verified: "2026-05-09"
sources:
  - codex-security-plugin
---
```

## Security Audit Phase Machine

The first yieldOS security playbook should preserve these phases:

1. Threat model: build or load repo-level security context.
2. Finding discovery: enumerate plausible candidates using source, broken control or sink, impact, and closest control.
3. Validation: create a small rubric, use the strongest bounded proof method, and record proof gaps.
4. Attack-path analysis: decide realistic attacker reachability and severity.
5. Fix finding: patch the narrowest invariant boundary and prove the original path no longer succeeds.

Do not collapse these phases into one prompt. The separation is what makes the output auditable and lets agents load only the current phase.

## Promotion Path

Use this path before a playbook becomes active:

1. Observe repeated agent failure or repeated successful human workflow.
2. Write a candidate playbook with a precise trigger and output contract.
3. Run it on at least three real examples.
4. Record whether it reduced repeated repo reading, reduced false findings, or improved fix validation.
5. Add adapter output only after the canonical playbook is stable.
6. Add policy references only after the security team accepts the permission contract.

## Do Not Store

Do not store:

- credentials or credential-looking values
- raw chat transcripts
- full private terminal logs
- full third-party source dumps
- unredacted dependency tarballs
- private customer code excerpts
- long model-generated narratives with no evidence tuple

Store the smallest evidence record that lets another agent reproduce the decision.
