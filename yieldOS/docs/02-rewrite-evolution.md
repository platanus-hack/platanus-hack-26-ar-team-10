# The rewrite paradigm — evolution of a single decision

The most-iterated decision during yieldOS design. The "rewrite" concept went through five distinct framings before landing.

## V1 — Rewrite as replacement

> When a package is small and not in the allowlist, yieldOS rewrites it locally and uses the rewrite instead of installing.

**Source**: original `AGENTS.md` — "Rewrite/customize rule: prefer a local implementation when the needed behavior is small, stable, and can be implemented clearly inside this repo".

**Problems found:**
- CVEs in the upstream package don't propagate to the rewrite, but `npm audit` won't see the rewrite either → blind spot.
- Major version bumps upstream may break API compatibility — auto-rewriting on every update is destructive.
- A transitive dependency may bring the real package, creating a duplicate-implementation bug.
- Maintenance debt grows linearly: 15 rewrites at 6 months in is 15 things to babysit.

## V2 — Rewrite as customization

> Rewrite tailored to the project's style — adapts naming, types, integrates with project's logger, etc.

**Problems found:**
- "Customization" is cosmetic — a thin wrapper achieves 80% of the benefit at 5% of the cost.
- Selling rewrites as a productivity feature dilutes the security framing.
- The user we were optimizing for is non-technical. They don't care about style adaptation.

**Outcome:** rejected. Customization is a *side effect* of the rewrite process when it happens, never the *reason* to rewrite.

## V3 — Rewrite as verification (sonda)

> Rewrite is a probe: yieldOS internally constructs an expected implementation, compares against the candidate, blocks on divergence. Discards the rewrite after deciding.

**Problems found:**
- This is fundamentally **integrity verification**, not rewrite.
- Existing tools (npm provenance, sigstore, `npm pack` diffs) do this better and faster.
- "Construct expected implementation" is unnecessarily expensive when "verify the published tarball matches the git tag" achieves the same thing.

**Outcome:** rejected as "rewrite", accepted as "verification" in a separate pillar.

## V4 — Rewrite gone, full manifest analysis

> Drop the rewrite entirely. For unlisted packages, run manifest diff + script detection + OSV + static patterns + version comparator. Never produce local code.

**Problems found:**
- This works great for *large* libs (the original target of the verification pillar).
- For *small* utility packages with one-line implementations, manifest analysis is overkill.
- Without an "auto-resolve" path for unlisted small utilities, the user sees too many blocks for things like `clsx`, `slugify`, `nanoid`.

## V5 — Rewrite as last-resort, acotado a Category A

> Manifest analysis is the default for unlisted libs. Rewrite exists only for Category A (small, simple, non-critical, narrow usage). The rewrite generates a stub with a content-hash marker, and the agent (via the dependency-gate skill) populates it.

**Why this works:**
- Category A is a small slice of real-world installs (~5–10% of unlisted).
- The five conditions for a rewrite are restrictive enough that misuse is rare:
  1. Not allowlisted.
  2. No native equivalent.
  3. Project uses a tiny fraction of the package.
  4. Package is Category A (size + complexity threshold + no security implication).
  5. Rewriting locally costs less than maintaining a curated dependency.
- The rewrite produces a header marker that survives revalidation cycles.
- Updates to upstream are tracked via marker but never auto-applied if the user modified the file.

**Outcome:** accepted as the final form.

## The 5-condition gate for V5 rewrite

A rewrite happens **only** when all five conditions hold:

```
not in allowlist
AND no native equivalent
AND not in denylist
AND not Category D (crypto/auth/framework/orm/db-driver/parser/etc.)
AND (in Category A explicit OR meets size+complexity thresholds)
```

If any condition fails, the candidate goes to the appropriate path: native suggest, allow, block, or large-lib analysis.

## What was kept from each iteration

| From V1 | The local-code artifact and the marker file. |
| From V2 | The `~/.claude/CLAUDE.md`-aware generation step (when rewriting actually happens). |
| From V3 | The integrity verification idea — moved to a separate pillar (`analyzers/`). |
| From V4 | The full manifest analysis for large libs (`script-detector`, `osv-checker`, `static-patterns`, etc.). |
| From V5 | Everything as it stands today. |

## How to tell if a rewrite is wrong

Signs that V5 needs another iteration:

- Many users reporting Category A rewrites breaking their builds → thresholds too loose.
- Rewrites being silently outdated for months → revalidation event triggers wrong.
- Users editing the rewrite scaffold by hand → the agent isn't populating it; skill needs improvement.
- A package wedged in Category A that turns out to be security-critical → categories.json is wrong; PR to policy repo.

The first signal triggers a thresholds update; the others trigger improvements to either the skill or the policy.

## What "rewrite" means today

> A rewrite is a Category A salvage. yieldOS would rather block, but for small low-risk utilities where rewriting is safer than installing, it generates a project-local stub with a content-hash marker. The agent fills it in following the dependency-gate skill. The user sees a one-line message: `[yieldOS] REWRITE realizó una optimización de la instalación de <package>`.

That's it. Not a feature. A salvage.
