# Trade-offs accepted

Every meaningful design decision rejects some alternative. This file lists what yieldOS gave up *on purpose* and why.

## We gave up depth of behavioral analysis

What we could have done: provenance-check every install (verify npm package matches the signed git tag), source-to-registry diff (build the tarball locally and compare), behavioral comparison (build a model of what the package should do and check the code does only that).

What we did: static patterns + script detector + OSV + obfuscation heuristics + binary detector.

Why: the heavy techniques require infrastructure (signature databases, build environments) that don't exist for v1, and the practical attacks (`event-stream`, `ua-parser-js`, `node-ipc`, `colors`) are all caught by detecting the *patterns* they introduce — postinstall scripts, exfiltration patterns, suspicious URLs. The hard cases that need provenance are rarer.

Cost of giving this up: a sophisticated attack that mimics a legitimate package's behavior bit-for-bit would slip past us. Mitigated by the allowlist (pinned versions) and the 10-day-rule on transitives.

## We gave up locally-managed allowlists

What we could have done: a `/yieldos allow <pkg>` slash command that adds to a per-project allowlist file.

What we did: only reviewed PRs to the root `policy/` files modify allowlist/denylist.

Why: local allowlists are a footgun. A user under pressure adds the malicious package to their own list. Policy as a shared trust artifact has higher integrity.

Cost of giving this up: there is friction when a user genuinely needs an unlisted package — they have to PR upstream. The friction is acceptable; the alternative is a backdoor.

## We gave up customization-as-feature

What we could have done: market yieldOS as "rewrites your dependencies tailored to your project's style". Earlier iterations of the design pitched this.

What we did: customization is a side effect of the rewrite process when it happens, never a reason to rewrite.

Why: the "customize for productivity" framing competes with the "lock down for security" framing. They sit awkwardly together. Picking security framing makes everything else cleaner: rewrite is a salvage tool, not a value prop.

Cost of giving this up: there is no story for "yieldOS makes my code prettier". That's fine.

## We gave up auto-installation of "verified-but-not-allowlisted" packages

What we considered: if a package passes all analyzers cleanly, allow the install with a `verification-passed` verdict and log a recommendation to add it to the allowlist.

What we did: that verdict exists and *does* allow the install, but with the user-visible note that promotion to allowlist is recommended.

Why: this is the soft path. If we made unlisted-but-clean installs block, every new package in the ecosystem would require a PR before any user could use it; adoption would die. If we silently allowed them with no record, the allowlist would never grow.

Cost: the bar for the analyzers has to be high, because they are the only thing between an unknown package and the project. The thresholds for tier1/tier2/tier3 are conservative on purpose.

## We gave up running OSV synchronously

What we considered: every install hits OSV in real time, blocks if any CVE.

What we did: OSV is checked, but with a 1-hour cache per `(package, version)`.

Why: OSV's free API is rate-limited. Hitting it on every install of `react` (which happens many times per day across all users) would either get us blocked or slow installs significantly.

Cost: a CVE published in the last hour might miss a freshly-checked install. Mitigated by the cache being per-version (not per-name) and the rate of new critical CVEs being lower than 1/hour for any given package.

## We narrowed manifest diff parsing

What we considered: when the agent edits `package.json` to add a new dep, parse the diff, identify the added packages, and run them through the gate.

What we do now: reconstruct dependency additions and version changes from supported manifest edits, then run those candidates through the same policy decision flow as install commands.

Why: full manifest parsing is fragile, but total pass-through left a gap where an agent could introduce an unreviewed dependency before any install command ran. The compromise is narrow: inspect supported dependency manifests only, ignore no-op edits, and still gate the actual install command later.

Cost: unsupported manifest formats can still slip past edit-time detection. Mitigated by install-command gating and by keeping planned CI lockfile enforcement separate until implemented.

## We gave up broad file-edit gating

yieldOS does not block every source-file edit. It gates dependency acquisition, instruction edits, protected evidence, credential reads, and commit/push boundaries. Source-code security review happens when the agent tries to commit or push, and through explicit `/yieldos:audit`.

## We gave up multi-language symmetry in v1

What we considered: full coverage of every package manager from day one.

What we did: full coverage of npm, pnpm, yarn, bun, pip, poetry, uv, cargo, go, plus skills, vendoring, binaries — but not gem, composer, nuget, maven, brew, apt, pacman, etc.

Why: 80/20. The named managers cover ~95% of Claude Code projects. The rest are v2 if usage demands.

Cost: a Ruby project with `gem install` is unprotected. Acceptable for v1.

## We gave up a daemon

What we considered: a long-running yieldOS process that watches for changes.

What we did: stateless hooks. Each invocation is a fresh process.

Why: daemons are operational complexity. Stateless hooks fit Claude Code's architecture and are trivially debuggable.

Cost: every hook does its own startup work (read policy, parse config). For a 5-min TTL'd cache this is fine; ms-level overhead.

## We gave up rich human approval flows

What we considered: prompts like "this package has a postinstall script. Allow it once? Allow always? Deny?"

What we did: deterministic rules. No prompts.

Why: the user is non-technical. Prompts produce rubber-stamping. Determinism makes the decision auditable and reproducible.

Cost: the user can't override yieldOS in real time. The override path is a PR to the policy repo.

## We gave up integration with `npm audit` etc.

What we considered: yieldOS could parse `npm audit` output and act on it.

What we did: yieldOS uses OSV directly and runs *before* installation; the existing tools handle *post-installation* auditing of installed code.

Why: yieldOS occupies a different moment in the lifecycle. Pre-install gate vs post-install audit are complementary, not redundant.

Cost: there's some duplication of CVE detection. That's fine — defense in depth.

## We gave up clean policy on day 1

The shipped policy in v0.1.x is a starter set. It will have gaps. Real usage will reveal:
- False positives (legitimate packages classified as Cat D incorrectly).
- False negatives (malicious packages not on denylist).
- Wrong native equivalents.
- Wrong category assignments.

Policy improves through PR review at the official repo. The plugin is built to consume policy changes within 5 minutes of merge. The expectation is that the policy repo is a living artifact maintained by humans.

## Summary of accepted limitations

| Limitation | Mitigated by |
|---|---|
| No deep behavioral analysis | Static patterns + OSV + 10-day rule |
| No local policy editing | PR flow to official repo |
| No customization marketing | Security-first framing (clearer) |
| OSV checks not real-time | 1-hour cache (acceptable freshness) |
| Manifest edits pass through | Bash install gate covers actual installation |
| 9 managers, not all | Top managers covered; rest in v2 |
| No daemon, stateless hooks | Hook overhead is ms; cache amortizes |
| No real-time approval flows | Determinism + log + PR override path |
| Policy gaps on day 1 | Hot-loaded from official repo within 5 min |
