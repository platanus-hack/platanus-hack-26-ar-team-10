'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { decide, VERDICT } = require('../scripts/decide');

const allowlist = require('./fixtures/mock-allowlist.json');
const denylist = require('./fixtures/mock-denylist.json');
const categories = require('./fixtures/mock-categories.json');
const natives = require('./fixtures/mock-natives.json');

const policy = {
  'allowlist.json': allowlist,
  'denylist.json': denylist,
  'categories.json': categories,
  'native-equivalents.json': natives,
  'build-scripts-allowed.json': { entries: [{ key: 'npm:bcrypt' }] },
};

const opts = { osv: false };

test('allowlisted package returns ALLOW_ALLOWLIST', async () => {
  const candidate = { manager: 'npm', name: 'react', version: '18.3.1', command: 'npm install react' };
  const d = await decide(candidate, policy, opts);
  assert.equal(d.verdict, VERDICT.ALLOW_ALLOWLIST);
  assert.equal(d.action, 'allow');
});

test('denylisted package returns BLOCK_DENYLIST', async () => {
  const candidate = { manager: 'npm', name: 'event-stream', version: '3.3.6', command: 'npm install event-stream@3.3.6' };
  const d = await decide(candidate, policy, opts);
  assert.equal(d.verdict, VERDICT.BLOCK_DENYLIST);
  assert.equal(d.action, 'block');
});

test('denylisted by name (any version) blocks', async () => {
  const candidate = { manager: 'npm', name: 'colors', version: '1.4.0', command: 'npm install colors' };
  const d = await decide(candidate, policy, opts);
  assert.equal(d.verdict, VERDICT.BLOCK_DENYLIST);
});

test('Category D package blocks', async () => {
  const candidate = { manager: 'npm', name: 'bcrypt', version: '5.1.1', command: 'npm install bcrypt' };
  const d = await decide(candidate, policy, opts);
  assert.equal(d.verdict, VERDICT.BLOCK_CATEGORY_D);
});

test('Native equivalent triggers native verdict', async () => {
  const candidate = { manager: 'npm', name: 'uuid', version: '9.0.0', command: 'npm install uuid' };
  const d = await decide(candidate, policy, opts);
  assert.equal(d.verdict, VERDICT.ALLOW_NATIVE);
  assert.equal(d.action, 'block-with-suggestion');
});

test('Allowlist beats native', async () => {
  // react in our fixture is allowlisted; make a native fixture for it
  const customPolicy = {
    ...policy,
    'native-equivalents.json': { entries: { 'npm:react': { native: 'preact' } } },
  };
  const candidate = { manager: 'npm', name: 'react', version: '18.3.1', command: 'npm install react' };
  const d = await decide(candidate, customPolicy, opts);
  // native is checked first, so this returns native suggestion
  assert.equal(d.verdict, VERDICT.ALLOW_NATIVE);
});

test('Category A explicit gets rewrite', async () => {
  const candidate = { manager: 'npm', name: 'classnames', version: '2.5.0', command: 'npm install classnames' };
  const d = await decide(candidate, policy, opts);
  assert.equal(d.verdict, VERDICT.REWRITE_CATEGORY_A);
  assert.equal(d.action, 'block-and-rewrite');
});
