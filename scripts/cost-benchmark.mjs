#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  estimateHumanCostUsd,
  estimateModelCostUsd,
  ratio,
  readJson,
  roundUsd,
  writeJson,
} from './benchmark-utils.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function buildCostReport({ realRepoReport, falsePositiveReport, coverageCalibrationReport = null, assumptions }) {
  const costBasis = coverageCalibrationReport
    ? calibrationCostBasis(coverageCalibrationReport)
    : realRepoCostBasis(realRepoReport);
  const totalRisky = costBasis.totalRisky;
  const deterministicResolved = costBasis.deterministicResolved;
  const escalated = costBasis.agentEscalationCandidates;
  const falsePositiveBlocked = falsePositiveReport.aggregate.blocked || 0;
  const falsePositiveUnknown = falsePositiveReport.aggregate.unknown || 0;
  const baselinePerTask = estimateModelCostUsd(assumptions.baseline_agent_review);
  const escalatedPerTask = estimateModelCostUsd(assumptions.escalated_agent_review);
  const humanEscalationCost = costBasis.agentAssisted
    ? 0
    : estimateHumanCostUsd(
      escalated * assumptions.human_review.minutes_per_escalation,
      assumptions.human_review.senior_hourly_rate_usd,
    );
  const falsePositiveHumanCost = estimateHumanCostUsd(
    (falsePositiveBlocked + falsePositiveUnknown) * assumptions.human_review.minutes_per_false_positive,
    assumptions.human_review.senior_hourly_rate_usd,
  );
  const escapedIssueCost = 0 * (assumptions.incident_expected_cost.escaped_issue_cost_usd || 0);

  const withoutYieldos = roundUsd(totalRisky * baselinePerTask + escapedIssueCost);
  const withYieldos = roundUsd(escalated * escalatedPerTask + humanEscalationCost + falsePositiveHumanCost);

  return {
    version: 1,
    generated_at: new Date().toISOString(),
    measurement_type: 'measured_rates_with_assumption_based_cost_model',
    cost_model_basis: costBasis.id,
    measured: {
      total_risky_tasks: totalRisky,
      deterministic_resolved: deterministicResolved,
      deterministic_resolution_rate: ratio(deterministicResolved, totalRisky),
      agent_escalation_candidates: escalated,
      agent_escalation_rate: ratio(escalated, totalRisky),
      safe_controls: costBasis.safeControls,
      calibration_total_cases: costBasis.calibrationTotalCases,
      benign_commits: falsePositiveReport.aggregate.total_commits || 0,
      false_positive_blocks: falsePositiveBlocked,
      false_positive_unknown: falsePositiveUnknown,
      false_positive_rate: falsePositiveReport.aggregate.false_positive_rate || 0,
      control_unsafe_commits: realRepoReport.aggregate.control_unsafe_commits || 0,
      control_commit_success_rate: realRepoReport.aggregate.control_commit_success_rate || 0,
    },
    assumptions,
    costs: {
      without_yieldos_cost_usd: withoutYieldos,
      with_yieldos_cost_usd: withYieldos,
      delta_usd: roundUsd(withoutYieldos - withYieldos),
      baseline_agent_review_per_task_usd: baselinePerTask,
      escalated_agent_review_per_task_usd: escalatedPerTask,
      human_escalation_cost_usd: humanEscalationCost,
      false_positive_human_cost_usd: falsePositiveHumanCost,
    },
    claim_safety: {
      token_savings_measured: false,
      provider_billing_measured: false,
      allowed_claim: costBasis.agentAssisted
        ? 'Measured calibration rates with assumption-based agent-assisted escalation cost. This models routing cost; it does not claim the agent repaired the deeper cases without a repair benchmark.'
        : 'Measured benchmark rates with assumption-based dollar model. Refresh provider pricing before publishing.',
    },
  };
}

function realRepoCostBasis(realRepoReport) {
  const totalRisky = realRepoReport.aggregate.total_tasks || 0;
  const deterministicResolved = realRepoReport.aggregate.yieldos_prevented || 0;
  return {
    id: 'deterministic_real_repo',
    totalRisky,
    deterministicResolved,
    agentEscalationCandidates: Math.max(0, totalRisky - deterministicResolved),
    safeControls: 0,
    calibrationTotalCases: 0,
    agentAssisted: false,
  };
}

function calibrationCostBasis(coverageCalibrationReport) {
  const outcomes = coverageCalibrationReport.aggregate.outcomes || {};
  const immediatelyPrevented = outcomes['immediately-prevented'] || 0;
  const safeControls = outcomes['accepted-safe-control'] || 0;
  const deeperReviewCandidates = outcomes['not-instantly-detected'] || 0;
  return {
    id: 'coverage_calibration_agent_assisted',
    totalRisky: immediatelyPrevented + deeperReviewCandidates,
    deterministicResolved: immediatelyPrevented,
    agentEscalationCandidates: deeperReviewCandidates,
    safeControls,
    calibrationTotalCases: coverageCalibrationReport.aggregate.total_cases || 0,
    agentAssisted: true,
  };
}

function parseArgs(argv = process.argv.slice(2)) {
  const parsed = {
    assumptions: path.join(REPO_ROOT, 'benchmarks', 'cost-assumptions.json'),
    outFile: path.join(REPO_ROOT, 'benchmarks', `cost-benchmark-${new Date().toISOString().replace(/[:.]/g, '-')}.json`),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--real-report') parsed.realReport = requireValue(arg, argv[++i]);
    else if (arg === '--false-positive-report') parsed.falsePositiveReport = requireValue(arg, argv[++i]);
    else if (arg === '--assumptions') parsed.assumptions = requireValue(arg, argv[++i]);
    else if (arg === '--coverage-report') parsed.coverageReport = requireValue(arg, argv[++i]);
    else if (arg === '--out') parsed.outFile = requireValue(arg, argv[++i]);
    else if (arg === '--help' || arg === '-h') parsed.help = true;
    else throw new Error(`unknown option: ${arg}`);
  }
  if (!parsed.help && !parsed.realReport) throw new Error('--real-report is required');
  if (!parsed.help && !parsed.falsePositiveReport) throw new Error('--false-positive-report is required');
  return parsed;
}

function requireValue(flag, value) {
  if (!value || value.startsWith('--')) throw new Error(`${flag} needs a value`);
  return value;
}

function usage() {
  return [
    'Usage: node scripts/cost-benchmark.mjs --real-report <file> --false-positive-report <file> [--coverage-report <file>] --out benchmarks/<file>.json',
    '',
    'Builds an assumption-based dollar model from measured benchmark rates.',
  ].join('\n');
}

async function main() {
  try {
    const args = parseArgs();
    if (args.help) {
      process.stdout.write(`${usage()}\n`);
      return;
    }
    const report = buildCostReport({
      realRepoReport: readJson(args.realReport),
      falsePositiveReport: readJson(args.falsePositiveReport),
      coverageCalibrationReport: args.coverageReport ? readJson(args.coverageReport) : null,
      assumptions: readJson(args.assumptions),
    });
    writeJson(args.outFile, report);
    process.stdout.write(`${JSON.stringify({ outFile: args.outFile, costs: report.costs, measured: report.measured }, null, 2)}\n`);
  } catch (err) {
    process.stderr.write(`cost-benchmark: ${err.message}\n`);
    process.exit(2);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}

export {
  buildCostReport,
  parseArgs,
};
