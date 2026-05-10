// Numbers come from benchmarks/local-review-summary-2026-05-10.md
// (real measured runs; not marketing fluff).

const headlineStats = [
  {
    value: "$0",
    label: "Per blocked commit",
    note: "deterministic, no model calls",
  },
  {
    value: "150 ms",
    label: "p95 hook latency",
    note: "real-repo benchmark",
  },
  {
    value: "100%",
    label: "Prevention rate",
    note: "16/16 unsafe commits blocked",
  },
  {
    value: "0 / 27",
    label: "False positives",
    note: "sampled benign commits",
  },
];

type CompareRow = {
  metric: string;
  agent: string;
  oracle: string;
};

const compareRows: CompareRow[] = [
  {
    metric: "Cost per risky review",
    agent: "$0.60",
    oracle: "$0",
  },
  {
    metric: "Time per check",
    agent: "9 – 20 s",
    oracle: "≤ 150 ms",
  },
  {
    metric: "Tokens spent",
    agent: "5k – 50k",
    oracle: "0",
  },
  {
    metric: "Same input → same answer",
    agent: "No",
    oracle: "Yes",
  },
];

export function OracleBenchmarks() {
  return (
    <div className="space-y-8 sm:space-y-10 lg:space-y-12">
      {/* Headline stats grid */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {headlineStats.map((stat) => (
          <article
            key={stat.label}
            className="rounded-lg border border-zinc-200 bg-white/85 p-4 sm:p-5"
          >
            <p className="font-mono text-3xl font-semibold leading-none tracking-tight text-zinc-950 sm:text-4xl lg:text-5xl">
              {stat.value}
            </p>
            <p className="mt-3 text-[13px] font-medium leading-5 text-zinc-900 sm:text-sm">
              {stat.label}
            </p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500 sm:text-[11px]">
              {stat.note}
            </p>
          </article>
        ))}
      </div>

      {/* Side-by-side comparison */}
      <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2">
        <article className="relative overflow-hidden rounded-lg border border-zinc-300 bg-white/70 p-5 sm:p-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500 sm:text-[11px]">
            Letting the agent self-review
          </p>
          <h3 className="mt-2 text-xl font-semibold tracking-tight text-zinc-950 sm:text-2xl">
            AI checking AI&rsquo;s code
          </h3>
          <ul className="mt-5 space-y-3 sm:mt-6">
            {compareRows.map((row) => (
              <li
                key={`agent-${row.metric}`}
                className="flex items-baseline justify-between gap-4 border-b border-zinc-200/80 pb-3 last:border-b-0 last:pb-0"
              >
                <span className="text-sm text-zinc-600">{row.metric}</span>
                <span className="font-mono text-sm font-semibold text-zinc-900">
                  {row.agent}
                </span>
              </li>
            ))}
          </ul>
        </article>

        <article
          className="relative overflow-hidden rounded-lg border p-5 sm:p-6"
          style={{
            background: "rgba(99, 130, 224, 0.08)",
            borderColor: "rgba(58, 92, 196, 0.5)",
          }}
        >
          <p
            className="font-mono text-[10px] uppercase tracking-[0.18em] sm:text-[11px]"
            style={{ color: "rgba(58, 92, 196, 0.85)" }}
          >
            yieldOS oracle
          </p>
          <h3
            className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl"
            style={{ color: "rgb(58, 92, 196)" }}
          >
            Deterministic checks
          </h3>
          <ul className="mt-5 space-y-3 sm:mt-6">
            {compareRows.map((row) => (
              <li
                key={`oracle-${row.metric}`}
                className="flex items-baseline justify-between gap-4 border-b pb-3 last:border-b-0 last:pb-0"
                style={{ borderColor: "rgba(58, 92, 196, 0.2)" }}
              >
                <span
                  className="text-sm"
                  style={{ color: "rgba(58, 92, 196, 0.75)" }}
                >
                  {row.metric}
                </span>
                <span
                  className="font-mono text-sm font-semibold"
                  style={{ color: "rgb(40, 65, 145)" }}
                >
                  {row.oracle}
                </span>
              </li>
            ))}
          </ul>
        </article>
      </div>

      {/* Bottom line callout */}
      <div className="rounded-lg border border-zinc-200 bg-[#0e0e10] p-5 text-white sm:p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-8">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500 sm:text-[11px]">
              Bottom line on the calibration set
            </p>
            <p className="mt-3 text-balance text-base leading-7 text-zinc-200 sm:text-lg sm:leading-8">
              On 12 cases (7 risky, 3 safe, 2 deeper-review): without yieldOS the
              run costs <strong className="text-white">$5.40</strong> in model
              review. With yieldOS only the 2 deeper cases reach the agent
              &mdash; total spend{" "}
              <strong className="text-white">$0.72</strong>.
            </p>
          </div>
          <div className="flex flex-col items-start gap-1 sm:items-end">
            <p className="font-mono text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              −87%
            </p>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500 sm:text-[11px]">
              cost vs raw model review
            </p>
          </div>
        </div>
      </div>

      <p className="text-xs leading-5 text-zinc-500 sm:text-[13px]">
        Numbers from{" "}
        <code className="font-mono text-zinc-700">
          benchmarks/local-review-summary-2026-05-10.md
        </code>{" "}
        in this repo. Local-review evidence; should be regenerated from a clean
        checkout before external publication.
      </p>
    </div>
  );
}
