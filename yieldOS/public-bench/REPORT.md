# yieldOS · Reality Check

> Adversarial pentest of well-known intentionally-vulnerable projects
> with the yieldOS red/blue agent loop. Dry-run by default — no patches
> were applied to the target repos. This report is auto-generated.

## Cross-target summary

| target | findings | critical | high | medium | low |
| --- | --- | --- | --- | --- | --- |
| **juice-shop** | 4 | 2 | 2 | 0 | 0 |
| **nodejs-goof** | 5 | 2 | 3 | 0 | 0 |
| **total** | **9** | 4 | 5 | 0 | 0 |

---

## Per-target detail

## juice-shop

- repo: [https://github.com/juice-shop/juice-shop](https://github.com/juice-shop/juice-shop)
- commit: `3b178fd07b9f`
- bench started: 2026-05-09T10:03:07.983Z
- bench finished: 2026-05-09T10:20:30.401Z
- elapsed: 17m 22s

### Outcome

| metric | value |
| --- | --- |
| rounds | 8 |
| findings | **4** |
| fixes applied | 0 |
| terminated | converged |

### Severity histogram

| critical | high | medium | low | unknown |
| --- | --- | --- | --- | --- |
| 2 | 2 | 0 | 0 | 0 |

### Strategies that produced rounds

- `owasp-a01-broken-access-control` × 1
- `owasp-a03-injection` × 1
- `owasp-a05-security-misconfiguration` × 1
- `owasp-a08-software-integrity` × 1
- `owasp-a10-ssrf` × 1
- `owasp-llm02-insecure-output` × 1
- `owasp-llm06-sensitive-info-disclosure` × 1
- `attck-supply-chain-typo` × 1

### Top findings

- **[CRITICAL]** SQL injection authentication bypass in /rest/user/login via string-concatenated email/password into raw SELECT — `routes/login.ts`  · round 2 · `owasp-a03-injection`
- **[CRITICAL]** Deserialization/eval of untrusted JS body in /b2b/v2/orders via notevil + vm sandbox (RCE / sandbox escape) — `routes/b2bOrder.ts`  · round 4 · `owasp-a08-software-integrity`
- **[HIGH]** IDOR in /rest/basket/:id allows any authenticated user to read any other user's basket — `routes/basket.ts`  · round 1 · `owasp-a01-broken-access-control`
- **[HIGH]** Unrestricted SSRF in /profile/image/url — fetch() of attacker-controlled URL with response body written to a publicly served path (cloud metadata theft / internal service probe) — `routes/profileImageUrlUpload.ts`  · round 5 · `owasp-a10-ssrf`

See [`juice-shop/findings.md`](./juice-shop/findings.md) for the full list with attack vectors and fix recommendations.

---

## nodejs-goof

- repo: [https://github.com/snyk-labs/nodejs-goof](https://github.com/snyk-labs/nodejs-goof)
- commit: `add14ba59e98`
- bench started: 2026-05-09T10:03:07.983Z
- bench finished: 2026-05-09T10:19:35.821Z
- elapsed: 16m 27s

### Outcome

| metric | value |
| --- | --- |
| rounds | 8 |
| findings | **5** |
| fixes applied | 0 |
| terminated | converged |

### Severity histogram

| critical | high | medium | low | unknown |
| --- | --- | --- | --- | --- |
| 2 | 3 | 0 | 0 | 0 |

### Strategies that produced rounds

- `owasp-a01-broken-access-control` × 1
- `owasp-a03-injection` × 1
- `owasp-a05-security-misconfiguration` × 1
- `owasp-a08-software-integrity` × 1
- `owasp-a10-ssrf` × 1
- `owasp-llm02-insecure-output` × 1
- `owasp-llm06-sensitive-info-disclosure` × 1
- `attck-supply-chain-typo` × 1

### Top findings

- **[CRITICAL]** OS command injection in Todo create handler via shell concatenation of user-controlled URL — `routes/index.js`  · round 2 · `owasp-a03-injection`
- **[CRITICAL]** Hardcoded default admin credentials seeded on every startup grant full /admin access — `mongoose-db.js`  · round 3 · `owasp-a05-security-misconfiguration`
- **[HIGH]** Unauthenticated IDOR on GET /destroy/:id allows anyone to delete any todo (CSRF-able) — `routes/index.js`  · round 1 · `owasp-a01-broken-access-control`
- **[HIGH]** Dockerfile bypasses lockfile (`npm update && npm install`) — every build pulls unpinned deps and runs their lifecycle scripts as root — `Dockerfile`  · round 4 · `owasp-a08-software-integrity`
- **[HIGH]** SSRF via ImageMagick `identify` on user-controlled markdown image URL — reaches IMDS, internal services, file:// — `routes/index.js`  · round 5 · `owasp-a10-ssrf`

See [`nodejs-goof/findings.md`](./nodejs-goof/findings.md) for the full list with attack vectors and fix recommendations.

---

## How to reproduce

```bash
git clone https://github.com/snyk-labs/nodejs-goof /tmp/yos-bench/targets/nodejs-goof
git clone https://github.com/juice-shop/juice-shop /tmp/yos-bench/targets/juice-shop
node yieldOS/plugins/yieldos/scripts/bench/reality-check.js \
  --target /tmp/yos-bench/targets/nodejs-goof \
  --name nodejs-goof \
  --out /tmp/yos-bench/results \
  --rounds 10 --converge 3
# (idem for juice-shop)
node yieldOS/plugins/yieldos/scripts/bench/aggregate-report.js \
  --out /tmp/yos-bench/results
```
