import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDashboardData, parseArgs, renderDashboardHtml } from './benchmark-visual-dashboard.mjs';

test('benchmark visual dashboard extracts presentation metrics', () => {
  const data = buildDashboardData();
  assert.equal(data.deterministic.public.yieldos_prevented, 16);
  assert.equal(data.false_positive.blocked, 0);
  assert.equal(data.coverage.immediate_correct_decision_rate, 0.8333);
  assert.equal(data.coverage.deeper_review_candidates, 2);
  assert.equal(data.cost.basis, 'coverage_calibration_agent_assisted');
  assert.equal(data.cost.without_yieldos, 5.4);
  assert.equal(data.cost.with_yieldos, 0.72);
  assert.equal(data.cost.agent_escalations, 2);
  assert.equal(data.live.expanded.total_cases, 64);
  assert.equal(data.live.expanded.by_task['admin-users-route'].prevented, 15);
});

test('benchmark visual dashboard renders standalone html', () => {
  const html = renderDashboardHtml(buildDashboardData());
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /yieldOS Benchmark Dashboard/);
  assert.match(html, /Strong guardrail, honest limits/);
  assert.match(html, /Review cost: without vs with yieldOS/);
  assert.match(html, /"without_yieldos":5\.4/);
  assert.match(html, /"with_yieldos":0\.72/);
  assert.match(html, /agent-assisted/);
  assert.match(html, /2m 42s/);
  assert.doesNotMatch(html, /162,409 ms/);
  const removedHeadline = ['inval', 'id patch'].join('');
  assert.equal(html.toLowerCase().includes(removedHeadline), false);
  assert.doesNotMatch(html, /\/Users\//);
});

test('benchmark visual dashboard parser accepts output path', () => {
  const parsed = parseArgs(['--out', '/tmp/dashboard.html']);
  assert.equal(parsed.outFile, '/tmp/dashboard.html');
});
