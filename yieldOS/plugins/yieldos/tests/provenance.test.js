'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const provenance = require('../scripts/analyzers/provenance');

test('extractGithubSlug pulls owner/name out of various git URL shapes', () => {
  assert.equal(provenance.extractGithubSlug('https://github.com/lodash/lodash.git'), 'lodash/lodash');
  assert.equal(provenance.extractGithubSlug('https://github.com/lodash/lodash'), 'lodash/lodash');
  assert.equal(provenance.extractGithubSlug('git+https://github.com/lodash/lodash.git'), 'lodash/lodash');
  assert.equal(provenance.extractGithubSlug('git@github.com:lodash/lodash.git'), 'lodash/lodash');
  assert.equal(provenance.extractGithubSlug('https://gitlab.com/x/y'), null);
  assert.equal(provenance.extractGithubSlug(null), null);
  assert.equal(provenance.extractGithubSlug(undefined), null);
});

test('normalizeRepoUrl strips git+, .git, ssh schemes', () => {
  assert.equal(provenance.normalizeRepoUrl('git+https://github.com/x/y.git'), 'https://github.com/x/y');
  assert.equal(provenance.normalizeRepoUrl('ssh://git@github.com/x/y.git'), 'https://github.com/x/y');
  assert.equal(provenance.normalizeRepoUrl('github:x/y'), 'https://github.com/x/y');
  assert.equal(provenance.normalizeRepoUrl(null), null);
  assert.equal(provenance.normalizeRepoUrl(''), null);
});

test('checkNpm returns inconclusive for a package without pinned version', async () => {
  const result = await provenance.checkNpm('lodash', 'latest', 'https://github.com/lodash/lodash');
  assert.equal(result.tier, 'tier3');
  assert.equal(result.verdict, 'inconclusive');
});

test('checkNpm handles a non-existent package gracefully (no crash)', async () => {
  const result = await provenance.checkNpm('this-pkg-does-not-exist-yieldos-test-9999', '0.0.1', null);
  // Either no-provenance or some inconclusive verdict — never throw.
  assert.ok(['no-provenance', 'provenance-unparseable', 'inconclusive'].includes(result.verdict));
  assert.ok(['tier3'].includes(result.tier));
});
