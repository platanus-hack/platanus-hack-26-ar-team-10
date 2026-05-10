// =============================================================================
// HeroGridAccents — 3 clusters de 2×2 en escalera con animación de seguridad.
//
// Cada CELDA chiquita (1×1) dentro del 2×2 cicla independientemente:
//   azul (ok) → rojo (alerta) → titila rojo/verde (yieldOS arregla) → azul.
//
// Cada celda tiene su propio delay para que las "alertas" aparezcan al
// azar en distintas partes de los 3 cuadrados grandes.
//
// El borde perimetral + divisores cruzados (punteados) son estáticos.
// =============================================================================

const GRID = 72;
const SVG_COLS = 20; // 1440 px de ancho — alcanza para los clusters
const SVG_ROWS = 14; // 1008 px de alto — entra dentro de un hero 100vh típico
// Ciclo largo + alertas espaciadas. Cada celda tiene un delay distinto y
// los 12 delays están separados por 4 s para que JAMÁS haya dos celdas en
// alerta al mismo tiempo (la alerta dura ~2.4 s).
const CYCLE_SECONDS = 48;

type Cluster = {
  col: number; // columna del bottom-right del 2x2 (0 = pegado al borde derecho)
  row: number; // fila del bottom-right del 2x2 (0 = pegado al fondo)
  // Delays en segundos para cada celda interna (posiciones del 2x2):
  // [bottom-right, bottom-left, top-right, top-left]
  delays: [number, number, number, number];
};

// 3 clusters en escalera diagonal: de abajo-izquierda hacia arriba-derecha.
// Cada paso = 3 cols a la derecha (col más bajo) + 3 rows hacia arriba.
// Los 12 delays están separados ≥4 s entre sí para que NUNCA haya dos
// celdas en alerta al mismo tiempo (la alerta dura ~2.4 s).
// Staircase compacto que entra en cualquier viewport ≥ 1280 px sin clipping.
// Cols 5 → 3 → 1 (de abajo hacia arriba), step de 2 cols + 3 rows.
const CLUSTERS: Cluster[] = [
  {
    col: 5,
    row: 1,
    delays: [0, 16, 32, 8],
  },
  {
    col: 3,
    row: 4,
    delays: [28, 4, 20, 36],
  },
  {
    col: 1,
    row: 7,
    delays: [12, 40, 24, 44],
  },
];

const PERIMETER_STROKE = "rgba(58, 92, 196, 0.6)";
const DIVIDER_STROKE = "rgba(58, 92, 196, 0.55)";
const DIVIDER_DASH = "4 4";

export function HeroGridAccents() {
  const W = SVG_COLS * GRID;
  const H = SVG_ROWS * GRID;

  // El wrapper se posiciona absoluto al bottom-right del hero, con un width
  // responsive que GARANTIZA que el cluster nunca cruza al área del título:
  //   - max 2016 px (todo el SVG)
  //   - max viewport - 50rem (deja 800 px para título + padding cuando el
  //     viewport es chico/medio)
  //   - max 50vw - 10rem (deja la mitad del viewport - 160 px para que en
  //     pantallas anchas con el título centrado tampoco se choque)
  // overflow: hidden recorta el SVG si se pasa.
  return (
    <div
      aria-hidden
      className="hidden xl:block"
      style={{
        position: "absolute",
        right: 0,
        bottom: 0,
        width: `min(${W}px, calc(100vw - 50rem), calc(50vw - 10rem))`,
        height: "100%",
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 0,
      }}
    >
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      style={{
        position: "absolute",
        right: 0,
        bottom: 0,
      }}
    >
      {CLUSTERS.map((cluster, ci) => {
        // Top-left corner del 2x2 en SVG coords:
        const baseX = W - (cluster.col + 2) * GRID;
        const baseY = H - (cluster.row + 2) * GRID;
        const totalW = 2 * GRID;
        const totalH = 2 * GRID;

        // Las 4 celdas internas (orden: BR, BL, TR, TL):
        const cells = [
          { dx: GRID, dy: GRID, delay: cluster.delays[0] }, // bottom-right
          { dx: 0, dy: GRID, delay: cluster.delays[1] }, // bottom-left
          { dx: GRID, dy: 0, delay: cluster.delays[2] }, // top-right
          { dx: 0, dy: 0, delay: cluster.delays[3] }, // top-left
        ];

        return (
          <g key={ci}>
            {/* 4 celdas internas (fill animado + icons malware/tick) */}
            {cells.map((cell, ci2) => {
              const cellX = baseX + cell.dx;
              const cellY = baseY + cell.dy;
              const cx = cellX + GRID / 2;
              const cy = cellY + GRID / 2;
              const animStyle = {
                animationDelay: `-${cell.delay}s`,
                animationDuration: `${CYCLE_SECONDS}s`,
              };
              return (
                <g key={ci2}>
                  <rect
                    className="hero-grid-cell"
                    x={cellX}
                    y={cellY}
                    width={GRID}
                    height={GRID}
                    style={animStyle}
                  />
                  {/* Malware icon: X de 5 puntos, visible durante fase roja */}
                  <g
                    className="hero-icon-malware"
                    style={animStyle}
                    transform={`translate(${cx} ${cy})`}
                  >
                    <circle cx={-9} cy={-9} r={2.4} />
                    <circle cx={9} cy={-9} r={2.4} />
                    <circle cx={0} cy={0} r={2.4} />
                    <circle cx={-9} cy={9} r={2.4} />
                    <circle cx={9} cy={9} r={2.4} />
                  </g>
                  {/* Tick icon: 4 puntos en check, visible durante fase verde */}
                  <g
                    className="hero-icon-tick"
                    style={animStyle}
                    transform={`translate(${cx} ${cy})`}
                  >
                    <circle cx={-10} cy={0} r={2.4} />
                    <circle cx={-4} cy={6} r={2.4} />
                    <circle cx={2} cy={0} r={2.4} />
                    <circle cx={10} cy={-9} r={2.4} />
                  </g>
                </g>
              );
            })}
            {/* Borde perimetral del 2x2 (estático) */}
            <rect
              x={baseX}
              y={baseY}
              width={totalW}
              height={totalH}
              fill="none"
              stroke={PERIMETER_STROKE}
              strokeWidth={1}
            />
            {/* Divisor vertical punteado (entre cols del 2x2) */}
            <line
              x1={baseX + GRID}
              y1={baseY}
              x2={baseX + GRID}
              y2={baseY + totalH}
              stroke={DIVIDER_STROKE}
              strokeWidth={1}
              strokeDasharray={DIVIDER_DASH}
            />
            {/* Divisor horizontal punteado (entre rows del 2x2) */}
            <line
              x1={baseX}
              y1={baseY + GRID}
              x2={baseX + totalW}
              y2={baseY + GRID}
              stroke={DIVIDER_STROKE}
              strokeWidth={1}
              strokeDasharray={DIVIDER_DASH}
            />
          </g>
        );
      })}
    </svg>
    </div>
  );
}
