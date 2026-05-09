# yieldOS · Reality Check

Adversarial pentest of well-known intentionally-vulnerable Node.js
projects, run by the yieldOS red/blue agent loop.

**Targets**

- [`snyk-labs/nodejs-goof`](https://github.com/snyk-labs/nodejs-goof)
- [`juice-shop/juice-shop`](https://github.com/juice-shop/juice-shop)

**TL;DR** — see [`REPORT.md`](./REPORT.md) for the cross-target summary
with severity histogram and top findings.

**Per target**

- `<target>/findings.md` — every finding with attack vector, exploit
  evidence, and fix recommendation. Publishable as-is.
- `<target>/pentest-history.json` — structured per-round log
  (machine-readable).
- `<target>/pentest-events.jsonl` — every event the orchestrator
  emitted, one JSON object per line.
- `<target>/pentest-memory.md` — lessons learned, accumulated across
  rounds. Future blue-team agents read this before patching.
- `<target>/pentest-live.log` — ANSI-colored battle feed. Open in a
  real terminal (`less -R`) to see the red/blue banners in color.
- `<target>/meta.json` — repo, commit, started/finished, summary.

**Methodology**

- Each target was cloned at the commit recorded in `meta.json`.
- The yieldOS orchestrator was launched in **dry-run mode** — the
  red team scanned, the blue team synthesized fixes, but the patches
  were NOT applied to the cloned repo, so the targets stay intact for
  inspection. (Switch with `--apply` when you want the fixes written
  back.)
- Loop config: `--rounds 10 --converge 3`. Both runs converged at
  round 8 (three consecutive clean red rounds).
- Each round picks a fresh strategy from yieldOS's catalog (OWASP Web
  Top 10 + OWASP LLM Top 10 + MITRE supply-chain) and rotates
  through them. The same strategy is not retried in the same depth
  pass until every other strategy has been tried.

**Reproduce**

```bash
git clone https://github.com/snyk-labs/nodejs-goof /tmp/yos-bench/targets/nodejs-goof
git clone https://github.com/juice-shop/juice-shop  /tmp/yos-bench/targets/juice-shop
node yieldOS/plugins/yieldos/scripts/bench/reality-check.js \
  --target /tmp/yos-bench/targets/nodejs-goof \
  --name nodejs-goof \
  --out /tmp/yos-bench/results \
  --rounds 10 --converge 3
node yieldOS/plugins/yieldos/scripts/bench/reality-check.js \
  --target /tmp/yos-bench/targets/juice-shop \
  --name juice-shop \
  --out /tmp/yos-bench/results \
  --rounds 10 --converge 3
node yieldOS/plugins/yieldos/scripts/bench/aggregate-report.js \
  --out /tmp/yos-bench/results
```
