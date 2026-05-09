# yieldOS

<img src="./project-logo.png" alt="yieldOS logo" width="200" />

Track: AI Security

yieldOS is a Claude Code security plugin that gates the risky things AI agents do before they happen: dependency installs, skill/plugin/MCP additions, vendored code, remote bootstrap commands, and instruction-file edits.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/platanus-hack/platanus-hack-26-ar-team-10/main/install.sh | sh
```

Manual install:

```bash
claude plugins marketplace add platanus-hack/platanus-hack-26-ar-team-10
claude plugins install yieldos@yieldos
```

## Update

Once installed, update yieldOS from Claude Code with:

```text
/yieldos:update
```

Or from a terminal:

```bash
claude plugins marketplace update yieldos
claude plugins update yieldos@yieldos
```

Run `/reload-plugins` or restart Claude Code after updating so hooks switch to the new cached version.

Maintainers publish a new plugin version from the repository root with:

```bash
node scripts/release.mjs bump patch --note "Describe the change"
node scripts/plugin-check.mjs
(cd yieldOS/plugins/yieldos && node --test tests/*.test.js)
git add .
git commit -m "Release yieldOS vX.Y.Z"
git tag yieldos--vX.Y.Z
git push origin main yieldos--vX.Y.Z
```

Claude Code uses the plugin version in `plugin.json` and the marketplace manifests to decide whether `/plugin update` has something new to install, so every release must bump those files together.

Reload or restart Claude Code after installing. The plugin is declared from this repository's root marketplace manifest and lives at:

```text
yieldOS/plugins/yieldos
```

## Validate Locally

```bash
sh install.sh --dry-run
claude plugins validate .
claude plugins validate yieldOS/plugins/yieldos

cd yieldOS/plugins/yieldos
node --test tests/*.test.js
```

Requires Claude Code with plugin support and Node.js 18+.

## Team

- Ignacio Estevo ([@NachoEstevo](https://github.com/NachoEstevo))
- Sebastian Buffo Sempe ([@sbuffose](https://github.com/sbuffose))
- Franco Ferreira ([@frxnnk](https://github.com/frxnnk))
- Mauro Proto Cassina ([@MauroProto](https://github.com/MauroProto))
