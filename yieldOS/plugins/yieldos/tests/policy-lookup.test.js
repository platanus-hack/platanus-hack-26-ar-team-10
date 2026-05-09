'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const lookup = require('../scripts/policy-lookup');
const allowlist = require('./fixtures/mock-allowlist.json');
const denylist = require('./fixtures/mock-denylist.json');
const natives = require('./fixtures/mock-natives.json');

const allowlistedCandidate = { manager: 'npm', name: 'react', version: '18.3.1' };
const denylistedCandidate = { manager: 'npm', name: 'event-stream', version: '3.3.6' };
const denylistedByName = { manager: 'npm', name: 'colors', version: '1.4.0' };
const unlistedCandidate = { manager: 'npm', name: 'cool-package', version: '1.0.0' };
const nativeCandidate = { manager: 'npm', name: 'uuid', version: '9.0.0' };
const pythonAllowed = { manager: 'pip', name: 'requests', version: '2.31.0' };

test('exact allowlist match returns true', () => {
  assert.equal(lookup.isAllowlisted(allowlistedCandidate, allowlist), true);
});

test('name-only allowlist match returns true for pinned versions', () => {
  const localAllowlist = { entries: [{ key: 'npm:react', category: 'framework' }] };
  assert.equal(lookup.isAllowlisted({ manager: 'npm', name: 'react', version: '18.2.0' }, localAllowlist), true);
});

test('matchedByNameOnly is false for exact allowlist match', () => {
  assert.equal(lookup.matchedByNameOnly(allowlistedCandidate, allowlist), false);
});

test('matchedByNameOnly is true when only package name matches', () => {
  const localAllowlist = { entries: [{ key: 'npm:react', category: 'framework' }] };
  assert.equal(lookup.matchedByNameOnly({ manager: 'npm', name: 'react', version: '18.2.0' }, localAllowlist), true);
});

test('python allowlist match', () => {
  assert.equal(lookup.isAllowlisted(pythonAllowed, allowlist), true);
});

test('unlisted package is not allowlisted', () => {
  assert.equal(lookup.isAllowlisted(unlistedCandidate, allowlist), false);
});

test('denylist exact version match returns entry', () => {
  const entry = lookup.isDenylisted(denylistedCandidate, denylist);
  assert.notEqual(entry, null);
  assert.equal(entry.reason.includes('supply-chain'), true);
});

test('denylist by name (any version) returns entry', () => {
  const entry = lookup.isDenylisted(denylistedByName, denylist);
  assert.notEqual(entry, null);
  assert.equal(entry.reason.includes('self-sabotage'), true);
});

test('unlisted package is not denylisted', () => {
  assert.equal(lookup.isDenylisted(unlistedCandidate, denylist), null);
});

test('native equivalent found', () => {
  const native = lookup.nativeEquivalent(nativeCandidate, natives);
  assert.notEqual(native, null);
  assert.equal(native.native.includes('crypto.randomUUID'), true);
});

test('no native equivalent for unknown package', () => {
  assert.equal(lookup.nativeEquivalent(unlistedCandidate, natives), null);
});

test('full key includes ecosystem, name, version', () => {
  assert.equal(lookup.fullKey(allowlistedCandidate), 'npm:react@18.3.1');
});

test('full key for python uses == delimiter', () => {
  assert.equal(lookup.fullKey(pythonAllowed), 'python:requests==2.31.0');
});

test('name key omits version', () => {
  assert.equal(lookup.nameKey(allowlistedCandidate), 'npm:react');
});

test('ecosystem mapping for pnpm is npm', () => {
  assert.equal(lookup.ecosystemFor({ manager: 'pnpm' }), 'npm');
});

test('ecosystem mapping for poetry is python', () => {
  assert.equal(lookup.ecosystemFor({ manager: 'poetry' }), 'python');
});

test('ecosystem mapping for MCPs is mcp', () => {
  assert.equal(lookup.ecosystemFor({ manager: 'mcp' }), 'mcp');
});
