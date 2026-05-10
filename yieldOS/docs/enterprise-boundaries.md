# Enterprise Boundaries

yieldOS is an agent-action security firewall. The current hard-enforced adapter is the Claude Code plugin runtime. Other generated agent instructions and packs are useful governance surfaces, but they are advisory unless they run through an enforced host adapter, yieldOS verification, or CI.

## Enforcement Levels

| Surface | Current level | What yieldOS can claim | What yieldOS must not claim |
| --- | --- | --- | --- |
| Claude Code plugin hooks | Enforced | Pre-action and post-action gates for configured Claude Code tools | Universal prevention outside the Claude Code plugin runtime |
| Dependency policy | Enforced for monitored install commands | Blocks denylisted, untrusted, and review-required package actions before execution | Complete registry malware detection |
| Credential reads | Enforced for monitored read/tool paths | Blocks configured credential paths unless local authorization is active | Protection from unmonitored shell commands or user-driven manual reads |
| Code audit commit/push gate | Enforced for configured git actions | Blocks covered unsafe diffs before commit or push | Whole-repo SAST or complete taint analysis |
| Oracle contracts | Scoped proof | Verifies selected behaviors through executable contracts | Proof that the entire application is secure |
| Other agent packs | Advisory unless adapter says enforced | Provides policy guidance and instructions | Hard blocking across unsupported agents |
| Provider-backed repair workflows | Optional | Can send redacted context when explicitly configured | Offline-only operation when provider mode is enabled |

## Data Flows

- Local hook decisions stay on the machine.
- Policy fetch reads public policy JSON and falls back to the shipped policy cache.
- Credential read authorization does not trust writable cache grants. The cache may hold challenge hints, but allow decisions require transcript proof that the latest user prompt exactly matched the target-bound nonce; `Bash` is blocked when recursive project credential sentinels are present because shell access cannot be path-scoped by the hook.
- Provider repair workflows use model/provider credentials only when the user configures those workflows.
- Audit events are written locally unless the user configures export.

## Claim Rules

- Say "policy-covered risky actions" instead of "all malicious actions".
- Say "scoped oracle proof" instead of "the repo is secure".
- Say "Claude Code hard enforcement" instead of "all agent hard enforcement".
- Say "assumption-based routing estimate" unless provider billing logs and usage reports are attached.
