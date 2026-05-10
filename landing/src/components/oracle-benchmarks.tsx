type ChartRow = {
  label: string;
  value: string;
  percent: number; // 0–100, controls bar width
};

type Chart = {
  title: string;
  fill: string;
  stroke: string;
  text: string;
  textMuted: string;
  dot: string;
  barAccent: string;
  barMuted: string;
  rows: ChartRow[];
};

const charts: Chart[] = [
  {
    title: "Time per check",
    fill: "rgba(99, 130, 224, 0.12)",
    stroke: "rgba(58, 92, 196, 0.45)",
    text: "rgb(58, 92, 196)",
    textMuted: "rgba(58, 92, 196, 0.7)",
    dot: "rgba(58, 92, 196, 0.28)",
    barAccent: "rgba(58, 92, 196, 0.85)",
    barMuted: "rgba(58, 92, 196, 0.25)",
    rows: [
      { label: "Agent self-review", value: "≈ 12 s", percent: 100 },
      { label: "yieldOS oracle", value: "150 ms", percent: 1.25 },
    ],
  },
  {
    title: "Cost per check",
    fill: "rgba(34, 167, 110, 0.1)",
    stroke: "rgba(22, 140, 88, 0.5)",
    text: "rgb(22, 140, 88)",
    textMuted: "rgba(22, 140, 88, 0.7)",
    dot: "rgba(22, 140, 88, 0.28)",
    barAccent: "rgba(22, 140, 88, 0.85)",
    barMuted: "rgba(22, 140, 88, 0.25)",
    rows: [
      { label: "Agent self-review", value: "$0.60", percent: 100 },
      { label: "yieldOS oracle", value: "$0", percent: 0 },
    ],
  },
];

export function OracleBenchmarks() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-2">
      {charts.map((chart) => (
        <article
          key={chart.title}
          className="relative overflow-hidden rounded-lg border"
          style={{
            borderColor: chart.stroke,
            background: chart.fill,
          }}
        >
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              backgroundImage: `radial-gradient(circle, ${chart.dot} 1.4px, transparent 1.4px)`,
              backgroundSize: "10px 10px",
              opacity: 0.55,
            }}
          />
          <div className="relative px-5 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
            <h3
              className="font-mono text-sm font-bold uppercase tracking-[0.16em] sm:text-base"
              style={{ color: chart.text }}
            >
              {chart.title}
            </h3>

            <div className="mt-6 space-y-5 sm:mt-8 sm:space-y-6">
              {chart.rows.map((row, idx) => (
                <div key={row.label}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span
                      className="font-mono text-[11px] uppercase tracking-[0.14em] sm:text-xs"
                      style={{ color: chart.textMuted }}
                    >
                      {row.label}
                    </span>
                    <span
                      className="font-mono text-xl font-semibold tracking-tight sm:text-2xl"
                      style={{ color: chart.text }}
                    >
                      {row.value}
                    </span>
                  </div>
                  <div
                    className="mt-2 h-2.5 w-full overflow-hidden rounded-full sm:mt-3 sm:h-3"
                    style={{ background: chart.barMuted }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(row.percent, 0.5)}%`,
                        background: idx === 0 ? chart.barAccent : chart.text,
                        opacity: row.percent === 0 ? 0 : 1,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
