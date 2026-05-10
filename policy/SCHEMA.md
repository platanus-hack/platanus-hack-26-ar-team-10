# yieldOS Policy Schema

Status: validated policy contract
Last updated: 2026-05-10

This file documents the current shape of `/policy` and the fields yieldOS requires before adding more third-party packages, skills, MCPs, rules, or playbooks. `scripts/policy-check.mjs` is the executable validator.

## Common Shape

Most policy files use:

```json
{
  "version": "0.4.0",
  "updated_at": "2026-05-09T05:30:00Z",
  "description": "...",
  "entries": [],
  "rules": {}
}
```

Rules:

- `version` must change when policy decisions change.
- `updated_at` should be UTC ISO-8601.
- `description` explains what is being governed, not product marketing.
- `entries` should be reviewable without reading chat history.
- `rules.default_unlisted` must be explicit when unlisted items are security-relevant.

## Policy Integrity

`manifest.json` is generated, not hand-authored. It records the raw-byte SHA-256 for every runtime policy file listed in `config/defaults.json`. The installed plugin pins the manifest hash in `policy.manifest_sha256` and rejects online, runtime-cache, or shipped-cache bundles that drift from that manifest.

Policy changes must run:

```bash
node scripts/generate-policy-manifest.mjs
node scripts/policy-check.mjs
```

The generator updates `policy/version.json.hash`, syncs `yieldOS/plugins/yieldos/policy-cache/`, writes both manifest copies, and updates the plugin default manifest pin.

## Package Allowlist

Current file: `allowlist.json`

Allowlist entries approve a package under a documented scope. They are not absolute approvals: denylist, native-equivalent rules, registry existence checks, and analyzers still run with denylist precedence.

Pinned entry:

```json
{
  "key": "npm:react@18.3.1",
  "category": "framework",
  "decision": "allow",
  "reviewed_by": "yieldos-maintainers",
  "reviewed_at": "2026-05-10",
  "rationale": "Pinned framework dependency approved for the baseline dependency gate.",
  "source_urls": ["https://www.npmjs.com/package/react/v/18.3.1"]
}
```

Name-only entry:

```json
{
  "key": "npm:typescript",
  "category": "compiler",
  "decision": "allow",
  "allow_any_version": true,
  "reviewed_by": "yieldos-maintainers",
  "reviewed_at": "2026-05-10",
  "rationale": "Name-only compiler dependency approved for the baseline dependency gate; concrete versions still go through registry existence checks and analyzers."
}
```

Rules:

- `decision` must be `allow`.
- Name-only entries require `allow_any_version: true` and a rationale.
- Pinned entries must not set `allow_any_version: true`.
- Allowlist entries must not conflict with denylist entries.

## Package Denylist

Current file: `denylist.json`

Denylist entries block known malicious, sabotaged, protestware, typosquatted, or otherwise unsafe packages. Denylist wins before native-equivalent and allowlist logic.

```json
{
  "key": "npm:event-stream@3.3.6",
  "decision": "deny",
  "reason": "supply-chain attack 2018",
  "severity": "critical",
  "reviewed_by": "yieldos-maintainers",
  "reviewed_at": "2026-05-10",
  "source_urls": ["https://osv.dev/vulnerability/GHSA-mh6f-8j2x-4483"]
}
```

Rules:

- `decision` must be `deny`.
- `reason`, `severity`, `reviewed_by`, `reviewed_at`, and `source_urls` are required.
- `severity` must be `critical`, `high`, `medium`, or `low`.
- Denylist entries must not conflict with allowlist entries.

## Skills

Current file: `skills.json`

Current entries allow:

```json
{
  "key": "skill:dependency-gate",
  "category": "self",
  "vendor": "yieldos",
  "purpose": "yieldOS itself"
}
```

Future third-party entries should add:

```json
{
  "key": "skill:<name>@<sha256-of-SKILL.md>",
  "category": "third-party",
  "vendor": "<vendor-or-github-owner>",
  "purpose": "<specific workflow>",
  "source_url": "<repository-or-doc-url>",
  "install_source": "<github-url-or-registry>",
  "content_sha256": "<sha256-of-SKILL.md>",
  "permission_scope": "read-only | scoped-write | network | privileged",
  "last_verified": "YYYY-MM-DD"
}
```

Review requirements:

- Third-party skills should be pinned by content hash before broad allowlisting.
- Skills with scripts must disclose what each script can execute.
- Skills that request network, secrets, production, database, or git-write access need an explicit permission scope.
- A skill that is useful but too broad should become a yieldOS-native playbook instead of an allowlisted install.

## MCP Servers

Current file: `mcps.json`

Current entries allow:

```json
{
  "key": "mcp:filesystem",
  "vendor": "modelcontextprotocol",
  "purpose": "read/list filesystem within a sandboxed root",
  "approved_tools": ["read_file", "list_directory", "search_files"],
  "denied_tools": ["write_file", "delete_file", "move_file"],
  "scope": "read-only"
}
```

Future entries should add:

```json
{
  "key": "mcp:<name>@<source-or-binary-hash>",
  "vendor": "<vendor-or-github-owner>",
  "purpose": "<specific tool use>",
  "transport": "stdio | sse | streamable-http",
  "source_url": "<repository-or-doc-url>",
  "binary_sha256": "<sha256-when-local-binary>",
  "approved_tools": [],
  "denied_tools": [],
  "env_required": [],
  "network_allowlist": [],
  "scope": "read-only | scoped-write | network | privileged",
  "last_verified": "YYYY-MM-DD"
}
```

Review requirements:

- Tool surface validation is mandatory. Extra tools mean block.
- Stdio MCPs execute local commands and should be treated as higher risk than pure remote read APIs.
- MCP configs must not embed secrets. Use environment variable names only.
- Read-only should be the default; write tools require a named reason.

## Curation Outcomes

Policy review should end in exactly one outcome:

- `allow`: safe enough under the documented scope.
- `deny`: known bad, unsafe, malicious, or too much blast radius.
- `defer`: not enough evidence yet.
- `require_hash`: useful but must be content-pinned first.
- `restrict_tools`: useful only with a smaller tool surface.
- `native_equivalent`: replace with a yieldOS-native playbook or built-in capability.

## Agent Packs

Current manifest pattern: `yield.agent-pack.yaml`

Agent packs package approved profiles, skills, MCPs, guidelines, and reviewed playbooks into native output files for target agents. They are deployment manifests, not independent policy authorities.

Minimum shape:

```yaml
version: 0.1
kind: yield.agent-pack
name: company-safe-defaults
profiles:
  - non-technical-safe
  - secrets-safe
  - dependency-safe
agents:
  claude-code:
    enabled: true
    outputs:
      - AGENTS.md
      - CLAUDE.md
skills:
  allow:
    - key: skill:dependency-gate
      source: policy/skills.json
mcps:
  allow:
    - key: mcp:filesystem
      approved_tools:
        - read_file
        - list_directory
        - search_files
playbooks:
  include:
    - security-audit
    - skill-review
    - mcp-review
oracles:
  include:
    - code-audit-state
    - agent-pack-lock
    - instruction-policy
    - project-tests
    - cdsc-proof
evidence:
  pack_lock: yield.agent-pack.lock.json
```

Rules:

- Pack entries must reference `policy/` keys or reviewed yieldOS playbooks.
- Packs may generate `AGENTS.md`, `CLAUDE.md`, Cursor rules, GitHub Copilot instructions, Windsurf rules, skills, reports, and lockfiles.
- Packs must not silently install unreviewed skills or MCPs.
- Packs may declare approved oracles, but they do not execute them by themselves.
- `oracles.include` must reference reviewed yieldOS oracle IDs only.
- The pack lock records oracle IDs and registry version; it does not prove those oracles ran.
- Runtime enforcement strength must be explicit per target agent.
- Generated outputs should be previewed before writing, tracked by a pack lock, and verified against that lock metadata plus file hashes when the files are active in the repo.
- Vector retrieval can recommend pack entries, but reviewed manifest entries decide what becomes active.

## Retrieval Boundary

A vector database can suggest prior decisions, but it must not write policy by itself.

Allowed retrieval inputs:

- finding family
- language and framework
- source/control/sink tuple
- validation method
- fix pattern
- policy key
- public source URL

Disallowed retrieval inputs:

- credentials
- raw transcripts
- private customer code
- full terminal logs
- dependency tarballs
- unredacted `.env` values
