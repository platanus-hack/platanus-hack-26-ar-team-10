# Enterprise Boundaries

yieldOS is an agent-action security firewall. The strongest pre-tool adapter is the Claude Code plugin runtime. Codex and plain shell workflows can enforce commit/push safety through native Git hooks, while generated instructions and packs remain advisory unless they run through an enforced host adapter, yieldOS verification, or CI.

## Enforcement Levels

| Surface | Current level | What yieldOS can claim | What yieldOS must not claim |
| --- | --- | --- | --- |
| Claude Code plugin hooks | Enforced | Pre-action and post-action gates for configured Claude Code tools | Universal prevention outside the Claude Code plugin runtime |
| Native Git hooks | Enforced for repos where `yieldos-git-hooks install` was run | Blocks covered unsafe diffs before ordinary `git commit` or `git push`, including Codex shell commands | Protection from commands run with `--no-verify` or repos without the hook installed |
| Dependency policy | Enforced for monitored install commands | Blocks denylisted, untrusted, and review-required package actions before execution | Complete registry malware detection |
| Credential reads | Enforced for monitored read/tool paths | Blocks configured credential paths unless local authorization is active | Protection from unmonitored shell commands or user-driven manual reads |
| Code audit commit/push gate | Enforced for configured git actions | Blocks covered unsafe diffs before commit or push | Whole-repo SAST or complete taint analysis |
| Oracle contracts | Scoped proof | Verifies selected behaviors through executable contracts | Proof that the entire application is secure |
| Other agent packs | Advisory unless adapter says enforced | Provides policy guidance and instructions | Hard blocking across unsupported agents |
| Provider-backed model workflows | Explicit egress opt-in | Can send scoped provider prompts only when `YIELDOS_ALLOW_PROVIDER_EGRESS=1` is set and reports record the provider/model/purpose boundary | Offline-only operation, measured billing savings, or support for provider-repair scripts that do not exist in this checkout |

## Data Flows

- Local hook decisions stay on the machine.
- Policy fetch reads public policy JSON and falls back to the shipped policy cache.
- Credential read authorization does not trust writable cache grants. The cache may hold challenge hints, but allow decisions require transcript proof that the latest user prompt exactly matched the target-bound nonce. `Bash` commands that reference credential-looking paths are blocked by default. Whole-project sentinel blocking is available as strict mode with `YIELDOS_STRICT_CREDENTIAL_SENTINEL=1`.
- Provider-backed model workflows use model/provider credentials only when the user configures those workflows and sets `YIELDOS_ALLOW_PROVIDER_EGRESS=1`. Dry-runs and provider-budget skips do not clone public repo specs, call providers, or send repository context. Missing-credential failures are reported without claiming provider requests or repository content were sent. The current live model workflow benchmark sends task prompts, not checked-out source files, and reports that distinction as `provider_request_sent: true` with `repo_content_sent: false`. The current checkout does not include a `scripts/peer-repo-repair/` runtime.
- Audit events are written locally unless the user configures export.

## Claim Rules

- Say "policy-covered risky actions" instead of "all malicious actions".
- Say "scoped oracle proof" instead of "the repo is secure".
- Say "Claude Code pre-tool enforcement" or "native Git hook commit/push enforcement" instead of "all agent hard enforcement".
- Say "assumption-based routing estimate" unless provider billing logs and usage reports are attached.
