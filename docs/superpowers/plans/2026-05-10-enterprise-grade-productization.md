# Enterprise Grade Productization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move yieldOS from event-ready security prototype to a professional enterprise-grade agent security product with trustworthy distribution, policy integrity, credential safety, auditability, evidence discipline, and clear support boundaries.

**Architecture:** Keep the current Claude Code plugin as the enforced runtime core. Add small, focused services around release integrity, policy bundle verification, credential authorization, structured audit events, benchmark evidence, and provider egress controls. Avoid generic platform abstractions until there are at least three enforced agent adapters.

**Tech Stack:** Node.js CommonJS for plugin runtime, existing npm scripts, GitHub Actions, JSON policy bundles, local filesystem caches, Next.js landing app, built-in Node `crypto` for hashes and signatures where possible.

---

## Enterprise Readiness Verdict

The repo has real product substance: installable plugin packaging, Claude Code hooks, policy validation, changed-code gates, oracle contracts, benchmark scripts, and a public story. It is not an enterprise product yet because the trust chain and operating boundaries still look like a fast-moving competition repo.

Treat these as enterprise blockers:

1. Distribution trust still depends on mutable GitHub paths and a `curl | sh` primary path.
2. Runtime policy authority points at raw GitHub `main` without signed or pinned bundle verification.
3. Credential authorization is a repo-local file with a static phrase and a 30-minute TTL.
4. Public identity still contains event-specific package names, repository names, docs, manifests, and install URLs.
5. Benchmark artifacts include `local-review` evidence that is useful internally but weak as public proof.
6. Audit logs are useful for humans but lack a stable machine-readable event schema, sequence guarantees, and tamper evidence.
7. CI verifies many project-specific invariants but misses enterprise supply-chain controls such as security disclosure docs, code owners, dependency update policy, secret scanning, SBOM or checksum artifacts, and release provenance.
8. Some runtime and benchmark modules are too large to safely extend without extracting focused services.
9. Provider-backed repair and workflow scripts can send repo context to external models without an enterprise-grade opt-in and data-egress story.
10. Hard enforcement currently exists for Claude Code hooks; other agent surfaces should be described as guided or advisory until they have an enforced adapter.

## Public Claim Boundary

Use this claim for enterprise positioning after the work below:

> yieldOS is a local agent-action security firewall for coding agents. The current enforced adapter is Claude Code. It blocks policy-covered risky actions before sensitive operations, verifies selected code changes with deterministic gates and scoped oracle contracts, records tamper-evident local audit events, and escalates uncovered cases instead of trusting model self-review.

Do not claim universal SAST, universal malware detection, universal cross-agent enforcement, measured provider billing savings, or whole-repo vulnerability discovery unless the matching clean evidence bundle exists.

## File Structure

Create or modify these areas:

- `README.md`: enterprise product positioning, installation trust model, proof boundaries, and supported adapters.
- `package.json`: root package identity and enterprise scripts.
- `install.sh`: pinned-release installation path, checksum verification, dry-run output, and legacy convenience path warning.
- `.claude-plugin/marketplace.json`: marketplace metadata that no longer identifies the product as an event repo.
- `yieldOS/plugins/yieldos/.claude-plugin/plugin.json`: plugin metadata and support links.
- `yieldOS/plugins/yieldos/scripts/policy-fetcher.js`: verified policy bundle loading.
- `yieldOS/plugins/yieldos/scripts/policy-manifest.js`: manifest verification helpers.
- `yieldOS/plugins/yieldos/tests/policy-manifest.test.js`: hash and tamper tests.
- `scripts/generate-policy-manifest.mjs`: policy hash manifest generator.
- `policy/manifest.json`: generated policy bundle manifest.
- `yieldOS/plugins/yieldos/scripts/credential-auth.js`: runtime credential authorization store.
- `yieldOS/plugins/yieldos/scripts/pre-install-gate.js`: credential-gate integration through the new helper.
- `yieldOS/plugins/yieldos/scripts/on-prompt-submit.js`: nonce challenge and authorization writing.
- `yieldOS/plugins/yieldos/tests/credentials.test.js`: nonce, TTL, repo-write protection, and target binding tests.
- `yieldOS/plugins/yieldos/scripts/logger.js`: human log wrapper over structured event writer.
- `yieldOS/plugins/yieldos/scripts/audit-events.js`: JSONL event schema, redaction, sequence, and hash-chain logic.
- `yieldOS/plugins/yieldos/tests/audit-events.test.js`: structured event regression tests.
- `scripts/evidence-verify.mjs`: clean evidence bundle verifier.
- `benchmarks/README.md`: public evidence taxonomy and clean-run rules.
- `benchmarks/internal/README.md`: local-review artifact policy.
- `scripts/provider-egress.js`: shared egress gate for model-backed scripts.
- `scripts/peer-repo-repair/repair-agent.mjs`: explicit provider-egress opt-in.
- `scripts/model-workflow-benchmark.mjs`: explicit provider-egress opt-in and redaction summary.
- `.github/CODEOWNERS`: ownership for runtime, policy, docs, and release changes.
- `.github/dependabot.yml`: dependency update policy.
- `.github/workflows/security.yml`: secret, dependency, and static-analysis workflow.
- `.github/workflows/release.yml`: release checksum and provenance artifacts.
- `SECURITY.md`: disclosure and support policy.
- `SUPPORT.md`: supported platforms and versions.
- `CONTRIBUTING.md`: contribution quality bar.
- `docs/archive/event-readiness/README.md`: archive for event-specific artifacts.
- `yieldOS/docs/enterprise-boundaries.md`: enforced vs advisory adapter matrix and data-flow boundaries.

---

### Task 1: Public Identity And Documentation Split

**Files:**
- Modify: `package.json`
- Modify: `README.md`
- Modify: `.claude-plugin/marketplace.json`
- Modify: `yieldOS/plugins/yieldos/.claude-plugin/plugin.json`
- Modify: `install.sh`
- Modify: `landing/README.md`
- Modify: `yieldOS/docs/README.md`
- Create: `docs/archive/event-readiness/README.md`
- Move or archive: `platanus-hack-project.json`
- Move or archive: `yieldOS/docs/24-hackathon-pitch.md`

- [ ] **Step 1: Record the current public-surface matches**

Run:

```bash
rg -n "hackathon|platanus-hack|judge|reviewer|local-review|Demo For Reviewers" README.md package.json install.sh landing yieldOS .claude-plugin benchmarks docs
```

Expected: matches appear in root identity, install URLs, landing docs, marketplace manifests, benchmark docs, and event-specific docs.

- [ ] **Step 2: Archive event-specific docs**

Create `docs/archive/event-readiness/README.md` with:

```markdown
# Event Readiness Archive

This directory keeps historical event-specific pitch and judging material out of the enterprise product surface.

Enterprise docs must describe the supported product, current enforcement boundaries, installation trust model, and reproducible evidence. Event-specific artifacts may remain here for internal provenance, but they must not be linked as primary customer documentation.
```

Move event-only docs into this archive:

```bash
mkdir -p docs/archive/event-readiness
git mv platanus-hack-project.json docs/archive/event-readiness/platanus-hack-project.json
git mv yieldOS/docs/24-hackathon-pitch.md docs/archive/event-readiness/24-event-pitch.md
```

- [ ] **Step 3: Rename root package identity**

In `package.json`, change:

```json
{
  "name": "yieldos-root"
}
```

Keep existing scripts. Do not remove untracked benchmark scripts unless the benchmark owner confirms they are obsolete.

- [ ] **Step 4: Replace event-owned marketplace metadata**

In `.claude-plugin/marketplace.json`, use:

```json
{
  "name": "yieldos",
  "display_name": "yieldOS",
  "description": "Agent-action security firewall for coding agents",
  "owner": "yieldos",
  "source": "./dist/yieldos-plugin"
}
```

In `yieldOS/plugins/yieldos/.claude-plugin/plugin.json`, keep the existing version and runtime fields, then set:

```json
{
  "author": "yieldOS",
  "homepage": "https://github.com/yieldos/yieldos"
}
```

- [ ] **Step 5: Replace install URL examples**

In `README.md`, `install.sh`, and landing install copy, replace raw `main` examples with a pinned release example:

```bash
curl -fsSLO https://github.com/yieldos/yieldos/releases/download/yieldos--v0.11.1/install.sh
curl -fsSLO https://github.com/yieldos/yieldos/releases/download/yieldos--v0.11.1/checksums.txt
shasum -a 256 -c checksums.txt --ignore-missing
sh install.sh --dry-run
sh install.sh
```

The legacy convenience path may remain under an "advanced" heading only if it explicitly says it is not the enterprise installation path.

- [ ] **Step 6: Verify public-surface cleanup**

Run:

```bash
rg -n "hackathon|platanus-hack|judge|reviewer|Demo For Reviewers" README.md package.json install.sh landing yieldOS .claude-plugin benchmarks docs --glob '!docs/archive/event-readiness/**' --glob '!docs/superpowers/**'
```

Expected: no matches in active public docs, install paths, package metadata, marketplace metadata, or landing docs.

- [ ] **Step 7: Commit**

```bash
git add README.md package.json install.sh landing/README.md yieldOS/docs/README.md .claude-plugin/marketplace.json yieldOS/plugins/yieldos/.claude-plugin/plugin.json docs/archive/event-readiness
git commit -m "docs: separate enterprise product surface from event archive"
```

---

### Task 2: Release And Install Trust Chain

**Files:**
- Modify: `install.sh`
- Modify: `.github/workflows/release.yml`
- Modify: `scripts/build-plugin-package.mjs`
- Modify: `scripts/plugin-check.mjs`
- Create: `scripts/generate-release-checksums.mjs`
- Create: `scripts/generate-release-checksums.test.mjs`
- Modify: `README.md`

- [ ] **Step 1: Add checksum generator tests**

Create `scripts/generate-release-checksums.test.mjs`:

```js
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { generateChecksums } from "./generate-release-checksums.mjs";

test("generateChecksums writes stable sha256 lines", async () => {
  const dir = await mkdtemp(join(tmpdir(), "yieldos-release-"));
  await writeFile(join(dir, "install.sh"), "#!/bin/sh\nexit 0\n");
  await writeFile(join(dir, "yieldos-plugin.tgz"), "plugin archive\n");

  const output = await generateChecksums({
    cwd: dir,
    files: ["install.sh", "yieldos-plugin.tgz"],
    outputFile: "checksums.txt"
  });

  assert.equal(output.lines.length, 2);
  assert.match(output.lines[0], /^[a-f0-9]{64}  install\.sh$/);
  assert.match(output.lines[1], /^[a-f0-9]{64}  yieldos-plugin\.tgz$/);

  const saved = await readFile(join(dir, "checksums.txt"), "utf8");
  assert.equal(saved, `${output.lines.join("\n")}\n`);
});
```

- [ ] **Step 2: Implement checksum generator**

Create `scripts/generate-release-checksums.mjs`:

```js
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export async function generateChecksums({ cwd = process.cwd(), files, outputFile = "checksums.txt" }) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error("files must be a non-empty array");
  }

  const lines = [];
  for (const file of files) {
    if (file.includes("..") || file.startsWith("/")) {
      throw new Error(`refusing unsafe release path: ${file}`);
    }
    const bytes = await readFile(join(cwd, file));
    const hash = createHash("sha256").update(bytes).digest("hex");
    lines.push(`${hash}  ${file}`);
  }

  await writeFile(join(cwd, outputFile), `${lines.join("\n")}\n`);
  return { outputFile, lines };
}

async function main() {
  const files = process.argv.slice(2);
  await generateChecksums({ files });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
```

- [ ] **Step 3: Run checksum tests**

Run:

```bash
node --test scripts/generate-release-checksums.test.mjs
```

Expected: PASS.

- [ ] **Step 4: Extend release workflow artifacts**

In `.github/workflows/release.yml`, after package build and validation, add steps that create release artifacts and checksums:

```yaml
      - name: Pack plugin artifact
        run: tar -czf yieldos-plugin.tgz -C dist yieldos-plugin

      - name: Generate release checksums
        run: node scripts/generate-release-checksums.mjs install.sh yieldos-plugin.tgz

      - name: Verify release checksums
        run: shasum -a 256 -c checksums.txt
```

Attach `install.sh`, `yieldos-plugin.tgz`, and `checksums.txt` to the GitHub release.

- [ ] **Step 5: Update installer dry-run trust output**

In `install.sh`, make `--dry-run` print:

```text
yieldOS installer dry run
- source: pinned GitHub release
- checksum: verified before execution by the documented install flow
- target: Claude Code plugin marketplace
- network: marketplace add/install only
- writes: Claude Code plugin files and yieldOS runtime cache
```

Do not make the installer self-verify a checksum it downloads from the same untrusted command stream. The enterprise flow verifies before executing.

- [ ] **Step 6: Verify package and release checks**

Run:

```bash
npm run package:plugin
node scripts/plugin-check.mjs
node scripts/generate-release-checksums.mjs install.sh
shasum -a 256 -c checksums.txt
```

Expected: plugin check passes and checksum verification prints `install.sh: OK`.

- [ ] **Step 7: Commit**

```bash
git add install.sh .github/workflows/release.yml scripts/generate-release-checksums.mjs scripts/generate-release-checksums.test.mjs scripts/build-plugin-package.mjs scripts/plugin-check.mjs README.md
git commit -m "build: add verifiable release install artifacts"
```

---

### Task 3: Signed Or Pinned Policy Bundle Integrity

**Files:**
- Create: `scripts/generate-policy-manifest.mjs`
- Create: `yieldOS/plugins/yieldos/scripts/policy-manifest.js`
- Modify: `yieldOS/plugins/yieldos/scripts/policy-fetcher.js`
- Modify: `scripts/policy-check.mjs`
- Create: `yieldOS/plugins/yieldos/tests/policy-manifest.test.js`
- Create: `policy/manifest.json`
- Modify: `yieldOS/docs/07-policy.md`

- [ ] **Step 1: Add policy manifest tests**

Create `yieldOS/plugins/yieldos/tests/policy-manifest.test.js`:

```js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createPolicyManifest, verifyPolicyBundle } = require("../scripts/policy-manifest");

test("verifyPolicyBundle accepts matching policy file hashes", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "yieldos-policy-"));
  fs.mkdirSync(path.join(root, "policy"));
  fs.writeFileSync(path.join(root, "policy", "packages.json"), "{\"allow\":[]}\n");

  const manifest = createPolicyManifest({
    policyRoot: path.join(root, "policy"),
    files: ["packages.json"],
    version: "2026.05.10"
  });

  const result = verifyPolicyBundle({
    policyRoot: path.join(root, "policy"),
    manifest
  });

  assert.equal(result.ok, true);
  assert.equal(result.files.length, 1);
});

test("verifyPolicyBundle rejects tampered policy files", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "yieldos-policy-"));
  fs.mkdirSync(path.join(root, "policy"));
  fs.writeFileSync(path.join(root, "policy", "packages.json"), "{\"allow\":[]}\n");

  const manifest = createPolicyManifest({
    policyRoot: path.join(root, "policy"),
    files: ["packages.json"],
    version: "2026.05.10"
  });

  fs.writeFileSync(path.join(root, "policy", "packages.json"), "{\"allow\":[\"left-pad\"]}\n");

  assert.throws(
    () => verifyPolicyBundle({ policyRoot: path.join(root, "policy"), manifest }),
    /policy hash mismatch: packages\.json/
  );
});
```

- [ ] **Step 2: Implement policy manifest helper**

Create `yieldOS/plugins/yieldos/scripts/policy-manifest.js`:

```js
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function hashFile(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function assertSafePolicyPath(relativePath) {
  if (relativePath.includes("..") || path.isAbsolute(relativePath)) {
    throw new Error(`unsafe policy path: ${relativePath}`);
  }
}

function createPolicyManifest({ policyRoot, files, version }) {
  const entries = files.map((relativePath) => {
    assertSafePolicyPath(relativePath);
    return {
      path: relativePath,
      sha256: hashFile(path.join(policyRoot, relativePath))
    };
  });

  return {
    schema_version: 1,
    version,
    generated_at: new Date(0).toISOString(),
    files: entries
  };
}

function verifyPolicyBundle({ policyRoot, manifest }) {
  if (!manifest || manifest.schema_version !== 1 || !Array.isArray(manifest.files)) {
    throw new Error("invalid policy manifest");
  }

  const files = [];
  for (const entry of manifest.files) {
    assertSafePolicyPath(entry.path);
    const actual = hashFile(path.join(policyRoot, entry.path));
    if (actual !== entry.sha256) {
      throw new Error(`policy hash mismatch: ${entry.path}`);
    }
    files.push(entry.path);
  }

  return { ok: true, version: manifest.version, files };
}

module.exports = {
  createPolicyManifest,
  verifyPolicyBundle
};
```

- [ ] **Step 3: Add generator script**

Create `scripts/generate-policy-manifest.mjs` that loads the helper through `createRequire`, scans `policy/*.json` excluding `manifest.json`, and writes `policy/manifest.json`:

```js
import { createRequire } from "node:module";
import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { createPolicyManifest } = require("../yieldOS/plugins/yieldos/scripts/policy-manifest.js");

export async function generatePolicyManifest({ policyRoot = "policy", version }) {
  const names = await readdir(policyRoot);
  const files = names
    .filter((name) => name.endsWith(".json") && name !== "manifest.json")
    .sort();

  const manifest = createPolicyManifest({
    policyRoot,
    files,
    version
  });

  await writeFile(join(policyRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

async function main() {
  const version = process.argv[2];
  if (!version) {
    throw new Error("usage: node scripts/generate-policy-manifest.mjs <version>");
  }
  await generatePolicyManifest({ version });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Integrate verification into policy fetch**

In `yieldOS/plugins/yieldos/scripts/policy-fetcher.js`, after loading remote or cached policy files, verify `manifest.json` before returning policy data:

```js
const { verifyPolicyBundle } = require("./policy-manifest");

function verifyLoadedPolicyCache(cacheDir, manifest) {
  return verifyPolicyBundle({
    policyRoot: cacheDir,
    manifest
  });
}
```

If verification fails, print a concise warning and fall back to the packaged cache. If both remote and packaged cache fail verification, fail closed.

- [ ] **Step 5: Extend policy check**

In `scripts/policy-check.mjs`, verify that `policy/manifest.json` exactly matches the current policy files. The check should fail when a policy file changes without regenerating the manifest.

- [ ] **Step 6: Run policy integrity tests**

Run:

```bash
node --test yieldOS/plugins/yieldos/tests/policy-manifest.test.js
node scripts/generate-policy-manifest.mjs 2026.05.10
node scripts/policy-check.mjs
```

Expected: all commands pass and `policy/manifest.json` is updated.

- [ ] **Step 7: Commit**

```bash
git add scripts/generate-policy-manifest.mjs policy/manifest.json scripts/policy-check.mjs yieldOS/plugins/yieldos/scripts/policy-manifest.js yieldOS/plugins/yieldos/scripts/policy-fetcher.js yieldOS/plugins/yieldos/tests/policy-manifest.test.js yieldOS/docs/07-policy.md
git commit -m "security: verify policy bundle integrity"
```

---

### Task 4: Runtime Credential Authorization Store

**Files:**
- Create: `yieldOS/plugins/yieldos/scripts/credential-auth.js`
- Modify: `yieldOS/plugins/yieldos/scripts/pre-install-gate.js`
- Modify: `yieldOS/plugins/yieldos/scripts/on-prompt-submit.js`
- Modify: `yieldOS/plugins/yieldos/scripts/self-defense.js`
- Modify: `yieldOS/plugins/yieldos/tests/credentials.test.js`
- Modify: `yieldOS/docs/06-architecture.md`

- [ ] **Step 1: Add credential auth tests**

Create or extend `yieldOS/plugins/yieldos/tests/credentials.test.js` with:

```js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  createCredentialChallenge,
  authorizeCredentialRead,
  isCredentialReadAuthorized
} = require("../scripts/credential-auth");

test("credential authorization is bound to project and target path", () => {
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "yieldos-auth-"));
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "yieldos-project-"));
  const otherProjectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "yieldos-other-project-"));
  const targetPath = path.join(projectRoot, ".env");

  const challenge = createCredentialChallenge({ runtimeRoot, projectRoot, targetPath, nowMs: 1000 });
  authorizeCredentialRead({
    runtimeRoot,
    projectRoot,
    targetPath,
    nonce: challenge.nonce,
    response: challenge.expectedResponse,
    nowMs: 2000
  });

  assert.equal(isCredentialReadAuthorized({ runtimeRoot, projectRoot, targetPath, nowMs: 3000 }), true);
  assert.equal(isCredentialReadAuthorized({ runtimeRoot, projectRoot: otherProjectRoot, targetPath, nowMs: 3000 }), false);
  assert.equal(isCredentialReadAuthorized({ runtimeRoot, projectRoot, targetPath: path.join(projectRoot, ".ssh", "id_rsa"), nowMs: 3000 }), false);
});

test("credential authorization expires", () => {
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "yieldos-auth-"));
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "yieldos-project-"));
  const targetPath = path.join(projectRoot, ".env");

  const challenge = createCredentialChallenge({ runtimeRoot, projectRoot, targetPath, nowMs: 1000 });
  authorizeCredentialRead({
    runtimeRoot,
    projectRoot,
    targetPath,
    nonce: challenge.nonce,
    response: challenge.expectedResponse,
    nowMs: 1000
  });

  assert.equal(isCredentialReadAuthorized({ runtimeRoot, projectRoot, targetPath, nowMs: 1000 + 29 * 60 * 1000 }), true);
  assert.equal(isCredentialReadAuthorized({ runtimeRoot, projectRoot, targetPath, nowMs: 1000 + 31 * 60 * 1000 }), false);
});
```

- [ ] **Step 2: Implement runtime store**

Create `yieldOS/plugins/yieldos/scripts/credential-auth.js`:

```js
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const TTL_MS = 30 * 60 * 1000;

function defaultRuntimeRoot() {
  return path.join(os.homedir(), ".cache", "yieldos", "credential-auth");
}

function hashValue(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function authFilePath({ runtimeRoot = defaultRuntimeRoot(), projectRoot, targetPath }) {
  const key = hashValue(`${path.resolve(projectRoot)}\n${path.resolve(targetPath)}`);
  return path.join(runtimeRoot, `${key}.json`);
}

function createCredentialChallenge({ runtimeRoot = defaultRuntimeRoot(), projectRoot, targetPath, nowMs = Date.now() }) {
  fs.mkdirSync(runtimeRoot, { recursive: true, mode: 0o700 });
  const nonce = crypto.randomBytes(6).toString("hex");
  const expectedResponse = `AUTORIZO yieldOS ${nonce}`;
  const challengePath = authFilePath({ runtimeRoot, projectRoot, targetPath });
  fs.writeFileSync(
    `${challengePath}.challenge`,
    JSON.stringify({
      nonce,
      project_hash: hashValue(path.resolve(projectRoot)),
      target_hash: hashValue(path.resolve(targetPath)),
      created_at: nowMs
    }, null, 2),
    { mode: 0o600 }
  );
  return { nonce, expectedResponse };
}

function authorizeCredentialRead({ runtimeRoot = defaultRuntimeRoot(), projectRoot, targetPath, nonce, response, nowMs = Date.now() }) {
  const expectedResponse = `AUTORIZO yieldOS ${nonce}`;
  if (response !== expectedResponse) {
    return { ok: false, reason: "credential authorization phrase mismatch" };
  }
  fs.mkdirSync(runtimeRoot, { recursive: true, mode: 0o700 });
  fs.writeFileSync(
    authFilePath({ runtimeRoot, projectRoot, targetPath }),
    JSON.stringify({
      project_hash: hashValue(path.resolve(projectRoot)),
      target_hash: hashValue(path.resolve(targetPath)),
      nonce_hash: hashValue(nonce),
      authorized_at: nowMs,
      expires_at: nowMs + TTL_MS
    }, null, 2),
    { mode: 0o600 }
  );
  return { ok: true };
}

function isCredentialReadAuthorized({ runtimeRoot = defaultRuntimeRoot(), projectRoot, targetPath, nowMs = Date.now() }) {
  const file = authFilePath({ runtimeRoot, projectRoot, targetPath });
  if (!fs.existsSync(file)) return false;
  const record = JSON.parse(fs.readFileSync(file, "utf8"));
  return record.project_hash === hashValue(path.resolve(projectRoot))
    && record.target_hash === hashValue(path.resolve(targetPath))
    && Number(record.expires_at) >= nowMs;
}

module.exports = {
  TTL_MS,
  createCredentialChallenge,
  authorizeCredentialRead,
  isCredentialReadAuthorized
};
```

- [ ] **Step 3: Wire pre-read gate through runtime auth**

In `pre-install-gate.js`, replace checks for `security/.yieldos-credentials-authorized` with:

```js
const { isCredentialReadAuthorized } = require("./credential-auth");

function credentialReadIsAllowed({ projectRoot, targetPath }) {
  return isCredentialReadAuthorized({ projectRoot, targetPath });
}
```

Fail closed when the target path differs from the authorized path.

- [ ] **Step 4: Wire prompt challenge flow**

In `on-prompt-submit.js`, when the user requests credential read authorization, generate a nonce challenge and require the exact nonce response. Do not accept the legacy static phrase as sufficient authorization.

- [ ] **Step 5: Protect legacy repo flag path**

In `self-defense.js`, deny agent writes to:

```text
security/.yieldos-credentials-authorized
```

The denial message should say the file is obsolete and credential authorization is stored in the user runtime cache.

- [ ] **Step 6: Run credential tests**

Run:

```bash
node --test yieldOS/plugins/yieldos/tests/credentials.test.js
npm run test:plugin
```

Expected: credential tests pass and plugin tests pass.

- [ ] **Step 7: Commit**

```bash
git add yieldOS/plugins/yieldos/scripts/credential-auth.js yieldOS/plugins/yieldos/scripts/pre-install-gate.js yieldOS/plugins/yieldos/scripts/on-prompt-submit.js yieldOS/plugins/yieldos/scripts/self-defense.js yieldOS/plugins/yieldos/tests/credentials.test.js yieldOS/docs/06-architecture.md
git commit -m "security: move credential authorization outside the repo"
```

---

### Task 5: Structured Audit Event Contract

**Files:**
- Create: `yieldOS/plugins/yieldos/scripts/audit-events.js`
- Modify: `yieldOS/plugins/yieldos/scripts/logger.js`
- Create: `yieldOS/plugins/yieldos/tests/audit-events.test.js`
- Modify: `yieldOS/docs/06-architecture.md`
- Modify: `README.md`

- [ ] **Step 1: Add audit event tests**

Create `yieldOS/plugins/yieldos/tests/audit-events.test.js`:

```js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { appendAuditEvent, redactEventPayload } = require("../scripts/audit-events");

test("appendAuditEvent writes sequenced hash chained JSONL", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "yieldos-audit-"));
  const first = appendAuditEvent({
    projectRoot: root,
    eventType: "policy.decision",
    decision: "block",
    subject: { kind: "package", name: "evil-package" },
    payload: { command: "npm install evil-package" },
    now: "2026-05-10T00:00:00.000Z"
  });
  const second = appendAuditEvent({
    projectRoot: root,
    eventType: "policy.decision",
    decision: "allow",
    subject: { kind: "package", name: "safe-package" },
    payload: { command: "npm install safe-package" },
    now: "2026-05-10T00:00:01.000Z"
  });

  assert.equal(first.sequence, 1);
  assert.equal(second.sequence, 2);
  assert.equal(second.prev_hash, first.event_hash);

  const lines = fs.readFileSync(path.join(root, "security", "yieldos-events.jsonl"), "utf8").trim().split("\n");
  assert.equal(lines.length, 2);
  assert.equal(JSON.parse(lines[1]).prev_hash, first.event_hash);
});

test("redactEventPayload removes secrets from structured events", () => {
  const redacted = redactEventPayload({
    command: "curl -H 'Authorization: Bearer sk-test-secret' https://example.com",
    env: "DATABASE_URL=postgres://user:pass@example/db"
  });

  assert.equal(JSON.stringify(redacted).includes("sk-test-secret"), false);
  assert.equal(JSON.stringify(redacted).includes("postgres://user:pass"), false);
});
```

- [ ] **Step 2: Implement audit event writer**

Create `yieldOS/plugins/yieldos/scripts/audit-events.js`:

```js
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function redactString(value) {
  return value
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "sk-[REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [REDACTED]")
    .replace(/postgres:\/\/[^@\s]+@/g, "postgres://[REDACTED]@");
}

function redactEventPayload(value) {
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map(redactEventPayload);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, redactEventPayload(nested)])
    );
  }
  return value;
}

function hashEvent(event) {
  const stable = JSON.stringify({ ...event, event_hash: undefined });
  return crypto.createHash("sha256").update(stable).digest("hex");
}

function readPreviousEvent(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const lines = fs.readFileSync(filePath, "utf8").trim().split("\n").filter(Boolean);
  if (lines.length === 0) return null;
  return JSON.parse(lines[lines.length - 1]);
}

function appendAuditEvent({ projectRoot, eventType, decision, subject, payload, now = new Date().toISOString() }) {
  const securityDir = path.join(projectRoot, "security");
  fs.mkdirSync(securityDir, { recursive: true });
  const filePath = path.join(securityDir, "yieldos-events.jsonl");
  const previous = readPreviousEvent(filePath);
  const event = {
    schema_version: 1,
    event_id: crypto.randomUUID(),
    sequence: previous ? previous.sequence + 1 : 1,
    timestamp: now,
    event_type: eventType,
    decision,
    subject: redactEventPayload(subject),
    payload: redactEventPayload(payload),
    prev_hash: previous ? previous.event_hash : null,
    event_hash: null
  };
  event.event_hash = hashEvent(event);
  fs.appendFileSync(filePath, `${JSON.stringify(event)}\n`, { mode: 0o600 });
  return event;
}

module.exports = {
  appendAuditEvent,
  redactEventPayload
};
```

- [ ] **Step 3: Integrate with logger**

In `logger.js`, keep the existing markdown log for human readability, then call:

```js
const { appendAuditEvent } = require("./audit-events");

appendAuditEvent({
  projectRoot,
  eventType: "hook.decision",
  decision,
  subject,
  payload
});
```

Do not duplicate redaction logic in `logger.js`; use `redactEventPayload`.

- [ ] **Step 4: Run audit event tests**

Run:

```bash
node --test yieldOS/plugins/yieldos/tests/audit-events.test.js
npm run test:plugin
```

Expected: tests pass and no secret-like values appear in `security/yieldos-events.jsonl`.

- [ ] **Step 5: Commit**

```bash
git add yieldOS/plugins/yieldos/scripts/audit-events.js yieldOS/plugins/yieldos/scripts/logger.js yieldOS/plugins/yieldos/tests/audit-events.test.js yieldOS/docs/06-architecture.md README.md
git commit -m "feat: add structured yieldOS audit events"
```

---

### Task 6: Enterprise Evidence Pipeline

**Files:**
- Create: `scripts/evidence-verify.mjs`
- Create: `scripts/evidence-verify.test.mjs`
- Modify: `package.json`
- Modify: `benchmarks/README.md`
- Create: `benchmarks/internal/README.md`
- Modify: `scripts/benchmark-visual-dashboard.mjs`
- Modify: `README.md`

- [ ] **Step 1: Add evidence verifier tests**

Create `scripts/evidence-verify.test.mjs`:

```js
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { classifyEvidenceFile } from "./evidence-verify.mjs";

test("classifyEvidenceFile rejects local-review files for public proof", async () => {
  const dir = await mkdtemp(join(tmpdir(), "yieldos-evidence-"));
  const file = join(dir, "report-local-review-2026-05-10.json");
  await writeFile(file, JSON.stringify({ measurement_type: "local-review" }));

  const result = await classifyEvidenceFile(file);

  assert.equal(result.publicProof, false);
  assert.equal(result.reason, "local-review evidence is internal only");
});

test("classifyEvidenceFile accepts clean measured evidence", async () => {
  const dir = await mkdtemp(join(tmpdir(), "yieldos-evidence-"));
  const file = join(dir, "report-clean.json");
  await writeFile(file, JSON.stringify({
    measurement_type: "measured",
    checkout_dirty: false,
    source_commit: "0123456789abcdef0123456789abcdef01234567"
  }));

  const result = await classifyEvidenceFile(file);

  assert.equal(result.publicProof, true);
});
```

- [ ] **Step 2: Implement evidence verifier**

Create `scripts/evidence-verify.mjs`:

```js
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export async function classifyEvidenceFile(filePath) {
  const text = await readFile(filePath, "utf8");
  const parsed = JSON.parse(text);
  const name = filePath.split("/").pop();

  if (name.includes("local-review") || parsed.measurement_type === "local-review") {
    return { filePath, publicProof: false, reason: "local-review evidence is internal only" };
  }
  if (parsed.checkout_dirty === true) {
    return { filePath, publicProof: false, reason: "dirty checkout evidence is internal only" };
  }
  if (parsed.measurement_type !== "measured") {
    return { filePath, publicProof: false, reason: "evidence is not measured" };
  }
  if (!/^[a-f0-9]{40}$/.test(parsed.source_commit || "")) {
    return { filePath, publicProof: false, reason: "missing source commit" };
  }
  return { filePath, publicProof: true, reason: "measured clean evidence" };
}

async function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    throw new Error("usage: node scripts/evidence-verify.mjs <report.json>...");
  }
  const results = [];
  for (const file of files) {
    results.push(await classifyEvidenceFile(file));
  }
  const rejected = results.filter((result) => !result.publicProof);
  for (const result of results) {
    console.log(`${result.publicProof ? "PUBLIC" : "INTERNAL"} ${result.filePath} - ${result.reason}`);
  }
  if (rejected.length > 0) {
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
```

- [ ] **Step 3: Add scripts**

In `package.json`, add:

```json
{
  "scripts": {
    "evidence:verify": "node scripts/evidence-verify.mjs"
  }
}
```

Preserve existing script order around benchmark scripts.

- [ ] **Step 4: Document evidence taxonomy**

In `benchmarks/README.md`, define:

```markdown
## Evidence Classes

- Public proof: measured report from a clean checkout, pinned commit, deterministic command, and complete raw artifact.
- Internal review: local-review report, dirty checkout report, assumption-based model, or report generated during claim exploration.
- Not claimed: external provider billing savings, whole-repo vulnerability discovery, or universal cross-agent prevention unless a public-proof artifact exists.
```

Create `benchmarks/internal/README.md`:

```markdown
# Internal Benchmark Artifacts

Reports in this directory can guide product decisions but are not public proof. Files belong here when they are generated from a dirty checkout, contain `local-review` in the filename, rely on assumption-based costs, or use anonymized peer-repo context that has not been cleared for publication.
```

- [ ] **Step 5: Verify current artifact classification**

Run:

```bash
node --test scripts/evidence-verify.test.mjs
node scripts/evidence-verify.mjs benchmarks/*.json
```

Expected: local-review files are rejected as public proof. Use the output to decide which files move to `benchmarks/internal/`.

- [ ] **Step 6: Commit**

```bash
git add scripts/evidence-verify.mjs scripts/evidence-verify.test.mjs package.json benchmarks/README.md benchmarks/internal/README.md scripts/benchmark-visual-dashboard.mjs README.md
git commit -m "test: classify benchmark evidence for enterprise claims"
```

---

### Task 7: Provider Egress Controls For Model Workflows

**Files:**
- Create: `scripts/provider-egress.js`
- Create: `scripts/provider-egress.test.mjs`
- Modify: `scripts/model-workflow-benchmark.mjs`
- Modify: `scripts/peer-repo-repair/repair-agent.mjs`
- Modify: `scripts/peer-repo-repair/redaction.mjs`
- Modify: `benchmarks/README.md`
- Modify: `yieldOS/docs/enterprise-boundaries.md`

- [ ] **Step 1: Add provider egress tests**

Create `scripts/provider-egress.test.mjs`:

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { assertProviderEgressAllowed, summarizeProviderEgress } from "./provider-egress.js";

test("assertProviderEgressAllowed blocks by default", () => {
  assert.throws(
    () => assertProviderEgressAllowed({ env: {}, provider: "anthropic", purpose: "peer-repair" }),
    /provider egress is disabled/
  );
});

test("assertProviderEgressAllowed allows explicit opt in", () => {
  assert.doesNotThrow(() => assertProviderEgressAllowed({
    env: { YIELDOS_ALLOW_PROVIDER_EGRESS: "1" },
    provider: "anthropic",
    purpose: "peer-repair"
  }));
});

test("summarizeProviderEgress records provider and purpose", () => {
  assert.deepEqual(summarizeProviderEgress({
    provider: "anthropic",
    purpose: "peer-repair",
    model: "claude-sonnet-4-5"
  }), {
    provider: "anthropic",
    purpose: "peer-repair",
    model: "claude-sonnet-4-5",
    repo_content_sent: true
  });
});
```

- [ ] **Step 2: Implement provider egress helper**

Create `scripts/provider-egress.js`:

```js
export function assertProviderEgressAllowed({ env = process.env, provider, purpose }) {
  if (env.YIELDOS_ALLOW_PROVIDER_EGRESS === "1") {
    return;
  }
  throw new Error(`provider egress is disabled for ${provider}:${purpose}; set YIELDOS_ALLOW_PROVIDER_EGRESS=1 after confirming repo data may leave this machine`);
}

export function summarizeProviderEgress({ provider, purpose, model }) {
  return {
    provider,
    purpose,
    model,
    repo_content_sent: true
  };
}
```

- [ ] **Step 3: Gate model-backed scripts**

In `scripts/model-workflow-benchmark.mjs` and `scripts/peer-repo-repair/repair-agent.mjs`, call:

```js
import { assertProviderEgressAllowed, summarizeProviderEgress } from "./provider-egress.js";

assertProviderEgressAllowed({
  provider: "anthropic",
  purpose: "peer-repo-repair"
});
```

For files under `scripts/peer-repo-repair/`, use the correct relative import:

```js
import { assertProviderEgressAllowed, summarizeProviderEgress } from "../provider-egress.js";
```

Add the summary object to generated benchmark reports.

- [ ] **Step 4: Verify egress gate**

Run:

```bash
node --test scripts/provider-egress.test.mjs
npm run benchmark:peer-repair
YIELDOS_ALLOW_PROVIDER_EGRESS=1 npm run benchmark:peer-repair -- --dry-run
```

Expected: first benchmark command fails before provider calls with the explicit egress error; dry-run with opt-in succeeds without sending live provider traffic if the script supports dry-run.

- [ ] **Step 5: Commit**

```bash
git add scripts/provider-egress.js scripts/provider-egress.test.mjs scripts/model-workflow-benchmark.mjs scripts/peer-repo-repair/repair-agent.mjs scripts/peer-repo-repair/redaction.mjs benchmarks/README.md yieldOS/docs/enterprise-boundaries.md
git commit -m "security: require explicit provider egress opt in"
```

---

### Task 8: Runtime Module Decomposition

**Files:**
- Modify: `yieldOS/plugins/yieldos/scripts/pre-install-gate.js`
- Create: `yieldOS/plugins/yieldos/scripts/gates/credential-read-gate.js`
- Create: `yieldOS/plugins/yieldos/scripts/gates/dependency-command-gate.js`
- Create: `yieldOS/plugins/yieldos/scripts/gates/instruction-file-gate.js`
- Create: `yieldOS/plugins/yieldos/scripts/gates/code-audit-gate.js`
- Modify: `yieldOS/plugins/yieldos/scripts/code-audit/red-team.js`
- Create: `yieldOS/plugins/yieldos/scripts/code-audit/rules/injection.js`
- Create: `yieldOS/plugins/yieldos/scripts/code-audit/rules/authz.js`
- Create: `yieldOS/plugins/yieldos/scripts/code-audit/rules/egress.js`
- Create: `yieldOS/plugins/yieldos/scripts/code-audit/rules/secrets.js`
- Modify: `yieldOS/plugins/yieldos/tests/code-audit.test.js`

- [ ] **Step 1: Snapshot current module sizes**

Run:

```bash
wc -l yieldOS/plugins/yieldos/scripts/pre-install-gate.js yieldOS/plugins/yieldos/scripts/code-audit/red-team.js yieldOS/plugins/yieldos/scripts/agent-pack-command.js scripts/model-workflow-benchmark.mjs scripts/real-repo-benchmark.mjs
```

Expected: several files exceed 300 lines.

- [ ] **Step 2: Extract gate functions without changing decisions**

Create focused gate files that export one function each:

```js
function decideCredentialRead(input) {
  return input.isCredentialPath && !input.isAuthorized
    ? { decision: "block", reason: "credential read requires runtime authorization" }
    : { decision: "pass" };
}

module.exports = { decideCredentialRead };
```

Use the same shape for dependency command, instruction file, and code audit gates:

```js
{
  decision: "pass" | "allow" | "block" | "review",
  reason: string
}
```

Only extract existing business logic. Do not introduce a base class, registry framework, or plugin system.

- [ ] **Step 3: Keep `pre-install-gate.js` as orchestration**

After extraction, `pre-install-gate.js` should read hook input, call focused gates in current priority order, log the first terminal decision, and return the existing exit codes. Target size: under 300 lines.

- [ ] **Step 4: Split red-team rules by risk family**

Move existing regex and line-diff logic into rule family files. Each file exports:

```js
function detectSecrets(change) {
  return [];
}

module.exports = { detectSecrets };
```

The first pass should preserve existing behavior. Add new AST or Semgrep-style detection only in a separate follow-up after the split is passing.

- [ ] **Step 5: Run regression tests**

Run:

```bash
npm run test:plugin
node --test yieldOS/plugins/yieldos/tests/code-audit.test.js
node scripts/plugin-check.mjs
```

Expected: no decision output changes except file path references in stack traces.

- [ ] **Step 6: Commit**

```bash
git add yieldOS/plugins/yieldos/scripts/pre-install-gate.js yieldOS/plugins/yieldos/scripts/gates yieldOS/plugins/yieldos/scripts/code-audit/red-team.js yieldOS/plugins/yieldos/scripts/code-audit/rules yieldOS/plugins/yieldos/tests/code-audit.test.js
git commit -m "refactor: split hook gates into focused modules"
```

---

### Task 9: Enterprise Governance And CI Controls

**Files:**
- Create: `.github/CODEOWNERS`
- Create: `.github/dependabot.yml`
- Create: `.github/workflows/security.yml`
- Create: `SECURITY.md`
- Create: `SUPPORT.md`
- Create: `CONTRIBUTING.md`
- Modify: `.github/workflows/plugin.yml`
- Modify: `.github/workflows/release.yml`
- Modify: `README.md`

- [ ] **Step 1: Add ownership**

Create `.github/CODEOWNERS`:

```text
# Runtime enforcement and policy changes require security owner review.
/yieldOS/plugins/yieldos/scripts/ @yieldos/security
/yieldOS/plugins/yieldos/hooks.json @yieldos/security
/policy/ @yieldos/security
/install.sh @yieldos/security
/.github/workflows/ @yieldos/platform
/landing/ @yieldos/product
/benchmarks/ @yieldos/research
```

- [ ] **Step 2: Add supported versions and disclosure policy**

Create `SECURITY.md`:

```markdown
# Security Policy

## Supported Versions

yieldOS supports the latest stable plugin release and the current preview release. Historical event builds are unsupported.

## Reporting A Vulnerability

Email security@yieldos.dev with the affected version, operating system, reproduction steps, and whether the issue can expose credentials, bypass a block, tamper with policy, or forge audit evidence.

We acknowledge reports within 3 business days and provide a remediation target after triage.
```

Create `SUPPORT.md`:

```markdown
# Support

The enforced runtime adapter is Claude Code. Other agent packs are guidance unless their documentation says enforcement is available.

Supported local runtimes:

- macOS and Linux with Node.js 18 or newer.
- Claude Code plugin runtime compatible with the packaged plugin manifest.

Windows support is validated in CI for plugin unit tests. Shell installer support is limited to POSIX shells.
```

Create `CONTRIBUTING.md`:

````markdown
# Contributing

Keep enforcement logic small and test-backed. Business decisions belong in focused services under `yieldOS/plugins/yieldos/scripts/`; hook entrypoints should orchestrate.

Before opening a pull request, run:

```bash
npm test
node scripts/plugin-check.mjs
node scripts/policy-check.mjs
git diff --check
```

Changes to policy, credentials, release, installer, or audit logging require security review.
````

- [ ] **Step 3: Add dependency update policy**

Create `.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    open-pull-requests-limit: 5
  - package-ecosystem: npm
    directory: /landing
    schedule:
      interval: weekly
    open-pull-requests-limit: 5
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
    open-pull-requests-limit: 5
```

- [ ] **Step 4: Add security workflow**

Create `.github/workflows/security.yml`:

```yaml
name: Security

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read
  security-events: write

jobs:
  codeql:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: github/codeql-action/init@v3
        with:
          languages: javascript-typescript
      - uses: github/codeql-action/analyze@v3

  secret-patterns:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: node scripts/secret-scan-smoke.mjs
```

Add `scripts/secret-scan-smoke.mjs` only if no existing secret smoke scanner exists. It should scan tracked files from `git ls-files` and fail on obvious test-key patterns except approved fixtures.

- [ ] **Step 5: Verify governance checks**

Run:

```bash
npm test
node scripts/plugin-check.mjs
node scripts/policy-check.mjs
git diff --check
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add .github/CODEOWNERS .github/dependabot.yml .github/workflows/security.yml SECURITY.md SUPPORT.md CONTRIBUTING.md .github/workflows/plugin.yml .github/workflows/release.yml README.md
git commit -m "chore: add enterprise governance and security checks"
```

---

### Task 10: Enterprise Boundary Matrix

**Files:**
- Create: `yieldOS/docs/enterprise-boundaries.md`
- Modify: `README.md`
- Modify: `landing/src/app/page.tsx`
- Modify: `landing/src/components/agent-pack-builder.tsx`

- [ ] **Step 1: Create boundary matrix**

Create `yieldOS/docs/enterprise-boundaries.md`:

```markdown
# Enterprise Boundaries

## Enforcement Levels

| Surface | Current level | What yieldOS can claim | What yieldOS must not claim |
| --- | --- | --- | --- |
| Claude Code plugin hooks | Enforced | Pre-action and post-action gates for configured Claude Code tools | Universal prevention outside the Claude Code plugin runtime |
| Dependency policy | Enforced for monitored install commands | Blocks denylisted, untrusted, and review-required package actions before execution | Complete registry malware detection |
| Credential reads | Enforced for monitored read/tool paths | Blocks configured credential paths unless runtime authorization is active | Protection from unmonitored shell commands or user-driven manual reads |
| Code audit commit/push gate | Enforced for configured git actions | Blocks covered unsafe diffs before commit or push | Whole-repo SAST or complete taint analysis |
| Oracle contracts | Scoped proof | Verifies selected behaviors through executable contracts | Proof that the entire application is secure |
| Other agent packs | Advisory unless adapter says enforced | Provides policy guidance and instructions | Hard blocking across unsupported agents |
| Provider-backed repair workflows | Optional, explicit egress | Can send redacted context after opt-in | Offline-only operation when provider mode is enabled |

## Data Flows

- Local hook decisions stay on the machine.
- Policy fetch reads signed or pinned public policy bundles.
- Provider repair workflows require explicit egress opt-in and record provider, model, purpose, and redaction summary.
- Audit events are written locally unless the user configures export.
```

- [ ] **Step 2: Link boundaries from public docs**

Add this line to `README.md`:

```markdown
For supported adapters, data flows, and claim boundaries, see `yieldOS/docs/enterprise-boundaries.md`.
```

- [ ] **Step 3: Align landing copy**

Replace universal claims such as "blocks malicious packages" or "blocks unsafe code changes" with:

```text
Blocks policy-covered risky agent actions before sensitive steps, verifies selected fixes with scoped oracle contracts, and escalates uncovered cases instead of trusting model self-review.
```

- [ ] **Step 4: Verify copy boundary**

Run:

```bash
rg -n "universal|all vulnerabilities|malicious packages|unsafe code changes|billing savings|all agents|whole-repo" README.md landing yieldOS/docs
```

Expected: any match is either in the boundary matrix as a "must not claim" or in an archive.

- [ ] **Step 5: Commit**

```bash
git add yieldOS/docs/enterprise-boundaries.md README.md landing/src/app/page.tsx landing/src/components/agent-pack-builder.tsx
git commit -m "docs: define enterprise enforcement boundaries"
```

---

## Execution Order

Use this order:

1. Task 1 - identity and public docs cleanup.
2. Task 10 - enterprise boundary matrix and copy cleanup.
3. Task 4 - credential authorization store.
4. Task 3 - policy bundle integrity.
5. Task 2 - release and installer trust chain.
6. Task 5 - structured audit event contract.
7. Task 7 - provider egress controls.
8. Task 6 - enterprise evidence pipeline.
9. Task 9 - governance and CI controls.
10. Task 8 - runtime module decomposition.

Reasoning: public claims should be corrected before deeper engineering expands the surface. Credential and policy integrity are higher risk than benchmark polish. Refactors come last so they do not destabilize security fixes.

## Release Gate After All Tasks

Run the full enterprise gate:

```bash
npm test
npm run test:plugin
node scripts/plugin-check.mjs
node scripts/policy-check.mjs
node scripts/evidence-verify.mjs benchmarks/*.json
npm run package:plugin
git diff --check
```

Expected:

- Tests pass.
- Plugin package check passes.
- Policy manifest check passes.
- Evidence verifier rejects internal-only artifacts and accepts only clean measured evidence.
- Package build passes.
- Whitespace check passes.

## Professional Product Bar

This plan is complete when a skeptical enterprise security engineer can answer yes to these questions:

1. Can I install from a pinned release and verify what I am executing?
2. Can I tell which policy bundle was used and whether it was tampered with?
3. Can an agent forge credential authorization by writing a repo file?
4. Can I export or inspect machine-readable audit events?
5. Can I separate measured proof from internal or assumption-based evidence?
6. Can I see exactly which agent surfaces are enforced and which are advisory?
7. Can I review ownership, support, disclosure, and dependency update policy?
8. Can I extend the runtime gate without editing a 500-line decision script?

If any answer is no, the product is still not enterprise-grade.
