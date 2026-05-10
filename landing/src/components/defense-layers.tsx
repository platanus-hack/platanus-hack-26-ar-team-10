type Layer = {
  number: string;
  title: string;
  tags: string;
  fill: string;
  stroke: string;
  text: string;
  dot: string;
};

const layers: Layer[] = [
  {
    number: "01",
    title: "External defense",
    tags: "packages · agents · MCPs · skills · instructions",
    fill: "rgba(99, 130, 224, 0.16)",
    stroke: "rgba(58, 92, 196, 0.45)",
    text: "rgb(58, 92, 196)",
    dot: "rgba(58, 92, 196, 0.28)",
  },
  {
    number: "02",
    title: "Internal defense",
    tags: "pre-commit · pre-push · CI · oracle",
    fill: "rgba(34, 167, 110, 0.14)",
    stroke: "rgba(22, 140, 88, 0.5)",
    text: "rgb(22, 140, 88)",
    dot: "rgba(22, 140, 88, 0.28)",
  },
];

export function DefenseLayers() {
  return (
    <aside aria-label="yieldOS defense layers" className="w-full">
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500 sm:text-[11px]">
        yieldOS architecture
      </p>
      <div className="mt-4 space-y-3 sm:mt-5 sm:space-y-4">
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
              }}
            />
            <div className="relative flex h-40 items-end justify-between gap-4 px-5 pb-4 pt-5 sm:h-48 sm:px-6 sm:pb-5">
              <span
                className="font-mono text-xs uppercase tracking-[0.16em] sm:text-sm"
                style={{ color: layer.text }}
              >
                <span className="opacity-60">{layer.number} /</span>{" "}
                <strong className="font-semibold">{layer.title}</strong>
              </span>
              <span
                className="hidden font-mono text-[10px] uppercase tracking-[0.14em] opacity-75 sm:inline sm:text-xs"
                style={{ color: layer.text }}
              >
                {layer.tags}
              </span>
            </div>
          </article>
        ))}
      </div>
    </aside>
  );
}
