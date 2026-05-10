# Hackathon Pitch: Security Contracts For AI Coding Agents

## 60-Second Pitch

AI coding agents are becoming junior developers with shell access, repo access, dependency access, MCP access, and commit access. That is powerful, but dangerous for teams and non-technical builders who cannot evaluate every security consequence.

yieldOS turns risky AI-generated changes into executable security contracts. A contract states what must be true, a counterexample tries to break it, and an oracle decides whether the evidence is `pass`, `fail`, or `unknown`. The model can propose. The oracle decides. Under the hood, yieldOS is an oracle-driven security harness for AI coding agents.

## Problem

Most tools either ask the model to reason harder or scan after the fact. That still leaves the user trusting an opinion. yieldOS turns risky actions into contracts with executable evidence.

## What Works Today

- Claude Code hooks gate dependencies, credentials, instructions, MCPs, skills, commits, and pushes.
- Code-audit state is commit-bound and CI-verifiable.
- Agent packs generate approved guidance files for Claude Code, Codex, Cursor, Copilot, and Windsurf.
- Security contracts normalize existing checks into scoped pass/fail/unknown results.
- The CDSC demo proves one concrete class: public admin routes must reject unauthenticated requests.
- The demo proves baseline fail plus fixed pass with a real local runtime and JSON replay.

## Prototype Boundary

CDSC v0 supports one class: unauthenticated access to a sensitive HTTP route in a runnable demo app. It does not prove the whole repository is safe. It proves this route and replay.

## Why Not Just More Agents

More agents can find more issues, but they still produce opinions unless their claims are grounded. yieldOS uses agents for proposals and analysis, then requires deterministic or executable evidence before acceptance.

## Why Not Just A Scanner

A scanner reports findings. yieldOS also mediates risky agent actions before they hit the repo, verifies audit state at commit/push, and records evidence that CI can check without model calls.

## Demo Beats

1. User asks an agent for an admin users feature.
2. Agent creates an unauthenticated `/admin/users` route.
3. yieldOS detects `missing-authz` and creates a security contract.
4. The counterexample replay against the vulnerable runtime gets `200`.
5. Agent adds auth middleware.
6. Same replay against the fixed runtime gets `401`.
7. Proof manifest records baseline fail plus fixed pass.
8. Final state says accepted for this route and replay only.

## Sponsor Relevance

This is practical agent governance: policy, hooks, CI, evidence, and packageable team rules. It helps teams adopt coding agents without pretending every user can be a security reviewer.

## Hard Objections

**Is this a full security operating system?**  
No. It is an oracle-driven acceptance layer for protected Claude Code repos and CI-verified workflows.

**Does a pass prove the repo is safe?**  
No. A pass is scoped to the subject, check, and evidence.

**Can Cursor/Copilot/Windsurf be hard-gated today?**  
Not equally. Packs can generate guidance for them; deterministic enforcement needs yieldOS hooks, CLI verification, CI, or managed host policy.

**Is token reduction proven?**  
Not yet as a broad claim. The mechanism is real: deterministic oracles avoid asking models to re-decide known checks. Metrics now record CI model calls and replay runtime so the claim can be measured.
