'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const provenance = require('../scripts/analyzers/provenance');

function attestationResponse(repoUrl) {
  const payload = {
    predicate: {
      buildDefinition: {
        externalParameters: {
          workflow: {
            repository: repoUrl,
          },
        },
      },
    },
  };
  return {
    status: 200,
    body: {
      attestations: [
        {
          bundle: {
            dsseEnvelope: {
              payload: Buffer.from(JSON.stringify(payload), 'utf8').toString('base64'),
            },
          },
        },
      ],
    },
  };
}

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

test('checkNpm handles missing attestations as a soft warning', async () => {
  const result = await provenance.checkNpm(
    'example',
    '1.0.0',
    'https://github.com/example/example',
    { fetchJson: async () => ({ status: 404 }) },
  );
  assert.equal(result.tier, 'tier3');
  assert.equal(result.verdict, 'no-provenance');
});

test('checkNpm accepts provenance signed by the expected GitHub repo', async () => {
  const result = await provenance.checkNpm(
    'example',
    '1.0.0',
    'https://github.com/example/example',
    { fetchJson: async () => attestationResponse('https://github.com/example/example') },
  );
  assert.equal(result.tier, 'clean');
  assert.equal(result.verdict, 'provenance-ok');
});

test('checkNpm flags provenance signed by a different GitHub repo', async () => {
  const result = await provenance.checkNpm(
    'example',
    '1.0.0',
    'https://github.com/example/example',
    { fetchJson: async () => attestationResponse('https://github.com/evil/example') },
  );
  assert.equal(result.tier, 'tier1');
  assert.equal(result.verdict, 'provenance-repo-mismatch');
});
