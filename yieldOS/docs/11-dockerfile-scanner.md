# Dockerfile scanner — a new classifier, not a new product

> Status: **plan**, not implemented. This document captures the design before code.

## Why this exists

A Dockerfile is an install manifest. Every `FROM`, every `RUN apt-get install`, every `ADD <url>` is a dependency decision with the same supply-chain risk as `npm install`. Today an agent can write a Dockerfile that:

- Pins to a tag with a known CVE (`node:18.5.0`).
- Floats on `:latest` and produces a non-reproducible image.
- Pipes a remote shell script into bash (`RUN curl … | sh`).
- Hard-codes a token in `ENV` or `ARG`.
- Runs as root in the final stage.

…and yieldOS does not see any of it. The agent's `Write`/`Edit` to a `Dockerfile` passes through `pre-install-gate.js` like any other file edit.

The fix is small: treat a Dockerfile edit as another candidate type, with its own classifier and analyzer. Everything else — policy fetching, logging, hook contract — already exists.

## First principle: this is a classifier, not a product

We are not building a Docker security scanner that competes with Trivy, Grype, or Hadolint. Those are excellent at what they do (deep CVE coverage across distro packages and OS layers). Our job is narrower:

- Catch unsafe patterns when an agent writes a Dockerfile, in the same hook that already catches unsafe `npm install` calls.
- Reuse the policy mechanism: the rules ship in `policy-cache/dockerfile-rules.json`, fetched online-first like everything else.
- Stay agent-side. No CLI, no separate binary. The CI gate (see `10-ci-cd.md`) can adopt this scanner later by reusing the same analyzer.

## How it fits into the existing architecture

```
            ┌────────────────────────────────────────┐
            │  PreToolUse: Bash | Write | Edit       │
            └───────────────────┬────────────────────┘
                                ↓
                    ┌──────────────────────┐
                    │ classifiers/         │
                    │   npm, pnpm, yarn…   │
                    │   pip, poetry, uv    │
                    │   cargo, go          │
                    │   skills, vendoring  │
                    │   binaries           │
                    │   dockerfile  ← NEW  │
                    └──────────┬───────────┘
                               ↓
                       candidate { type }
                               │
                               ↓
                    ┌──────────────────────┐
                    │ decide.js            │
                    │   if type==='package':│
                    │     5-check flow     │
                    │   if type==='dockerfile': ← NEW
                    │     dockerfile flow  │
                    └──────────────────────┘
```

The classifier emits a **candidate** in the same shape `decide.js` already consumes — only the `type` field differs. `decide.js` branches on `type`, dispatching package candidates to the existing 5-check flow and Dockerfile candidates to a new sub-flow.

## Trigger surface

The new classifier matches:

| Hook event       | Match condition                                                              |
| ---------------- | ---------------------------------------------------------------------------- |
| `Write`          | `file_path` matches `Dockerfile`, `Dockerfile.*`, `*.dockerfile`, `Containerfile` |
| `Edit`           | Same path patterns as above                                                  |
| `Bash`           | Command contains `docker build`, `podman build`, `buildah bud`, `nerdctl build` (resolves the `-f` arg or default `./Dockerfile`) |

For `Bash` triggers, the classifier reads the referenced Dockerfile from disk to produce its candidate. For `Write`/`Edit` it uses the new content from the tool input.

## Candidate shape

```
{
  type: 'dockerfile',
  source: 'edit' | 'build',
  path: '<resolved path>',
  content: '<dockerfile text>',
  requested_by: 'agent'
}
```

## The Dockerfile sub-flow in `decide.js`

```
              ┌──────────────────────┐
              │ Dockerfile candidate │
              └──────────┬───────────┘
                         ↓
                Parse instructions
                         │
        ┌────────────────┼────────────────┐
        ↓                ↓                ↓
  CHECK 1            CHECK 2          CHECK 3
  base image       unsafe           secret
  denylisted?      patterns?        in ENV/ARG?
        │                │                │
   yes ─┴─ no       yes ─┴─ no       yes ─┴─ no
    │       │        │       │        │       │
  BLOCK   …        WARN    …        BLOCK   …
                                              ↓
                                       CHECK 4
                                       base image
                                       version vulnerable?
                                              │
                                       yes ───┴─── no
                                        │           │
                                       WARN       CLEAN
                                       (suggest)
```

Verdicts emitted to stderr (matching the existing `[yieldOS:verdict]` contract):

| Verdict                  | Hook exit | Meaning                                                       |
| ------------------------ | --------- | ------------------------------------------------------------- |
| `dockerfile-clean`       | 0         | No findings. Edit proceeds silently.                          |
| `dockerfile-warning`     | 0         | Edit proceeds. Findings emitted; agent surfaces them.         |
| `dockerfile-blocked`     | 2         | Hard block (denylisted base image, secret detected).          |

`dockerfile-warning` is **not** a block. The agent gets a structured findings payload via stderr and can decide whether to revise; the user sees a one-line summary in the standard yieldOS format.

## Detection rules

All rules live in `policy-cache/dockerfile-rules.json`, fetched and cached like every other policy file.

### Block-tier (verdict: `dockerfile-blocked`)

| Rule                         | Why block                                                             |
| ---------------------------- | --------------------------------------------------------------------- |
| `base_image.denylist` match  | Image is on the curated denylist (archived, known-compromised, EOL).  |
| `secret_in_env`              | `ENV`/`ARG` value matches `*_TOKEN`, `*_KEY`, `PASSWORD`, `*_SECRET`. |
| `secret_literal_in_run`      | `RUN` command contains a literal `sk-...`, `ghp_...`, AWS key shape.  |

### Warning-tier (verdict: `dockerfile-warning`)

| Rule                         | Why warn                                                                            |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| `floating_tag`               | `FROM image:latest` or `FROM image` — non-reproducible builds.                      |
| `unpinned_required`          | Image is in `pin_required` list and lacks `@sha256:...` digest.                     |
| `curl_pipe_shell`            | `RUN curl ... \| sh`, `wget ... \| bash` patterns.                                  |
| `add_remote_url`             | `ADD <url>` — prefer `COPY` with checksum verification.                             |
| `runs_as_root`               | No final `USER` directive (or final `USER root`/`USER 0`) in non-base stages.       |
| `apt_no_cleanup`             | `apt-get install` without `--no-install-recommends` and `rm -rf /var/lib/apt/lists/*`. |
| `multi_stage_secret_carry`   | `COPY --from=...` carries a path where secrets were written in an earlier stage.    |

### Vulnerable base image (verdict: `dockerfile-warning` with suggestion)

For `FROM <image>:<version>`, the analyzer looks up the image in OSV (`pkg:docker/<image>@<version>`). When a CVE matches, the warning includes:

- The CVE ID and severity.
- The recommended replacement version (the lowest patched tag for the same major).
- A note that yieldOS **does not** rewrite the Dockerfile.

## Why no auto-rewrite

This is a deliberate echo of `02-rewrite-evolution.md`. The rewriter exists for tiny, low-risk packages where rewriting is safer than installing. A Dockerfile upgrade is the opposite end of the risk spectrum:

- Bumping a base image can break the build silently (different libc, different default user, different shipped binaries).
- A "safer" image may close one CVE and open another.
- The agent is in a better position than yieldOS to test the upgrade.

So yieldOS's job ends at *reporting* the finding with a concrete suggestion. The agent reads `[yieldOS:dockerfile-suggest]` from stderr and decides what to do. We get the value of the analysis without owning the consequences of a bad rewrite.

If a future version ever adds an auto-rewrite path, it should:

1. Be opt-in per-project (a flag in `defaults.json`).
2. Open a separate file (`Dockerfile.yieldos.suggested`) — never overwrite the original.
3. Run the build in CI to verify the upgrade is safe before any merge.

That is a v3 conversation, not a v1 one.

## Policy additions

```
policy-cache/
└── dockerfile-rules.json    ← NEW
```

Schema (sketch):

```json
{
  "version": 1,
  "base_image": {
    "denylist": [
      { "image": "node", "version_range": "<14", "reason": "EOL" },
      { "image": "python", "version_range": "<3.8", "reason": "EOL" }
    ],
    "pin_required": ["myorg/internal-base"]
  },
  "unsafe_patterns": [
    { "id": "curl_pipe_shell", "regex": "curl[^|]+\\|\\s*(sh|bash)", "severity": "warning" },
    { "id": "add_remote_url",  "regex": "^ADD\\s+https?://", "severity": "warning" }
  ],
  "secret_patterns": [
    { "id": "openai_key", "regex": "sk-[A-Za-z0-9]{20,}", "severity": "block" },
    { "id": "github_pat", "regex": "ghp_[A-Za-z0-9]{36}", "severity": "block" }
  ]
}
```

The shape mirrors `injection-patterns.json`, which is the closest existing analog. `policy-fetcher.js` only needs the new filename added to its manifest.

## Logging

New entry type for `<project>/security/dependency-events.md`:

```
## Dockerfile Audit
- timestamp: 2026-05-09T14:22:31Z
- path: ./Dockerfile
- verdict: dockerfile-warning
- findings:
    - rule: floating_tag           severity: warning  line: 1   detail: FROM node:latest
    - rule: curl_pipe_shell        severity: warning  line: 14  detail: curl ... | sh
    - rule: vulnerable_base_image  severity: warning  line: 1   detail: node:18.5.0 → CVE-2023-XXXX, suggest 18.20.4
```

Same redaction rules apply: any matched secret value is replaced with `***REDACTED***` before the entry is written.

## Tests

New test file `tests/dockerfile.test.js` (matching the existing test layout):

- Classifier matches expected file paths and `docker build` invocations.
- Each detection rule fires on positive fixtures and stays silent on negative fixtures.
- `decide.js` emits the right verdict for each rule severity.
- Logger writes the new entry shape with secrets redacted.
- End-to-end: a `Write` of a Dockerfile with mixed clean/warning/block findings produces the expected hook output.

Target: ~25 cases. Same `node:test`, no new dependencies.

## What is explicitly out of scope

- Layer-level CVE scanning (Trivy territory). yieldOS only inspects the Dockerfile text, not the resulting image.
- Compose files. `docker-compose.yml`, `kubernetes` manifests, Helm charts — separate effort, similar pattern but different surface.
- Image signing / provenance verification (Sigstore, cosign). That is a deploy-time concern, not an authoring-time one.
- Full Hadolint replacement. We catch the high-signal patterns; deep linting stays with Hadolint.

## Phases

| Phase | Scope                                                                              | Estimate |
| ----- | ---------------------------------------------------------------------------------- | -------- |
| 1     | `classifiers/dockerfile.js` + `analyzers/dockerfile-checks.js` with unsafe patterns and secret detection. Wire into `decide.js`. Tests. | 1 day    |
| 2     | `policy-cache/dockerfile-rules.json` with curated `base_image.denylist`. Policy-fetcher manifest update. | 0.5 day  |
| 3     | OSV lookup for base image versions → warning with version suggestion.              | 1 day    |
| 4     | (Future, with care) Optional `Dockerfile.yieldos.suggested` companion file.        | —        |

Total for v1 (phases 1–3): ~2.5 days.

## Relationship to the CI gate

Once the CI gate exists (`10-ci-cd.md`), the same `analyzers/dockerfile-checks.js` runs against any Dockerfile changed in the PR diff. Same policy, same findings, second enforcement point. No new code in CI beyond an additional candidate type in `lockfile-diff.js` (which becomes `change-set.js` once Dockerfiles are part of it).
