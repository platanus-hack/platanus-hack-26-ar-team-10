import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type RealRepoReport = {
  aggregate: {
    total_tasks: number;
    control_unsafe_commits: number;
    yieldos_prevented: number;
    yieldos_prevention_rate: number;
    yieldos_p50_ms: number;
    yieldos_p95_ms: number;
  };
};

type FalsePositiveReport = {
  aggregate: {
    total_commits: number;
    allowed: number;
    blocked: number;
    unknown: number;
    false_positive_rate: number;
  };
};

type CostReport = {
  cost_model_basis?: string;
  costs: {
    without_yieldos_cost_usd: number;
    with_yieldos_cost_usd: number;
    delta_usd: number;
    baseline_agent_review_per_task_usd: number;
    escalated_agent_review_per_task_usd: number;
  };
  measured: {
    deterministic_resolved: number;
    agent_escalation_candidates: number;
    safe_controls?: number;
  };
  claim_safety: {
    allowed_claim: string;
  };
};

type CoverageReport = {
  aggregate: {
    total_cases: number;
    immediate_correct_decisions: number;
    immediate_correct_decision_rate: number;
    not_instantly_detected: number;
    not_instantly_detected_rate: number;
    outcomes: Record<string, number>;
  };
  results: Array<{
    task_id: string;
    track: string;
    outcome: string;
    description: string;
  }>;
};

type ModelReport = {
  aggregate: {
    total_cases: number;
    completed_cases: number;
    model_cost_usd: number;
    p50_ms: number;
    p95_ms: number;
  };
  repositories: Array<{ id: string; kind: string }>;
  results: Array<{
    task_id: string;
    arm: string;
    outcome: string;
    model: {
      provider: string;
      id: string;
    };
    cost?: {
      measured_provider_usage_usd?: number;
    };
  }>;
};

type ScannerReport = {
  scanners: Array<{
    id: string;
    status: string;
    exit_code?: number | null;
  }>;
};

export type SafetyCounts = {
  cases: number;
  accepted: number;
  prevented: number;
  cost?: number;
};

const reports = {
  publicReal: "benchmarks/real-repo-benchmark-public-local-review-2026-05-10.json",
  privateReal: "benchmarks/real-repo-benchmark-local-private-review-2026-05-10.json",
  falsePositive:
    "benchmarks/false-positive-benchmark-public-local-review-2026-05-10.json",
  cost: "benchmarks/cost-benchmark-public-local-review-2026-05-10.json",
  coverage:
    "benchmarks/coverage-calibration-benchmark-local-review-2026-05-10.json",
  expanded:
    "benchmarks/model-workflow-benchmark-expanded-local-review-2026-05-10.json",
  premium:
    "benchmarks/model-workflow-benchmark-premium-spotcheck-local-review-2026-05-10.json",
  scanners:
    "benchmarks/scanner-comparison-benchmark-local-review-2026-05-10.json",
};

function reportPath(file: string) {
  return resolve(process.cwd(), "..", file);
}

function readReport<T>(file: string): T {
  return JSON.parse(readFileSync(reportPath(file), "utf8")) as T;
}

function roundUsd(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

function normalizeRealRepo(report: RealRepoReport) {
  return {
    totalTasks: report.aggregate.total_tasks,
    controlUnsafeCommits: report.aggregate.control_unsafe_commits,
    yieldosPrevented: report.aggregate.yieldos_prevented,
    preventionRate: report.aggregate.yieldos_prevention_rate,
    p50Ms: report.aggregate.yieldos_p50_ms,
    p95Ms: report.aggregate.yieldos_p95_ms,
  };
}

function summarizeModelReport(report: ModelReport) {
  const evaluable = report.results.filter(
    (result) =>
      result.outcome === "accepted-by-yieldos" ||
      result.outcome === "unsafe-prevented-by-yieldos",
  );

  return {
    totalCases: report.aggregate.total_cases,
    completedCases: report.aggregate.completed_cases,
    evaluatedCases: evaluable.length,
    excludedPatchOutputs: report.results.length - evaluable.length,
    accepted: evaluable.filter((result) => result.outcome === "accepted-by-yieldos")
      .length,
    prevented: evaluable.filter(
      (result) => result.outcome === "unsafe-prevented-by-yieldos",
    ).length,
    costUsd: report.aggregate.model_cost_usd,
    p50Ms: report.aggregate.p50_ms,
    p95Ms: report.aggregate.p95_ms,
    repositories: report.repositories.map((repo) => ({
      id: repo.id,
      kind: repo.kind,
    })),
    byTask: countSafetyBy(evaluable, (result) => result.task_id),
    byModelArm: countSafetyBy(
      evaluable,
      (result) => `${result.model.provider}:${result.model.id} / ${result.arm}`,
      true,
    ),
  };
}

function countSafetyBy(
  results: ModelReport["results"],
  keyFn: (result: ModelReport["results"][number]) => string,
  includeCost = false,
) {
  const out: Record<string, SafetyCounts> = {};
  for (const result of results) {
    const key = keyFn(result);
    out[key] ||= { cases: 0, accepted: 0, prevented: 0, cost: 0 };
    out[key].cases += 1;
    out[key].cost = roundUsd(
      (out[key].cost || 0) + (result.cost?.measured_provider_usage_usd || 0),
    );
    if (result.outcome === "accepted-by-yieldos") out[key].accepted += 1;
    if (result.outcome === "unsafe-prevented-by-yieldos") out[key].prevented += 1;
  }

  if (!includeCost) {
    for (const row of Object.values(out)) delete row.cost;
  }
  return out;
}

function summarizeCoverageCalibration(report: CoverageReport) {
  return {
    totalCases: report.aggregate.total_cases,
    immediateCorrectDecisions: report.aggregate.immediate_correct_decisions,
    immediateCorrectDecisionRate: report.aggregate.immediate_correct_decision_rate,
    deeperReviewCandidates: report.aggregate.not_instantly_detected,
    deeperReviewRate: report.aggregate.not_instantly_detected_rate,
    prevented: report.aggregate.outcomes["immediately-prevented"] || 0,
    safe: report.aggregate.outcomes["accepted-safe-control"] || 0,
    deeper: report.aggregate.outcomes["not-instantly-detected"] || 0,
    byTask: Object.fromEntries(
      report.results.map((result) => [
        result.task_id,
        {
          track: result.track,
          outcome: result.outcome,
          description: result.description,
        },
      ]),
    ),
  };
}

export function getBenchmarkDashboardData() {
  const publicReal = readReport<RealRepoReport>(reports.publicReal);
  const privateReal = readReport<RealRepoReport>(reports.privateReal);
  const falsePositive = readReport<FalsePositiveReport>(reports.falsePositive);
  const cost = readReport<CostReport>(reports.cost);
  const coverage = readReport<CoverageReport>(reports.coverage);
  const expanded = readReport<ModelReport>(reports.expanded);
  const premium = readReport<ModelReport>(reports.premium);
  const scanners = readReport<ScannerReport>(reports.scanners);

  return {
    claim: {
      headline:
        "yieldOS turns risky agent output into an executable commit boundary",
      strongest:
        "Across public and private real-repo deterministic runs, every tested unsafe control commit landed without yieldOS and every matching yieldOS-gated commit was stopped before commit.",
      caveat:
        "Live model workflow results are narrower: admin-route auth prevention is strongly measured; SSRF and SQL live-model prevention remain coverage targets until their oracles are hardened.",
      evidenceBoundary:
        "This dashboard is local-review evidence for product calibration. Run npm run evidence:verify before using any report as public proof.",
    },
    deterministic: {
      public: normalizeRealRepo(publicReal),
      private: normalizeRealRepo(privateReal),
    },
    falsePositive: {
      total: falsePositive.aggregate.total_commits,
      allowed: falsePositive.aggregate.allowed,
      blocked: falsePositive.aggregate.blocked,
      unknown: falsePositive.aggregate.unknown,
      rate: falsePositive.aggregate.false_positive_rate,
    },
    cost: {
      basis: cost.cost_model_basis || "deterministic_real_repo",
      withoutYieldos: cost.costs.without_yieldos_cost_usd,
      withYieldos: cost.costs.with_yieldos_cost_usd,
      delta: cost.costs.delta_usd,
      baselinePerTask: cost.costs.baseline_agent_review_per_task_usd,
      escalatedPerTask: cost.costs.escalated_agent_review_per_task_usd,
      deterministicResolved: cost.measured.deterministic_resolved,
      agentEscalations: cost.measured.agent_escalation_candidates,
      safeControls: cost.measured.safe_controls || 0,
      note: cost.claim_safety.allowed_claim,
    },
    coverage: summarizeCoverageCalibration(coverage),
    live: {
      expanded: summarizeModelReport(expanded),
      premium: summarizeModelReport(premium),
    },
    scanners: scanners.scanners.map((scanner) => ({
      id: scanner.id,
      status: scanner.status,
      exitCode: scanner.exit_code ?? null,
    })),
  };
}

export type BenchmarkDashboardData = ReturnType<typeof getBenchmarkDashboardData>;
