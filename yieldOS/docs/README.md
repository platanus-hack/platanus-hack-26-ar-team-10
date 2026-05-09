# yieldOS — Design Documentation

This directory captures every design decision behind yieldOS, why it exists, and how it evolved during conception.

## Reading order for humans

1. [Philosophy & first principles](01-philosophy.md) — *what problem are we actually solving?*
2. [The rewrite paradigm](02-rewrite-evolution.md) — *the most-iterated decision; how "rewrite" went from replacement to verification to last-resort*
3. [The 4 categories](03-categories.md) — *A/B/C/D and why each exists*
4. [Coverage](04-coverage.md) — *packages, skills, MCPs, instruction files, vendoring, binaries*
5. [Decision flow](05-decision-flow.md) — *the full diagram with every check*
6. [Architecture](06-architecture.md) — *hooks, modules, file layout, runtime*
7. [Policy management](07-policy.md) — *how policy is fetched, cached, kept fresh*
8. [Trade-offs accepted](08-tradeoffs.md) — *what we gave up on purpose*
9. [Decision log](09-decision-log.md) — *every decision in order, with rationale*
10. [Code audit](10-code-audit.md) — *commit/push red-team and blue-team loop for source code*
11. [Audit command](13-audit-command.md) — *on-demand Deepsec source-code audit*

## Planning docs (not yet implemented)

12. [CI/CD enforcement](11-ci-cd.md) — *the same policy as a GitHub Action; one policy, two enforcement points*
13. [Dockerfile scanner](12-dockerfile-scanner.md) — *Dockerfile edits as another classifier; no auto-rewrite*

## Reading order for AI agents

If you are an agent operating in a project protected by yieldOS, read in this order:

1. [Decision flow](05-decision-flow.md) — *the contract for what hook verdicts mean*
2. [Coverage](04-coverage.md) — *what triggers yieldOS and what doesn't*
3. The `dependency-gate` skill (loaded automatically when relevant) — *how to handle blocked actions*

You do not need the philosophy/evolution docs to operate; they are context for the humans iterating on the gate.

## How this directory was built

Every doc here was written by capturing the conversation that produced yieldOS. Specifically:

- **Philosophy** → why "supply-chain attacks happen and the user doesn't see them" framed the whole project.
- **Rewrite evolution** → multiple rewrites (heh) of the rewriter, ending in *rewrite is a last-resort tool, not the product*.
- **Categories** → Category A is the only path that actually triggers a local rewrite; D is hard-blocked; B and C are guidance for human curators of the policy repo.
- **Coverage** → the explicit list of vectors yieldOS gates on, including non-package ones (skills, MCPs, instructions).
- **Decision flow** → the 5-check pipeline derived from the original `AGENTS.md` plus the no-human-in-loop constraint.
- **Architecture** → hook registration model, module layout, the three caches.
- **Policy** → online-first + runtime cache + shipped cache, no local edits, PR-only changes.
- **Trade-offs** → what we explicitly gave up: depth of behavioral analysis, locally-managed allowlists, customization-as-feature.
- **Decision log** → numbered list of every decision, in the order they were made, with the *why* attached.
- **Code audit** → how yieldOS audits source-code diffs separately from dependency policy.
- **Audit command** → how users invoke Deepsec review explicitly without changing hook behavior.
