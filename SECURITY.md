# Security Policy

yieldOS is a security product, so reports about bypasses, unsafe defaults, policy compromise, secret exposure, or release integrity are treated as security reports.

## Supported Versions

Only the current `main` branch and published `yieldos--v*` release line are supported for security fixes. Older hackathon snapshots and local benchmark artifacts are not supported release channels.

## Reporting a Vulnerability

Use GitHub private vulnerability reporting or a private maintainer channel. Do not open a public issue for suspected vulnerabilities.

Include:

- affected version, commit, or release tag;
- the exact command, hook input, or policy bundle involved;
- expected decision and actual decision;
- whether credentials, protected evidence, or third-party provider egress were exposed;
- a minimal reproduction that avoids real secrets.

## Triage Expectations

Maintainers should acknowledge credible reports within two business days, assign a severity, and decide whether the fix requires a policy update, plugin release, documentation change, or disclosure note.

## Out of Scope

Please do not submit reports that require destructive testing, access to third-party accounts, live exfiltration of secrets, or denial-of-service against public infrastructure. Use controlled reproductions instead.
