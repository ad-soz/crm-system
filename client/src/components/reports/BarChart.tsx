import { compactCurrency, niceCeil } from '@/lib/reports';

export interface ChartSeries {
  name: string;
  values: number[];
  /** A theme colour name: it follows the person's appearance settings and dark mode. */
  colour: 'primary' | 'success' | 'destructive' | 'warning' | 'info';
}

const WIDTH = 640;
const HEIGHT = 240;
const PAD = { top: 12, right: 12, bottom: 28, left: 52 };
const GRID_LINES = 4;

/**
 * Grouped bar chart drawn in plain SVG (no charting library, to keep the app
 * light). It is described in words for screen readers, uses theme colours, and
 * is meant to sit above a table that shows exactly the same figures.
 */
export function BarChart({
  title,
  categories,
  series,
  format = compactCurrency,
  describe,
}: {
  title: string;
  categories: string[];
  series: ChartSeries[];
  /** How a value is written on the axis. */
  format?: (n: number) => string;
  /** How a value is written when read aloud and in the hover text. */
  describe?: (n: number) => string;
}) {
  const say = describe ?? format;
  const all = series.flatMap((s) => s.values);
  const hasData = all.some((v) => v > 0);
  const top = niceCeil(Math.max(0, ...all));

  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const groupW = categories.length ? plotW / categories.length : plotW;
  const barGap = 3;
  const barW = Math.max(4, Math.min(34, (groupW * 0.72) / Math.max(1, series.length) - barGap));
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;

  const summary = categories
    .map((c, i) => `${c}: ${series.map((s) => `${s.name} ${say(s.values[i] ?? 0)}`).join(', ')}`)
    .join('. ');

  if (!hasData) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground" role="note">
        {title}: nothing to show for this period.
      </p>
    );
  }

  return (
    <figure className="space-y-2">
      {series.length > 1 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-hidden>
          {series.map((s) => (
            <li key={s.name} className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: `hsl(var(--${s.colour}))` }} />
              {s.name}
            </li>
          ))}
        </ul>
      )}
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" role="img" aria-label={`${title}. ${summary}`}>
        {Array.from({ length: GRID_LINES + 1 }, (_, i) => {
          const value = (top / GRID_LINES) * i;
          return (
            <g key={i}>
              <line
                x1={PAD.left}
                x2={WIDTH - PAD.right}
                y1={y(value)}
                y2={y(value)}
                stroke="hsl(var(--border))"
                strokeWidth={1}
              />
              <text x={PAD.left - 8} y={y(value) + 4} textAnchor="end" fontSize={11} fill="hsl(var(--muted-foreground))">
                {format(value)}
              </text>
            </g>
          );
        })}

        {categories.map((c, ci) => {
          const groupX = PAD.left + ci * groupW + (groupW - series.length * (barW + barGap) + barGap) / 2;
          return (
            <g key={c}>
              {series.map((s, si) => {
                const v = s.values[ci] ?? 0;
                const h = (v / top) * plotH;
                return (
                  <rect
                    key={s.name}
                    x={groupX + si * (barW + barGap)}
                    y={y(v)}
                    width={barW}
                    height={Math.max(0, h)}
                    rx={2}
                    fill={`hsl(var(--${s.colour}))`}
                  >
                    <title>{`${c}, ${s.name}: ${say(v)}`}</title>
                  </rect>
                );
              })}
              <text
                x={PAD.left + ci * groupW + groupW / 2}
                y={HEIGHT - 8}
                textAnchor="middle"
                fontSize={11}
                fill="hsl(var(--muted-foreground))"
              >
                {c}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
