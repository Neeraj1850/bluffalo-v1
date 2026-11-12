type LineChartProps = {
  values: number[];
  height?: number;
  /** Dashed = simulated / provisional, solid = live. */
  dashed?: boolean;
  /** Read by screen readers, e.g. "Shark price over the week". */
  label: string;
  className?: string;
};

const W = 100;

/** SVG path through `values` inside a w×h box with `pad` inset. Flat or single series sit mid-height. */
export function linePath(values: number[], w: number, h: number, pad = 0): string {
  const pts = values.filter(Number.isFinite);
  if (pts.length === 0) return "";
  const min = Math.min(...pts);
  const span = Math.max(...pts) - min;
  const y = (v: number) => (span === 0 ? h / 2 : pad + (1 - (v - min) / span) * (h - 2 * pad));
  if (pts.length === 1) return `M${pad},${y(pts[0])}L${w - pad},${y(pts[0])}`;
  const step = (w - 2 * pad) / (pts.length - 1);
  return pts.map((v, i) => `${i ? "L" : "M"}${+(pad + i * step).toFixed(2)},${+y(v).toFixed(2)}`).join("");
}

/** Monochrome sparkline/line chart. No axes; min/max labels when tall enough. */
export function LineChart({ values, height = 48, dashed = false, label, className }: LineChartProps) {
  const pts = values.filter(Number.isFinite);
  const pad = 3;
  const d = linePath(pts, W, height, pad);
  const showLabels = height > 60 && pts.length > 0;
  // End dot: the y of the path's last point.
  const endY = d ? Number(d.split(",").at(-1)) : 0;
  return (
    <div className={`relative ${className ?? ""}`} style={{ height }}>
      <svg role="img" aria-label={label} viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="block h-full w-full overflow-visible">
        {d && (
          <path
            d={d}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeDasharray={dashed ? "4 3" : undefined}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
          />
        )}
        {pts.length > 1 && (
          <path d={`M${W - pad},${endY}l0,0`} stroke="currentColor" strokeWidth={6} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      {showLabels && (
        <>
          <span className="absolute right-0 top-0 font-mono text-[10px] text-[var(--muted)]">{Math.max(...pts).toFixed(1)}</span>
          <span className="absolute bottom-0 right-0 font-mono text-[10px] text-[var(--muted)]">{Math.min(...pts).toFixed(1)}</span>
        </>
      )}
    </div>
  );
}
