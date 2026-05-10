import Link from "next/link";
import type { Metadata } from "next";

import {
  type BenchmarkDashboardData,
  type SafetyCounts,
  getBenchmarkDashboardData,
} from "@/lib/benchmark-dashboard-data";

type SegmentKey = "accepted" | "prevented" | "deeper" | "blocked";

type ChartRow = {
  label: string;
  total: number;
  displayValue?: number | string;
} & Partial<Record<SegmentKey, number>>;

const segmentStyles: Record<SegmentKey, { label: string; className: string }> = {
  accepted: {
    label: "Accepted",
    className: "bg-[#2662d9]",
  },
  prevented: {
    label: "Prevented",
    className: "bg-[#12915a]",
  },
  deeper: {
    label: "Deeper review",
    className: "bg-[#bf7b12]",
  },
  blocked: {
    label: "Blocked",
    className: "bg-[#c83f39]",
  },
};

export const metadata: Metadata = {
  title: "yieldOS benchmarks",
  description:
    "Presentation dashboard for yieldOS local-review benchmark evidence, cost routing, false-positive replay, and live model workflow results.",
};

export default function BenchmarksPage() {
  const data = getBenchmarkDashboardData();
  const totalUnsafe =
    data.deterministic.public.totalTasks + data.deterministic.private.totalTasks;
  const totalStopped =
    data.deterministic.public.yieldosPrevented +
    data.deterministic.private.yieldosPrevented;

  return (
    <main className="min-h-dvh bg-[#f8f6f1] text-[#171717]">
      <header className="border-b border-[#ded9cf] bg-[#151515] text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link
            href="/"
            className="rounded-sm text-lg font-semibold leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/45"
          >
            yieldOS
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/#benchmarks"
              className="rounded-md px-3 py-2 text-sm font-medium text-zinc-300 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/45"
            >
              Landing section
            </Link>
            <Link
              href="/oracle-demo"
              className="rounded-md border border-white/15 bg-white/[0.06] px-3 py-2 text-sm font-medium text-zinc-200 transition hover:bg-white/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/45"
            >
              Oracle demo
            </Link>
          </div>
        </div>
      </header>

      <section className="bg-[#151515] text-white">
        <div className="mx-auto grid min-h-[calc(100dvh-65px)] max-w-7xl content-between gap-10 px-5 py-10 sm:px-8 sm:py-14 lg:py-16">
          <div className="max-w-5xl">
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[#d8d2c7]">
              yieldOS benchmark dashboard
            </p>
            <h1 className="mt-5 max-w-5xl text-5xl font-semibold leading-[0.98] tracking-tight text-white sm:text-6xl lg:text-7xl">
              {data.claim.headline}
            </h1>
            <p className="mt-6 max-w-4xl text-base leading-7 text-[#d8d2c7] sm:text-lg sm:leading-8">
              {data.claim.strongest} The calibration layer keeps the important
              nuance visible: not every realistic security issue is an instant
              deterministic stop today.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric value={`${totalStopped}/${totalUnsafe}`} label="Known unsafe replayed commits stopped before commit" />
            <Metric
              value={formatPercent(data.coverage.immediateCorrectDecisionRate)}
              label="Calibration cases handled immediately and correctly"
            />
            <Metric
              value={formatPercent(data.coverage.deeperReviewRate)}
              label="Realistic deeper-review candidates kept visible"
            />
            <Metric
              value={`${data.falsePositive.blocked}/${data.falsePositive.total}`}
              label="Benign public commits blocked in false-positive replay"
            />
          </div>
        </div>
      </section>

      <PresentationSection eyebrow="Benchmark story" title="Strong guardrail, honest limits">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.08fr_0.92fr]">
          <Callout tone="green">
            <strong>Defensible claim:</strong> yieldOS stops known unsafe
            patterns before commit and lets safe controls pass. It is a workflow
            harness, not a claim that all possible bugs disappear.
          </Callout>
          <Callout tone="amber">
            <strong>Honest limit:</strong> the calibration set keeps a small
            slice of deeper cases that should become future oracles or
            agent-assisted review escalations.
          </Callout>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[1.08fr_0.92fr]">
          <p className="text-base leading-7 text-[#66635d]">
            The presentation should lead with prevention and friction: unsafe
            changes that would have landed without yieldOS are blocked, benign
            commits are allowed, and live model runs show the guardrail operating
            at the point where generated code would enter the repo.
          </p>
          <p className="text-sm leading-6 text-[#66635d]">
            {data.claim.evidenceBoundary} This makes the benchmark more
            credible: yieldOS has a measured safety boundary today and a clear
            path to expand coverage tomorrow.
          </p>
        </div>
        <StackedChart
          className="mt-7"
          title="Coverage calibration"
          subtitle="Balanced cases: prevent known risks, allow safe work, identify deeper review"
          rows={[
            {
              label: "Calibration set",
              prevented: data.coverage.prevented,
              accepted: data.coverage.safe,
              deeper: data.coverage.deeper,
              total: data.coverage.totalCases,
            },
          ]}
          segments={["prevented", "accepted", "deeper"]}
        />
      </PresentationSection>

      <PresentationSection eyebrow="Core evidence" title="Prevention without broad false positives">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.08fr_0.92fr]">
          <StackedChart
            title="Deterministic replay"
            subtitle="Known unsafe commits in disposable real-repo clones"
            rows={[
              {
                label: "Public repos",
                prevented: data.deterministic.public.yieldosPrevented,
                total: data.deterministic.public.totalTasks,
              },
              {
                label: "Local/private repos",
                prevented: data.deterministic.private.yieldosPrevented,
                total: data.deterministic.private.totalTasks,
              },
            ]}
            segments={["prevented"]}
          />
          <CostChart data={data} />
        </div>
        <StackedChart
          className="mt-5"
          title="False-positive replay"
          subtitle="Benign public commits"
          rows={[
            {
              label: "Allowed benign commits",
              accepted: data.falsePositive.allowed,
              total: data.falsePositive.total,
            },
            {
              label: "Blocked benign commits",
              blocked: data.falsePositive.blocked,
              total: data.falsePositive.total,
              displayValue: data.falsePositive.blocked,
            },
          ]}
          segments={["accepted", "blocked"]}
        />
        <p className="mt-5 text-xs leading-5 text-[#66635d] sm:text-sm sm:leading-6">
          Dollar values are assumption-based and intentionally small-scope. They
          model avoided review passes for this benchmark set, not total
          company-wide savings.
        </p>
      </PresentationSection>

      <PresentationSection eyebrow="Live model workflow" title="Expanded frontier slice: outcomes by task">
        <p className="max-w-4xl text-base leading-7 text-[#66635d]">
          Safety charts include only evaluable model patches. The point is not
          to rank model intelligence; it is to show what happens when generated
          code reaches an executable commit boundary.
        </p>
        <StackedChart
          className="mt-7"
          title="Expanded run outcomes by task"
          subtitle="Evaluable generated patches only"
          rows={safetyRows(data.live.expanded.byTask)}
          segments={["accepted", "prevented"]}
        />
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            value={String(data.live.expanded.evaluatedCases)}
            label="Evaluable generated patches in expanded run"
            light
          />
          <Metric
            value={String(data.live.expanded.prevented)}
            label="Generated changes stopped by yieldOS"
            light
          />
          <Metric
            value={String(data.live.expanded.accepted)}
            label="Generated changes accepted by yieldOS"
            light
          />
          <Metric
            value={formatMoney(data.live.expanded.costUsd)}
            label="Measured provider usage in the expanded run"
            light
          />
        </div>
      </PresentationSection>

      <PresentationSection eyebrow="Model economics" title="More expensive models still need a boundary">
        <ModelTable rows={data.live.expanded.byModelArm} />
        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[1.08fr_0.92fr]">
          <StackedChart
            title="Premium spotcheck outcomes"
            subtitle="Evaluable patches on pinned express"
            rows={safetyRows(data.live.premium.byModelArm)}
            segments={["accepted", "prevented"]}
          />
          <div>
            <Metric
              value={duration(data.live.premium.p95Ms)}
              label="Premium spotcheck p95 runtime"
              light
            />
            <p className="mt-5 text-sm leading-6 text-[#66635d]">
              Frontier models can be slower and more expensive, so safety has to
              be enforced at the workflow boundary instead of assumed from model
              choice.
            </p>
            <p className="mt-4 text-xs leading-5 text-[#66635d]">
              Provider costs use measured token usage for live runs and the
              assumptions file for review-cost comparison. Refresh provider
              pricing before using this as public billing proof.
            </p>
          </div>
        </div>
      </PresentationSection>
    </main>
  );
}

function PresentationSection({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-[#ded9cf] bg-[#f8f6f1]">
      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14 lg:py-16">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-[#66635d]">
          {eyebrow}
        </p>
        <h2 className="mt-3 max-w-4xl text-3xl font-semibold leading-tight tracking-tight text-[#171717] sm:text-5xl">
          {title}
        </h2>
        <div className="mt-7">{children}</div>
      </div>
    </section>
  );
}

function Metric({
  value,
  label,
  light = false,
}: {
  value: string;
  label: string;
  light?: boolean;
}) {
  return (
    <div
      className={
        light
          ? "rounded-lg border border-[#ded9cf] bg-white p-5"
          : "rounded-lg border border-white/15 bg-white/[0.07] p-5"
      }
    >
      <strong
        className={
          light
            ? "block text-3xl font-semibold leading-none text-[#171717]"
            : "block text-3xl font-semibold leading-none text-white"
        }
      >
        {value}
      </strong>
      <span
        className={
          light
            ? "mt-3 block text-sm leading-5 text-[#66635d]"
            : "mt-3 block text-sm leading-5 text-[#d8d2c7]"
        }
      >
        {label}
      </span>
    </div>
  );
}

function Callout({
  tone,
  children,
}: {
  tone: "green" | "amber";
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "green"
      ? "border-l-[#12915a] bg-[#eef7f2]"
      : "border-l-[#bf7b12] bg-[#fff6e7]";

  return (
    <div className={`rounded-md border-l-4 px-5 py-4 text-sm leading-6 text-[#3d3a36] ${toneClass}`}>
      {children}
    </div>
  );
}

function StackedChart({
  title,
  subtitle,
  rows,
  segments,
  className = "",
}: {
  title: string;
  subtitle: string;
  rows: ChartRow[];
  segments: SegmentKey[];
  className?: string;
}) {
  const max = Math.max(1, ...rows.map((row) => row.total));

  return (
    <div className={`rounded-lg border border-[#ded9cf] bg-white p-5 ${className}`}>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <h3 className="text-base font-bold text-[#171717]">{title}</h3>
        <p className="max-w-md text-xs font-medium leading-5 text-[#66635d] sm:text-right">
          {subtitle}
        </p>
      </div>

      <div className="mt-5 space-y-3">
        {rows.map((row) => (
          <div
            key={row.label}
            className="grid grid-cols-[minmax(90px,170px)_1fr_48px] items-center gap-3 text-sm text-[#3d3a36] sm:grid-cols-[210px_1fr_72px]"
          >
            <div className="truncate">{row.label}</div>
            <div className="flex h-6 overflow-hidden rounded bg-[#eee9df]">
              {segments.map((segment) => {
                const value = row[segment] || 0;
                if (!value) return null;
                return (
                  <div
                    key={segment}
                    className={segmentStyles[segment].className}
                    style={{ width: `${Math.max((value / max) * 100, 1)}%` }}
                    title={`${segmentStyles[segment].label}: ${value}`}
                  />
                );
              })}
            </div>
            <div className="text-right font-mono text-xs text-[#66635d]">
              {row.displayValue ?? row.total}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-xs text-[#66635d]">
        {segments.map((segment) => (
          <span key={segment} className="inline-flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-sm ${segmentStyles[segment].className}`}
            />
            {segmentStyles[segment].label}
          </span>
        ))}
      </div>
    </div>
  );
}

function CostChart({ data }: { data: BenchmarkDashboardData }) {
  const max = Math.max(data.cost.withoutYieldos, data.cost.withYieldos, 1);
  const rows = [
    {
      label: "Without yieldOS",
      value: data.cost.withoutYieldos,
      className: "bg-[#c83f39]",
    },
    {
      label: "With yieldOS",
      value: data.cost.withYieldos,
      className: "bg-[#12915a]",
    },
  ];

  return (
    <div className="rounded-lg border border-[#ded9cf] bg-white p-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <h3 className="text-base font-bold text-[#171717]">Review cost route</h3>
        <p className="max-w-md text-xs font-medium leading-5 text-[#66635d] sm:text-right">
          Calibration set: deterministic stop plus agent-assisted escalation
        </p>
      </div>

      <div className="mt-5 space-y-4">
        {rows.map((row) => (
          <div
            key={row.label}
            className="grid grid-cols-[120px_1fr_58px] items-center gap-3 text-sm text-[#3d3a36] sm:grid-cols-[150px_1fr_74px]"
          >
            <span>{row.label}</span>
            <div className="h-8 overflow-hidden rounded bg-[#eee9df]">
              <div
                className={`h-full ${row.className}`}
                style={{ width: `${Math.max((row.value / max) * 100, 1)}%` }}
              />
            </div>
            <span className="text-right font-mono text-xs text-[#66635d]">
              {formatMoney(row.value)}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-5 text-xs leading-5 text-[#66635d]">
        Delta: {formatMoney(data.cost.delta)} across this calibration model.
        This models routing cost; it does not claim the deeper-review cases were
        automatically repaired.
      </p>
    </div>
  );
}

function ModelTable({ rows }: { rows: Record<string, SafetyCounts> }) {
  return (
    <div className="overflow-hidden rounded-lg border border-[#ded9cf] bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[#ded9cf] text-left font-mono text-[11px] uppercase tracking-[0.08em] text-[#66635d]">
              <th className="px-4 py-3 font-semibold">Model arm</th>
              <th className="px-4 py-3 text-right font-semibold">Cases</th>
              <th className="px-4 py-3 text-right font-semibold">Accepted</th>
              <th className="px-4 py-3 text-right font-semibold">Prevented</th>
              <th className="px-4 py-3 text-right font-semibold">Provider cost</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(rows).map(([label, row]) => (
              <tr key={label} className="border-b border-[#eee9df] last:border-0">
                <td className="px-4 py-3 text-[#3d3a36]">{label}</td>
                <td className="px-4 py-3 text-right font-mono text-xs text-[#66635d]">
                  {row.cases}
                </td>
                <td className="px-4 py-3 text-right font-mono text-xs text-[#66635d]">
                  {row.accepted}
                </td>
                <td className="px-4 py-3 text-right font-mono text-xs text-[#66635d]">
                  {row.prevented}
                </td>
                <td className="px-4 py-3 text-right font-mono text-xs text-[#66635d]">
                  {formatMoney(row.cost || 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function safetyRows(rows: Record<string, SafetyCounts>): ChartRow[] {
  return Object.entries(rows).map(([label, row]) => ({
    label,
    accepted: row.accepted,
    prevented: row.prevented,
    total: row.cases,
  }));
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatMoney(value: number) {
  return `$${value.toFixed(value >= 10 ? 0 : 2)}`;
}

function duration(ms: number) {
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}
