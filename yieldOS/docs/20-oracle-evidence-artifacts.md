# Oracle Evidence Artifacts

Oracle artifacts are generated evidence. They live under `security/oracles/<oracle-id>/` and are referenced by hash from `security/code-audit-state.json`.

This split prevents self-pollution:

- source diff hashes represent application/source changes,
- oracle artifacts hold proof material,
- CI verifies artifact hashes separately,
- a modified artifact invalidates the audit state.

## Files

Supported artifact files are:

- `manifest.json`
- `contract.json`
- `replay.json`
- `baseline-result.json`
- `fixed-result.json`
- `proof-manifest.json`

All artifact writes must stay under `security/oracles/<id>/`, reject traversal, reject symlink traversal, redact secret-like strings, and cap output. For push/PR verification, referenced artifacts must be committed; working-tree-only artifacts do not satisfy acceptance.

## Limits

- Single evidence string: 2 KB.
- Single oracle result JSON: 16 KB.
- Proof manifest: 64 KB.

Larger outputs are summarized and hashed.
