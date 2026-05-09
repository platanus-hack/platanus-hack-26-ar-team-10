'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const logger = require('../scripts/logger');

function tmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'yieldos-log-'));
}

test('logAllowed appends to security/dependency-events.md', () => {
  const root = tmpProject();
  const fp = logger.logAllowed(root, {
    type: 'library', name: 'react', version: '18.3.1', source: 'npm',
    command: 'npm install react@18.3.1',
  });
  assert.equal(fs.existsSync(fp), true);
  const content = fs.readFileSync(fp, 'utf8');
  assert.equal(content.includes('Allowed Install'), true);
  assert.equal(content.includes('react'), true);
});

test('logBlocked includes block reason', () => {
  const root = tmpProject();
  const fp = logger.logBlocked(root, {
    type: 'library', name: 'event-stream', version: '3.3.6', source: 'npm',
    command: 'npm install event-stream@3.3.6',
  }, 'denylist match');
  const content = fs.readFileSync(fp, 'utf8');
  assert.equal(content.includes('Blocked Install'), true);
  assert.equal(content.includes('denylist match'), true);
});

test('logVerified includes findings', () => {
  const root = tmpProject();
  const fp = logger.logVerified(root, {
    type: 'library', name: 'something', version: '1.0.0', source: 'npm',
    command: 'npm install something',
  }, [{ id: 'minor-finding', severity: 'tier3' }]);
  const content = fs.readFileSync(fp, 'utf8');
  assert.equal(content.includes('Verified Install'), true);
  assert.equal(content.includes('minor-finding'), true);
});

test('logRewritten includes generated files', () => {
  const root = tmpProject();
  const fp = logger.logRewritten(root, {
    type: 'library', name: 'classnames', version: '2.5.0', source: 'npm',
    command: 'npm install classnames',
  }, {
    justification: 'category A',
    files: ['src/lib/yieldos/classnames/index.js'],
    api: 'export default function classnames(...)',
    marker: 'src/lib/yieldos/classnames/index.js',
  });
  const content = fs.readFileSync(fp, 'utf8');
  assert.equal(content.includes('Rewritten Locally'), true);
  assert.equal(content.includes('classnames'), true);
});

test('logTransitiveAudit summarizes audit', () => {
  const root = tmpProject();
  const fp = logger.logTransitiveAudit(root, { name: 'express', version: '4.19.2' }, {
    whitelisted: ['debug@4.3.4'],
    aged: ['cookie@0.6.0'],
    downgraded: [],
    denylisted: [],
    cves: [],
    complete: true,
  });
  const content = fs.readFileSync(fp, 'utf8');
  assert.equal(content.includes('Transitive Audit'), true);
  assert.equal(content.includes('debug'), true);
});

test('sanitize redacts likely tokens', () => {
  const sanitized = logger.sanitize('Authorization: Bearer abc123def456 token');
  assert.equal(sanitized.includes('REDACTED'), true);
});

test('sanitize redacts sk- prefix tokens', () => {
  const sanitized = logger.sanitize('api_key: sk-abcdefghij1234567890abcdefghij');
  assert.equal(sanitized.includes('REDACTED'), true);
});

test('logSelfDefense logs entry', () => {
  const root = tmpProject();
  const fp = logger.logSelfDefense(root, {
    action: 'Write',
    target: '/path/to/.claude/plugins/yieldos/scripts/decide.js',
  });
  const content = fs.readFileSync(fp, 'utf8');
  assert.equal(content.includes('Self-Defense Trigger'), true);
});
