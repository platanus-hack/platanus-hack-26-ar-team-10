import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildPluginPackage, parseArgs } from './build-plugin-package.mjs';

test('buildPluginPackage excludes dev-only files', () => {
  const repoRoot = process.cwd();
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yieldos-package-'));
  try {
    buildPluginPackage({ repoRoot, outDir });

    assert.equal(fs.existsSync(path.join(outDir, '.claude-plugin/plugin.json')), true);
    assert.equal(fs.existsSync(path.join(outDir, 'hooks/hooks.json')), true);
    assert.equal(fs.existsSync(path.join(outDir, 'scripts/pre-install-gate.js')), true);
    assert.equal(fs.existsSync(path.join(outDir, 'policy-cache/allowlist.json')), true);
    assert.equal(fs.existsSync(path.join(outDir, 'tests')), false);
    assert.equal(fs.existsSync(path.join(outDir, 'fixtures')), false);
    assert.equal(fs.existsSync(path.join(outDir, 'bin/yieldos-oracle-demo')), false);
    assert.equal(fs.existsSync(path.join(outDir, 'commands/oracle-demo.md')), false);
    assert.equal(fs.existsSync(path.join(outDir, 'scripts/oracles/demo-command.js')), false);
    assert.equal(fs.existsSync(path.join(outDir, 'scripts/oracles/bench.js')), false);
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

test('build-plugin-package parser accepts output path', () => {
  const parsed = parseArgs(['--out', '/tmp/yieldos-plugin']);

  assert.equal(parsed.outDir, path.resolve('/tmp/yieldos-plugin'));
});
