# Contributing

Keep changes small and tied to one enforcement, policy, benchmark, or documentation concern.

## Local Validation

Run the checks that match the changed area:

```bash
npm test
node scripts/plugin-check.mjs
node scripts/policy-check.mjs
node scripts/secret-scan-smoke.mjs
git diff --check
```

For plugin packaging or `dist/yieldos-plugin` changes, regenerate and verify the package:

```bash
npm run package:plugin
node scripts/plugin-check.mjs
```

For live model or public-repository benchmark work, provider and network egress must be explicit. Do not add tests that call external providers by default.

## Security Boundaries

- Runtime hook behavior, policy resolution, credential authorization, release scripts, and CI workflows require maintainer review.
- Fixture secrets must stay in approved fixture paths and must be obviously fake.
- Claims in README, landing copy, and benchmark dashboards must separate measured evidence from assumptions.
- Generated benchmark artifacts should not be committed unless the command is deterministic and the artifact is part of documented evidence.

## Pull Request Checklist

- The change is scoped to the stated behavior.
- Relevant tests were added or updated.
- Validation commands are listed in the PR.
- Sensitive paths are covered by CODEOWNERS review.
- Any provider egress or repository cloning is documented and opt-in.
