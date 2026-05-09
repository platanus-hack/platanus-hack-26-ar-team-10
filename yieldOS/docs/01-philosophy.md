# Philosophy & first principles

## The actual problem

> The project executes code that nobody on the project read, wrote, or audited.

Every `npm install`, `pip install`, skill activation, or MCP add is a trust decision. AI coding agents make these decisions on behalf of users who never see them. The history of supply-chain incidents is the cost of getting that decision wrong.

| Real incident | What happened |
|---|---|
| `event-stream` (Nov 2018) | New maintainer added a payload that drained Bitcoin wallets. In production for months. |
| `colors.js` (Jan 2022) | Original author published an infinite-loop garbage payload as protest. Broke thousands of CI pipelines. |
| `ua-parser-js` (Oct 2021) | Maintainer account compromised; cryptominer + credential stealer pushed across three semver lines. |
| `node-ipc` (Mar 2022) | Maintainer added geo-targeted file deletion (RU/BY) as protestware. |
| `crossenv` (typosquatting) | Exfiltrated env vars that included production secrets. |
| `log4shell` (Dec 2021) | Legitimate feature was an RCE; everyone shipping log4j was vulnerable instantly. |

These are not edge cases. They are the median outcome of treating dependency installation as a routine action.

## Why the user is not in the loop

A common reaction to supply-chain risk is "show the user every install and let them approve". That fails for three reasons:

1. **Non-technical users cannot evaluate the risk.** Asking "do you trust `flatmap-stream@0.1.1`?" produces the same answer every time: yes, because the agent asked for it.
2. **Approval fatigue makes every prompt a rubber stamp.** After 20 prompts, the 21st gets approved without reading.
3. **The user's mental model is the feature, not the dependency.** They asked for "a chart", not for `recharts@2.12.7` and its 47 transitives.

So the user is **deliberately not** in the loop. Every decision yieldOS makes is automatic, derived from a centrally curated policy plus deterministic analysis. The user sees outcomes, never questions.

## What yieldOS is — in one sentence

> A pre-install gate that turns "is this safe to install?" into a deterministic decision driven by a centrally curated policy, with no human in the loop and an audit trail of every decision.

## What yieldOS is **not**

| Not | Reason |
|---|---|
| A replacement for `npm audit` / Dependabot / Snyk | They cover known CVEs in installed code; yieldOS gates *before* install. They are complementary. |
| An auto-customization assistant | Earlier iterations framed the rewrite as "customize the dep to your project". That was the wrong framing — the rewrite is a security tool, not a productivity tool. |
| A locally-managed allowlist | All policy lives in the official repo. Local edits don't exist by design. |
| A daemon | It is a set of hooks the Claude Code harness invokes. There is no background process. |

## Dependency-Gate Contract

The dependency gate enforces three narrow contracts while yieldOS is enabled and its policy is reachable:

1. **Allowlisted-or-curated installs should not be silently denied.** If something is on the allowlist or it passes verification cleanly, the gate allows it.
2. **No denylisted install will succeed.** Hard block, exit code 2, logged.
3. **No critical-category install (crypto, auth, ORM, framework, build tool…) will succeed without explicit human curation.** The path is a PR to the policy repo.

Everything else (Category A rewrites, transitive audits, native suggestions, manifest edits) is a refinement on top of these dependency-specific contracts. Broader repo safety is handled by scoped oracles, audit state, and evidence, not by a global safety guarantee.

## Five principles

1. **Defense in depth.** Allowlist, denylist, native-first, category-D block, manifest analysis, transitive audit — five overlapping checks. A bypass of one is caught by another.
2. **Centrally curated policy.** Local policy is a footgun. Trust the official repo or someone you trust. Never both.
3. **Determinism over cleverness.** Every decision is reproducible from `(candidate, policy)`. No LLM in the gate path.
4. **Observability for the user.** The user can read `security/dependency-events.md` at any time and understand what yieldOS decided.
5. **Self-defense.** yieldOS is the guardian. The guardian must be immune to manipulation by the things it guards.
