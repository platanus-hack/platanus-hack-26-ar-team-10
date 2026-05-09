# yieldOS Policy Schema

Status: human-readable contract
Last updated: 2026-05-09

This file documents the current shape of `/policy` and the fields yieldOS should require before adding more third-party skills, MCPs, rules, or playbooks. It is not a JSON Schema validator yet.

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
evidence:
  pack_lock: yield.agent-pack.lock.json
```

Rules:

- Pack entries must reference `policy/` keys or reviewed yieldOS playbooks.
- Packs may generate `AGENTS.md`, `CLAUDE.md`, Cursor rules, GitHub Copilot instructions, Windsurf rules, skills, reports, and lockfiles.
- Packs must not silently install unreviewed skills or MCPs.
- Runtime enforcement strength must be explicit per target agent.
- Generated outputs should be previewed before writing and tracked by a pack lock.
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
