'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const ui = require('../scripts/ui');

test('formatDecision keeps plain hook output when color is disabled', () => {
  const out = ui.formatDecision({
    verdict: 'denylist-match',
    action: 'block',
    message: 'yieldOS bloqueó event-stream: malicious package',
  }, { color: false });

  assert.equal(out, '[yieldOS] BLOCK bloqueó event-stream: malicious package');
});

test('formatDecision adds ansi color only when color is enabled', () => {
  const out = ui.formatDecision({
    verdict: 'code-audit-fix-applied',
    action: 'block',
    message: 'yieldOS code-audit applied 2 security fix pass(es); rerun git commit',
  }, { color: true });

  assert.equal(out.includes('\u001b['), true);
  assert.equal(out.includes('[yieldOS]'), true);
  assert.equal(out.includes('FIXED'), true);
});

test('formatVerdict preserves the machine-readable verdict exactly', () => {
  assert.equal(ui.formatVerdict('code-audit-blocked'), '[yieldOS:verdict] code-audit-blocked');
});

test('formatDecision labels dependency rewrites as rewrites', () => {
  const out = ui.formatDecision({
    verdict: 'category-a-rewrite',
    action: 'block-and-rewrite',
    message: 'yieldOS realizó una optimización de la instalación de classnames',
  }, { color: false });

  assert.equal(out, '[yieldOS] REWRITE realizó una optimización de la instalación de classnames');
});

test('formatAuditFindings shows a small bounded finding summary', () => {
  const out = ui.formatAuditFindings({
    findings: [
      { severity: 'high', ruleId: 'sql-injection', file: 'db.js', title: 'Interpolated SQL query' },
      { severity: 'medium', ruleId: 'open-redirect', file: 'server.js', title: 'User-controlled redirect target' },
      { severity: 'low', ruleId: 'note', file: 'app.js', title: 'Extra detail' },
      { severity: 'low', ruleId: 'note2', file: 'other.js', title: 'Extra detail 2' },
    ],
  }, { color: false });

  assert.equal(out.length, 5);
  assert.equal(out[0], '[yieldOS] Findings:');
  assert.equal(out[1].includes('HIGH sql-injection db.js - Interpolated SQL query'), true);
  assert.equal(out[4].includes('... 1 more finding(s)'), true);
});

test('shouldColor respects tty, NO_COLOR, and CI', () => {
  assert.equal(ui.shouldColor({ isTTY: true }, {}), true);
  assert.equal(ui.shouldColor({ isTTY: true }, { NO_COLOR: '1' }), false);
  assert.equal(ui.shouldColor({ isTTY: true }, { CI: 'true' }), false);
  assert.equal(ui.shouldColor({ isTTY: false }, {}), false);
});

test('writeMessage emits one human-facing line', () => {
  const stream = {
    isTTY: false,
    output: '',
    write(value) {
      this.output += value;
    },
  };

  ui.writeMessage('policy source: shipped-cache', {}, stream);

  assert.equal(stream.output, '[yieldOS] INFO policy source: shipped-cache\n');
});
