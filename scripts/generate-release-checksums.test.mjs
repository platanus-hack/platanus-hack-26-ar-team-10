import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { generateChecksums } from './generate-release-checksums.mjs';

test('generateChecksums writes stable sha256 lines', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yieldos-release-'));
  await writeFile(join(dir, 'install.sh'), '#!/bin/sh\nexit 0\n');
  await writeFile(join(dir, 'yieldos-plugin.tgz'), 'plugin archive\n');

  const output = await generateChecksums({
    cwd: dir,
    files: ['install.sh', 'yieldos-plugin.tgz'],
    outputFile: 'checksums.txt',
  });

  assert.equal(output.lines.length, 2);
  assert.match(output.lines[0], /^[a-f0-9]{64}  install\.sh$/);
  assert.match(output.lines[1], /^[a-f0-9]{64}  yieldos-plugin\.tgz$/);

  const saved = await readFile(join(dir, 'checksums.txt'), 'utf8');
  assert.equal(saved, `${output.lines.join('\n')}\n`);
});

test('generateChecksums rejects unsafe release paths', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yieldos-release-'));
  await assert.rejects(
    () => generateChecksums({ cwd: dir, files: ['../install.sh'] }),
    /refusing unsafe release path/,
  );
});
