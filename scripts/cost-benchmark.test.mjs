import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { buildCostReport, parseArgs } from './cost-benchmark.mjs';

const assumptions = {
  version: 1,
  currency: 'USD',
  baseline_agent_review: {
    input_tokens: 150000,
    output_tokens: 10000,
    input_usd_per_million: 3,
    output_usd_per_million: 15,
  },
  escalated_agent_review: {
    input_tokens: 90000,
    output_tokens: 6000,
    input_usd_per_million: 3,
    output_usd_per_million: 15,
  },
  human_review: {
    senior_hourly_rate_usd: 60,
    minutes_per_escalation: 5,
    minutes_per_false_positive: 2,
  },
  incident_expected_cost: { escaped_issue_cost_usd: 0 },
};

test('buildCostReport separates measured rates from assumption-based dollars', () => {
  const report = buildCostReport({
    realRepoReport: {
      aggregate: {
        total_tasks: 100,
        yieldos_prevented: 98,
        control_unsafe_commits: 100,
        control_commit_success_rate: 1,
      },
    },
    falsePositiveReport: {
      aggregate: {
        total_commits: 100,
        blocked: 1,
        unknown: 1,
        false_positive_rate: 0.01,
      },
    },
    assumptions,
  });

  assert.equal(report.measured.deterministic_resolution_rate, 0.98);
  assert.equal(report.measured.agent_escalation_rate, 0.02);
  assert.equal(report.measured.false_positive_rate, 0.01);
  assert.equal(report.costs.with_yieldos_cost_usd > 0, true);
  assert.equal(report.costs.without_yieldos_cost_usd > report.costs.with_yieldos_cost_usd, true);
  assert.equal(report.claim_safety.token_savings_measured, false);
  assert.match(report.claim_safety.allowed_claim, /assumption-based/);
});

test('buildCostReport uses coverage calibration for agent-assisted escalation cost', () => {
  const report = buildCostReport({
    realRepoReport: {
      aggregate: {
        total_tasks: 16,
        yieldos_prevented: 16,
        control_unsafe_commits: 16,
        control_commit_success_rate: 1,
      },
    },
    falsePositiveReport: {
      aggregate: {
        total_commits: 27,
        blocked: 0,
        unknown: 0,
        false_positive_rate: 0,
      },
    },
    coverageCalibrationReport: {
      aggregate: {
        total_cases: 12,
        tracks: {
          'immediate-prevent': 7,
          'safe-control': 3,
          'coverage-candidate': 2,
        },
        outcomes: {
          'immediately-prevented': 7,
          'accepted-safe-control': 3,
          'not-instantly-detected': 2,
        },
      },
    },
    assumptions,
  });

  assert.equal(report.cost_model_basis, 'coverage_calibration_agent_assisted');
  assert.equal(report.measured.total_risky_tasks, 9);
  assert.equal(report.measured.deterministic_resolved, 7);
  assert.equal(report.measured.agent_escalation_candidates, 2);
  assert.equal(report.measured.safe_controls, 3);
  assert.equal(report.costs.without_yieldos_cost_usd, 5.4);
  assert.equal(report.costs.with_yieldos_cost_usd, 0.72);
  assert.equal(report.costs.delta_usd, 4.68);
  assert.match(report.claim_safety.allowed_claim, /agent-assisted/);
});

test('cost parser requires report inputs and accepts overrides', () => {
  assert.throws(() => parseArgs([]), /--real-report/);
  const parsed = parseArgs([
    '--real-report',
    '/tmp/real.json',
    '--false-positive-report',
    '/tmp/fp.json',
    '--assumptions',
    '/tmp/a.json',
    '--coverage-report',
    '/tmp/coverage.json',
    '--out',
    '/tmp/out.json',
  ]);
  assert.equal(parsed.realReport, '/tmp/real.json');
  assert.equal(parsed.falsePositiveReport, '/tmp/fp.json');
  assert.equal(parsed.assumptions, '/tmp/a.json');
  assert.equal(parsed.coverageReport, '/tmp/coverage.json');
  assert.equal(parsed.outFile, '/tmp/out.json');
  assert.equal(path.basename(parsed.outFile), 'out.json');
});
