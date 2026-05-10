type Layer = {
  number: string;
  title: string;
  tags: string[];
  fill: string;
  stroke: string;
  text: string;
  textMuted: string;
  dot: string;
};

const layers: Layer[] = [
  {
    number: "01",
    title: "External defense",
    tags: ["packages", "agents", "MCPs", "skills", "instructions"],
    fill: "rgba(99, 130, 224, 0.16)",
    stroke: "rgba(58, 92, 196, 0.45)",
    text: "rgb(58, 92, 196)",
    textMuted: "rgba(58, 92, 196, 0.7)",
    dot: "rgba(58, 92, 196, 0.28)",
  },
  {
    number: "02",
    title: "Internal defense",
    tags: ["pre-commit", "pre-push", "CI", "oracle"],
    fill: "rgba(34, 167, 110, 0.14)",
    stroke: "rgba(22, 140, 88, 0.5)",
    text: "rgb(22, 140, 88)",
    textMuted: "rgba(22, 140, 88, 0.7)",
    dot: "rgba(22, 140, 88, 0.28)",
  },
];

export function DefenseLayers() {
  return (
    <aside aria-label="yieldOS defense layers" className="w-full">
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500 sm:text-[11px]">
        yieldOS architecture
      </p>
      <div className="mt-4 space-y-3 sm:mt-5">
        {layers.map((layer) => (
          <article
            key={layer.number}
            className="relative overflow-hidden rounded-lg border"
            style={{
              borderColor: layer.stroke,
              background: layer.fill,
            }}
          >
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                backgroundImage: `radial-gradient(circle, ${layer.dot} 1.4px, transparent 1.4px)`,
                backgroundSize: "10px 10px",
                opacity: 0.55,
              }}
            />
            <div className="relative flex flex-col gap-2 px-5 py-4 sm:px-6 sm:py-5">
              <div className="flex items-baseline gap-3">
                <span
                  className="font-mono text-[11px] uppercase tracking-[0.18em] sm:text-xs"
                  style={{ color: layer.textMuted }}
                >
                  {layer.number}
                </span>
                <h3
                  className="font-mono text-base font-bold uppercase tracking-[0.06em] sm:text-lg"
                  style={{ color: layer.text }}
                >
                  {layer.title}
                </h3>
              </div>
              <p
                className="font-mono text-[11px] uppercase tracking-[0.14em] sm:text-xs"
                style={{ color: layer.textMuted }}
              >
                {layer.tags.join(" · ")}
              </p>
            </div>
          </article>
        ))}
      </div>
    </aside>
  );
}
