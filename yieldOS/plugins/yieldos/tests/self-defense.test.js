'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const sd = require('../scripts/self-defense');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'yieldos-sd-'));
}

test('protected: claude plugins yieldos path', () => {
  assert.equal(sd.isProtectedPath('/home/user/.claude/plugins/yieldos/scripts/decide.js'), true);
});

test('protected: dependency-events.md', () => {
  assert.equal(sd.isProtectedPath('/proj/security/dependency-events.md'), true);
});

test('protected: yieldos-rewrites.json', () => {
  assert.equal(sd.isProtectedPath('/proj/security/yieldos-rewrites.json'), true);
});

test('protected: instruction hashes file', () => {
  assert.equal(sd.isProtectedPath('/proj/security/.yieldos-instruction-hashes.json'), true);
});

test('protected: claude-plugin internal scripts', () => {
  assert.equal(sd.isProtectedPath('/proj/.claude-plugin/scripts/decide.js'), true);
});

test('not protected: regular project file', () => {
  assert.equal(sd.isProtectedPath('/proj/src/index.js'), false);
});

test('not protected: regular markdown', () => {
  assert.equal(sd.isProtectedPath('/proj/README.md'), false);
});

test('not protected: package.json', () => {
  assert.equal(sd.isProtectedPath('/proj/package.json'), false);
});

test('protected via path traversal: ../../security/dependency-events.md', () => {
  // path.normalize collapses the `..` segments, so `/proj/x/../../security/...`
  // becomes `/security/...`. The first pattern still matches.
  assert.equal(
    sd.isProtectedPath('/proj/x/y/../../security/dependency-events.md'),
    true,
    'path.normalize must collapse traversal before regex match',
  );
});

test('protected via symlink: link in /tmp pointing to dependency-events.md', () => {
  const dir = tmpDir();
  const securityDir = path.join(dir, 'security');
  fs.mkdirSync(securityDir);
  const realProtected = path.join(securityDir, 'dependency-events.md');
  fs.writeFileSync(realProtected, '');

  // Create a non-suspicious-looking symlink that resolves to the protected file.
  const link = path.join(dir, 'totally-innocent-readme.md');
  fs.symlinkSync(realProtected, link);

  assert.equal(
    sd.isProtectedPath(link),
    true,
    'symlinks pointing into protected files must be detected via realpath',
  );
});

test('protected via parent symlink: parent dir is symlinked', () => {
  // .../proj-link/security/dependency-events.md  where proj-link → real-proj
  const dir = tmpDir();
  const realProj = path.join(dir, 'real-proj');
  fs.mkdirSync(path.join(realProj, 'security'), { recursive: true });
  const realFile = path.join(realProj, 'security', 'dependency-events.md');
  fs.writeFileSync(realFile, '');

  const linkProj = path.join(dir, 'proj-link');
  fs.symlinkSync(realProj, linkProj);

  // Path to write: <linkProj>/security/dependency-events.md
  const attempted = path.join(linkProj, 'security', 'dependency-events.md');
  assert.equal(
    sd.isProtectedPath(attempted),
    true,
    'symlink-via-parent must be resolved and matched',
  );
});

test('protected via symlink to a target that does not exist yet', () => {
  // Adversarial: symlink the target file before yieldOS creates it; agent
  // tries to write to the link, which would corrupt the protected file.
  const dir = tmpDir();
  const securityDir = path.join(dir, 'security');
  fs.mkdirSync(securityDir);
  const protectedTarget = path.join(securityDir, 'dependency-events.md');

  const link = path.join(dir, 'innocent.md');
  fs.symlinkSync(protectedTarget, link);  // dangling

  assert.equal(
    sd.isProtectedPath(link),
    true,
    'dangling symlink whose target is protected must still block the write',
  );
});

test('not protected: regular file under /tmp (sanity check, no false positives from realpath)', () => {
  const dir = tmpDir();
  const fp = path.join(dir, 'normal-file.txt');
  fs.writeFileSync(fp, 'hello');
  assert.equal(sd.isProtectedPath(fp), false);
});
