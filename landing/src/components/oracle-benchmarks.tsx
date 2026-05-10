type ChartRow = {
  label: string;
  value: string;
  percent: number; // 0–100, controla el ancho de la barra
  barColor: string;
  swatchColor: string;
};

type Chart = {
  title: string;
  fill: string;
  stroke: string;
  text: string;
  textMuted: string;
  dot: string;
  trackColor: string;
  rows: ChartRow[];
};

// Color del agente (rojo, indicador de "costoso/lento")
const AGENT_BAR = "rgba(220, 38, 38, 0.9)";
const AGENT_SWATCH = "rgba(220, 38, 38, 1)";

const charts: Chart[] = [
  {
    title: "Time per check",
    fill: "rgba(99, 130, 224, 0.12)",
    stroke: "rgba(58, 92, 196, 0.45)",
    text: "rgb(58, 92, 196)",
    textMuted: "rgba(58, 92, 196, 0.7)",
    dot: "rgba(58, 92, 196, 0.28)",
    trackColor: "rgba(58, 92, 196, 0.18)",
    rows: [
      {
        label: "Claude Opus 4.7 (agent self-review)",
        value: "≈ 12 s",
        percent: 100,
        barColor: AGENT_BAR,
        swatchColor: AGENT_SWATCH,
      },
      {
        label: "yieldOS oracle",
        value: "150 ms",
        percent: 1.25,
        barColor: "rgba(58, 92, 196, 0.9)",
        swatchColor: "rgb(58, 92, 196)",
      },
    ],
  },
  {
    title: "Cost per check",
    fill: "rgba(34, 167, 110, 0.1)",
    stroke: "rgba(22, 140, 88, 0.5)",
    text: "rgb(22, 140, 88)",
    textMuted: "rgba(22, 140, 88, 0.7)",
    dot: "rgba(22, 140, 88, 0.28)",
    trackColor: "rgba(22, 140, 88, 0.18)",
    rows: [
      {
        label: "Claude Opus 4.7 (agent self-review)",
        value: "$0.60",
        percent: 100,
        barColor: AGENT_BAR,
        swatchColor: AGENT_SWATCH,
      },
      {
        label: "yieldOS oracle",
        value: "$0",
        percent: 0,
        barColor: "rgba(22, 140, 88, 0.9)",
        swatchColor: "rgb(22, 140, 88)",
      },
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

            <div className="mt-7 space-y-6 sm:mt-9 sm:space-y-7">
              {chart.rows.map((row) => (
                <div key={row.label}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        aria-hidden
                        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: row.swatchColor }}
                      />
                      <span
                        className="truncate font-mono text-[11px] font-semibold uppercase tracking-[0.12em] sm:text-xs"
                        style={{ color: chart.text }}
                      >
                        {row.label}
                      </span>
                    </div>
                    <span
                      className="shrink-0 font-mono text-xl font-semibold tracking-tight sm:text-2xl"
                      style={{ color: chart.text }}
                    >
                      {row.value}
                    </span>
                  </div>
                  <div
                    className="mt-2.5 h-2.5 w-full overflow-hidden rounded-full sm:mt-3 sm:h-3"
                    style={{ background: chart.trackColor }}
                  >
                    {row.percent > 0 ? (
                      <div
                        className="h-full rounded-full transition-[width] duration-700"
                        style={{
                          width: `${Math.max(row.percent, 1)}%`,
                          background: row.barColor,
                        }}
                      />
                    ) : null}
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
