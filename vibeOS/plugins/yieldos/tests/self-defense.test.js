'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const sd = require('../scripts/self-defense');

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
