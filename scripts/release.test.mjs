import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  bumpVersion,
  collectVersions,
  extractReleaseNotes,
  updateReleaseFiles,
} from './versioning.mjs';

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yieldos-release-'));

  writeJson(path.join(root, '.claude-plugin/marketplace.json'), {
    name: 'yieldos',
    owner: { name: 'platanus-hack-26-ar-team-10' },
    plugins: [{ name: 'yieldos', version: '0.2.7', source: './yieldOS/plugins/yieldos' }],
  });

  writeJson(path.join(root, 'yieldOS/.claude-plugin/marketplace.json'), {
    name: 'yieldos',
    owner: { name: 'platanus-hack-26-ar-team-10' },
    plugins: [{ name: 'yieldos', version: '0.2.7', source: './plugins/yieldos' }],
  });

  writeJson(path.join(root, 'yieldOS/plugins/yieldos/.claude-plugin/plugin.json'), {
    name: 'yieldos',
    version: '0.2.7',
  });

  fs.mkdirSync(path.join(root, 'yieldOS/plugins/yieldos'), { recursive: true });

  return root;
}

test('bumpVersion supports semver increments and explicit versions', () => {
  assert.equal(bumpVersion('0.2.7', 'patch'), '0.2.8');
  assert.equal(bumpVersion('0.2.7', 'minor'), '0.3.0');
  assert.equal(bumpVersion('0.2.7', 'major'), '1.0.0');
  assert.equal(bumpVersion('0.2.7', '0.4.0'), '0.4.0');
});

test('bumpVersion rejects invalid or non-increasing versions', () => {
  assert.throws(() => bumpVersion('0.2.7', 'latest'), /expected patch, minor, major, or semver/);
  assert.throws(() => bumpVersion('0.2.7', '0.2.7'), /must be greater than current/);
  assert.throws(() => bumpVersion('0.2.7', '0.2.6'), /must be greater than current/);
});

test('updateReleaseFiles keeps every Claude plugin version in sync and writes changelogs', () => {
  const root = makeFixture();

  updateReleaseFiles(root, {
    version: '0.2.8',
    date: '2026-05-09',
    notes: ['Add self-update command.', 'Document release process.'],
  });

  assert.deepEqual(collectVersions(root), {
    '.claude-plugin/marketplace.json': '0.2.8',
    'yieldOS/.claude-plugin/marketplace.json': '0.2.8',
    'yieldOS/plugins/yieldos/.claude-plugin/plugin.json': '0.2.8',
  });

  const rootChangelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
  const pluginChangelog = fs.readFileSync(path.join(root, 'yieldOS/plugins/yieldos/CHANGELOG.md'), 'utf8');

  assert.match(rootChangelog, /## yieldOS v0\.2\.8 - 2026-05-09/);
  assert.match(rootChangelog, /- Add self-update command\./);
  assert.equal(pluginChangelog, rootChangelog);
});

test('extractReleaseNotes returns only the requested version section', () => {
  const changelog = [
    '# Changelog',
    '',
    '## yieldOS v0.2.8 - 2026-05-09',
    '',
    '- Add update command.',
    '',
    '## yieldOS v0.2.7 - 2026-05-08',
    '',
    '- Add colored stamps.',
    '',
  ].join('\n');

  assert.equal(extractReleaseNotes(changelog, '0.2.8'), '- Add update command.');
});
