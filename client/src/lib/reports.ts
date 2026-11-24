/** Formatting helpers for the Reports page. */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** '2026-11' -> 'Nov 2026'. Done by hand so the label never shifts with time zones. */
export function monthLabel(key: string): string {
  const [year, month] = key.split('-').map(Number);
  if (!year || !month || month < 1 || month > 12) return key;
  return `${MONTHS[month - 1]} ${year}`;
}

/** '2026-11' -> 'Nov', for tight chart axes (the year is added when it changes). */
export function shortMonthLabel(key: string, previousKey?: string): string {
  const [year, month] = key.split('-').map(Number);
  if (!year || !month || month < 1 || month > 12) return key;
  const showYear = !previousKey || previousKey.slice(0, 4) !== String(year);
  return showYear ? `${MONTHS[month - 1]} ${String(year).slice(2)}` : MONTHS[month - 1];
}

/** 0 -> 'today', 1 -> '1 day', 40 -> '40 days'. */
export function formatDays(days: number): string {
  if (days <= 0) return 'today';
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

/** Axis labels: 950 -> '$950', 12500 -> '$12.5k', 3200000 -> '$3.2M'. */
export function compactCurrency(amount: number): string {
  const abs = Math.abs(amount);
  const trim = (n: number) => String(Math.round(n * 10) / 10);
  if (abs >= 1_000_000) return `$${trim(amount / 1_000_000)}M`;
  if (abs >= 1_000) return `$${trim(amount / 1_000)}k`;
  return `$${Math.round(amount)}`;
}

/** The next "round" number at or above a value (1, 2, 5 times a power of ten), for a chart's top. */
export function niceCeil(max: number): number {
  if (!(max > 0)) return 1;
  const power = Math.pow(10, Math.floor(Math.log10(max)));
  for (const step of [1, 2, 5, 10]) {
    if (step * power >= max) return step * power;
  }
  return 10 * power;
}
