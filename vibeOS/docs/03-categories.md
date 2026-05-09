# The 4 categories

Every package can be classified into one of four categories. Categories drive what yieldOS does when the package is **not** on the allowlist or denylist.

## The four

```
┌─────────────────────────────────────────────────────────────────┐
│ A — Safe to rewrite                                              │
│ Small, simple, non-critical, narrow usage.                       │
│ Action: REWRITE LOCALLY (last-resort salvage when not listed)    │
│ Examples: clsx, classnames, uuid, nanoid, ms, slugify, p-limit   │
├─────────────────────────────────────────────────────────────────┤
│ B — Rewrite with care                                            │
│ Medium size, some edge cases, manageable but risky.              │
│ Action: ANALYZE (manifest + scripts + OSV + static)              │
│ Examples: cookie, qs, ora, js-yaml, commander, yargs, chalk      │
├─────────────────────────────────────────────────────────────────┤
│ C — Dangerous to rewrite                                         │
│ Standards-compliance, edge cases, behavior-critical.             │
│ Action: ANALYZE (same as B)                                      │
│ Examples: axios, date-fns, marked, cheerio, multer, body-parser  │
├─────────────────────────────────────────────────────────────────┤
│ D — Never rewrite                                                │
│ Security-critical, framework-coupled, ecosystem-coupled.         │
│ Action: BLOCK (requires PR to policy)                            │
│ Examples: bcrypt, jsonwebtoken, react, express, prisma, pg       │
└─────────────────────────────────────────────────────────────────┘
```

## Decision criteria

```
                      ┌──────────────────────────┐
                      │ For each unlisted package │
                      └────────────┬──────────────┘
                                   ↓
              ┌────────────────────┴─────────────────────┐
              │ Explicit category in policy/categories.json? │
              └────────────────────┬─────────────────────┘
                  ┌────────────────┼────────────────┐
                  ↓ A              ↓ B/C            ↓ D
            REWRITE LOCAL    ANALYZE (large-lib)   BLOCK
                                                     │
              No explicit category                   │
                  ↓                                  │
        ┌─────────────────────────┐                  │
        │ Name/desc keyword match? │                 │
        │ (crypto/auth/orm/db/…)   │─→ matches D ────┤
        └─────────┬───────────────┘
                  ↓ no match
        ┌──────────────────────────┐
        │ Meets Category A         │
        │ size+complexity threshold? │ ─→ yes → REWRITE
        └─────────┬────────────────┘
                  ↓ no
              ANALYZE (large-lib)
```

## Category A — explicit list

Maintained in `policy/categories.json` under `A_safe_to_rewrite`. Examples shipped:

```
classnames, clsx, uuid, nanoid, ms, bytes, mitt, p-limit,
slugify, change-case, debounce, throttle-debounce, memoize-one,
is-plain-object, array-move, eventemitter3, escape-string-regexp,
copy-to-clipboard, tiny-invariant, picocolors
```

Properties shared by A:
- < 200 LOC
- 0–1 direct dependencies
- < 50 KB unpacked
- < 30 files in the tarball
- Stable, well-defined behavior
- No standards compliance
- No security implication

## Category B — explicit list

Manageable rewriting, but yieldOS prefers analysis. Listed in `B_rewrite_with_care`:

```
cookie, qs, ora, js-yaml, commander, yargs, chalk, winston,
lru-cache, validator, node-cron
```

These are the boundary cases. They could be rewritten, but the per-project benefit is rarely worth the maintenance burden, so yieldOS analyzes them as if they were large libs.

## Category C — explicit list

Listed in `C_dangerous_to_rewrite`. Behavior-critical, lots of edge cases, full of standards:

```
axios, got, node-fetch, ky,
date-fns, dayjs, moment, luxon,
chokidar, glob, fast-glob,
marked, markdown-it, cheerio,
multer, body-parser, cors, helmet,
react-hook-form, formik, zod,
pino, bunyan, mongoose, socket.io-client
```

Same handling as B at runtime: analyze, don't rewrite. The classification exists for documentation and human curation purposes.

## Category D — explicit list (the long one)

The hard-block list. yieldOS will never auto-resolve these; they require PR to the policy repo:

```
Crypto: bcrypt, argon2, scrypt-js, jsonwebtoken, jose, crypto-js, node-forge
Auth:   passport, next-auth, lucia, csurf, express-session, iron-session
Frameworks: react, vue, svelte, solid-js, next, remix, nuxt, astro,
            express, fastify, koa, hapi
ORMs:   prisma, drizzle-orm, typeorm, sequelize
DBs:    pg, mysql2, mongodb, redis, sqlite3
Build:  webpack, vite, rollup, esbuild, swc, parcel
Compilers: typescript, babel, postcss
Linters: eslint, prettier, biome
Tests:  jest, vitest, mocha, playwright, cypress
GraphQL: graphql, apollo-server
BigNum: decimal.js, bignumber.js, big.js
Money:  dinero.js, currency.js
i18n:   i18next, react-intl, formatjs
Schema: ajv
Serial: protobufjs, msgpack, cbor
Image:  sharp, jimp, canvas
Email:  nodemailer
Browser: puppeteer, playwright-core, jsdom
Animation: framer-motion, react-spring, gsap
Charts: recharts, chart.js, d3
State:  xstate
Queue:  bull, bullmq, agenda
Polyfills: core-js, regenerator-runtime
Reactive: rxjs

Python:
crypto: cryptography, pyjwt, passlib, bcrypt, argon2-cffi
frameworks: django, flask, fastapi, starlette
ORMs: sqlalchemy, peewee, tortoise-orm
schema: pydantic, marshmallow
http: requests, httpx, urllib3
science: numpy, pandas, scipy, matplotlib, seaborn, plotly,
         scikit-learn, tensorflow, torch, keras, xgboost, lightgbm
image: pillow, opencv-python
db drivers: redis, psycopg2, pymongo
testing: pytest
queue: celery
ML/LLM: langchain, transformers, huggingface-hub, sentence-transformers
notebooks: jupyter, notebook, ipython
web: beautifulsoup4, lxml, selenium
```

## Keyword fallback for unlisted packages

If a package is not explicitly classified, yieldOS scans `(name + description)` for category-revealing keywords:

```json
{
  "crypto":      ["crypto", "encrypt", "decrypt", "cipher", "hash", "bcrypt", "argon", "scrypt", "aes", "rsa", "ecdsa"],
  "auth":        ["auth", "passport", "oauth", "jwt", "session", "csrf", "login", "saml", "openid"],
  "framework":   ["framework", "react", "vue", "angular", "svelte", "express", "fastify", "django", "flask"],
  "compiler":    ["compiler", "transpile", "babel", "swc", "tsc"],
  "build-tool":  ["bundler", "webpack", "vite", "rollup", "esbuild", "parcel"],
  "linter":      ["lint", "eslint", "prettier", "biome", "ruff", "flake"],
  "orm":         ["orm", "prisma", "drizzle", "typeorm", "sequelize", "sqlalchemy"],
  "db-driver":   ["postgres", "mysql", "mongodb", "redis", "sqlite", "cassandra", "driver"],
  "i18n":        ["i18n", "intl", "locale", "translation"],
  "polyfill":    ["polyfill", "shim", "ponyfill"],
  "big-number":  ["bignumber", "decimal", "big.js"],
  "currency":    ["currency", "dinero", "money"],
  "serialization": ["protobuf", "msgpack", "cbor", "avro"],
  "image-processing": ["image", "sharp", "jimp", "canvas", "pillow"],
  "browser-automation": ["puppeteer", "playwright", "selenium", "jsdom"],
  "test-runner": ["jest", "vitest", "mocha", "pytest", "cypress"]
}
```

Any keyword match → category D → block. False positives are accepted (a package that mentions "auth" in passing gets blocked); the cost of the false positive is one PR to the policy repo.

## How a category is added or changed

The user does not edit `categories.json` locally. The process is:

1. Identify the missing or wrong category via `security/dependency-events.md`.
2. Open a PR to the official policy repo proposing the change.
3. The maintainer reviews and merges.
4. Next `SessionStart` (or `UserPromptSubmit` if cache is stale) pulls the change.

This is by design. Categories are a shared trust artifact, not a per-machine setting.
