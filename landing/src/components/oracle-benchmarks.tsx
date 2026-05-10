type Row = {
  metric: string;
  value: string;
  percent: number; // 0–100, escala compartida entre las dos cards
};

type Card = {
  title: string;
  fill: string;
  stroke: string;
  text: string;
  textMuted: string;
  dot: string;
  trackColor: string;
  barColor: string;
  rows: Row[];
};

const cards: Card[] = [
  {
    title: "Oracle",
    fill: "rgba(34, 167, 110, 0.1)",
    stroke: "rgba(22, 140, 88, 0.5)",
    text: "rgb(22, 140, 88)",
    textMuted: "rgba(22, 140, 88, 0.7)",
    dot: "rgba(22, 140, 88, 0.28)",
    trackColor: "rgba(22, 140, 88, 0.18)",
    barColor: "rgba(22, 140, 88, 0.9)",
    rows: [
      { metric: "Time per check", value: "150 ms", percent: 1.25 },
      { metric: "Cost per check", value: "$0", percent: 0 },
    ],
  },
  {
    title: "Claude Opus 4.7",
    fill: "rgba(220, 38, 38, 0.08)",
    stroke: "rgba(220, 38, 38, 0.45)",
    text: "rgb(185, 28, 28)",
    textMuted: "rgba(185, 28, 28, 0.7)",
    dot: "rgba(220, 38, 38, 0.28)",
    trackColor: "rgba(220, 38, 38, 0.16)",
    barColor: "rgba(220, 38, 38, 0.9)",
    rows: [
      { metric: "Time per check", value: "≈ 12 s", percent: 100 },
      { metric: "Cost per check", value: "$0.60", percent: 100 },
    ],
  },
];

export function OracleBenchmarks() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-2">
      {cards.map((card) => (
        <article
          key={card.title}
          className="relative overflow-hidden rounded-lg border"
          style={{
            borderColor: card.stroke,
            background: card.fill,
          }}
        >
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              backgroundImage: `radial-gradient(circle, ${card.dot} 1.4px, transparent 1.4px)`,
              backgroundSize: "10px 10px",
              opacity: 0.55,
            }}
          />
          <div className="relative px-5 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
            <h3
              className="font-mono text-sm font-bold uppercase tracking-[0.16em] sm:text-base"
              style={{ color: card.text }}
            >
              {card.title}
            </h3>

            <div className="mt-7 space-y-6 sm:mt-9 sm:space-y-7">
              {card.rows.map((row) => (
                <div key={row.metric}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span
                      className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] sm:text-xs"
                      style={{ color: card.textMuted }}
                    >
                      {row.metric}
                    </span>
                    <span
                      className="font-mono text-xl font-semibold tracking-tight sm:text-2xl"
                      style={{ color: card.text }}
                    >
                      {row.value}
                    </span>
                  </div>
                  <div
                    className="mt-2.5 h-2.5 w-full overflow-hidden rounded-full sm:mt-3 sm:h-3"
                    style={{ background: card.trackColor }}
                  >
                    {row.percent > 0 ? (
                      <div
                        className="h-full rounded-full transition-[width] duration-700"
                        style={{
                          width: `${Math.max(row.percent, 1)}%`,
                          background: card.barColor,
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
