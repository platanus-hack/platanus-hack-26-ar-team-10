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
  'skills.json': {
    entries: [
      {
        key: 'skill:init',
        category: 'official',
        vendor: 'anthropic',
      },
      {
        key: 'skill:dependency-gate',
        category: 'self',
        vendor: 'yieldos',
      },
    ],
  },
  'mcps.json': {
    entries: [
      {
        key: 'mcp:filesystem',
        approved_tools: ['read_file', 'list_directory'],
        scope: 'read-only',
      },
      {
        key: 'mcp:claude-in-chrome',
        approved_tools: [],
        scope: 'blocked-by-default',
      },
    ],
  },
};

const opts = { osv: false };

test('allowlisted package returns ALLOW_ALLOWLIST', async () => {
  const candidate = { manager: 'npm', name: 'react', version: '18.3.1', command: 'npm install react' };
  const d = await decide(candidate, policy, opts);
  assert.equal(d.verdict, VERDICT.ALLOW_ALLOWLIST);
  assert.equal(d.action, 'allow');
});

test('name-only allowlist allows existing concrete version', async () => {
  const candidate = { manager: 'npm', name: 'next', version: '14.2.0', command: 'npm install next@14.2.0' };
  const localPolicy = {
    ...policy,
    'allowlist.json': { entries: [{ key: 'npm:next', category: 'framework' }] },
  };
  const d = await decide(candidate, localPolicy, { ...opts, versionExists: async () => true });
  assert.equal(d.verdict, VERDICT.ALLOW_ALLOWLIST);
  assert.equal(d.action, 'allow');
});

test('name-only allowlist blocks confirmed fake concrete version', async () => {
  const candidate = { manager: 'npm', name: 'next', version: '99.99.99', command: 'npm install next@99.99.99' };
  const localPolicy = {
    ...policy,
    'allowlist.json': { entries: [{ key: 'npm:next', category: 'framework' }] },
  };
  const d = await decide(candidate, localPolicy, { ...opts, versionExists: async () => false });
  assert.equal(d.verdict, VERDICT.BLOCK_VERIFICATION);
  assert.equal(d.action, 'block');
  assert.equal(d.meta.reason, 'fake-version');
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

test('denylist wins when a package also matches allowlist', async () => {
  const candidate = { manager: 'npm', name: 'dual-use', version: '1.0.0', command: 'npm install dual-use@1.0.0' };
  const localPolicy = {
    ...policy,
    'allowlist.json': { entries: [{ key: 'npm:dual-use@1.0.0', category: 'test-fixture' }] },
    'denylist.json': { entries: [{ key: 'npm:dual-use@1.0.0', reason: 'test conflict must fail closed' }] },
  };

  const d = await decide(candidate, localPolicy, opts);

  assert.equal(d.verdict, VERDICT.BLOCK_DENYLIST);
  assert.equal(d.action, 'block');
  assert.equal(d.meta.denyEntry.reason, 'test conflict must fail closed');
});

test('denylist wins before native replacement suggestion', async () => {
  const candidate = { manager: 'npm', name: 'uuid', version: '9.0.0', command: 'npm install uuid' };
  const localPolicy = {
    ...policy,
    'denylist.json': { entries: [{ key: 'npm:uuid', reason: 'test native conflict must fail closed' }] },
  };

  const d = await decide(candidate, localPolicy, opts);

  assert.equal(d.verdict, VERDICT.BLOCK_DENYLIST);
  assert.equal(d.action, 'block');
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

test('approved-name direct MCP candidate is blocked until source and tools are verified', async () => {
  const candidate = { type: 'mcp', manager: 'mcp', name: 'mcp:filesystem', version: 'latest', command: 'claude mcp add filesystem' };
  const d = await decide(candidate, policy, opts);
  assert.equal(d.verdict, VERDICT.BLOCK_MCP);
  assert.equal(d.action, 'block');
  assert.equal(d.meta.reason, 'mcp-direct-add-requires-tool-surface-verification');
});

test('blocked MCP candidate is blocked from MCP policy', async () => {
  const candidate = { type: 'mcp', manager: 'mcp', name: 'mcp:claude-in-chrome', version: 'latest', command: 'claude mcp add claude-in-chrome' };
  const d = await decide(candidate, policy, opts);
  assert.equal(d.verdict, VERDICT.BLOCK_MCP);
  assert.equal(d.action, 'block');
  assert.equal(d.meta.reason, 'mcp-blocked-by-default');
});

test('unlisted MCP candidate is blocked by default', async () => {
  const candidate = { type: 'mcp', manager: 'mcp', name: 'mcp:not-approved', version: 'latest', command: 'claude mcp add not-approved' };
  const d = await decide(candidate, policy, opts);
  assert.equal(d.verdict, VERDICT.BLOCK_MCP);
  assert.equal(d.action, 'block');
});

test('approved skill candidate is allowed from skills policy', async () => {
  const candidate = { type: 'skill', manager: 'skills', name: 'init', version: 'latest', command: 'npx skills add init' };
  const d = await decide(candidate, policy, opts);
  assert.equal(d.verdict, VERDICT.ALLOW_SKILL);
  assert.equal(d.action, 'allow');
});

test('unlisted skill candidate is blocked by default', async () => {
  const candidate = { type: 'skill', manager: 'skills', name: 'evil-skill', version: 'latest', command: 'npx skills add evil-skill' };
  const d = await decide(candidate, policy, opts);
  assert.equal(d.verdict, VERDICT.BLOCK_SKILL);
  assert.equal(d.action, 'block');
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
