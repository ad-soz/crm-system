import type { ForecastRow } from '@/types';

/** A readable name for a forecast row: "November 2026", "Overdue", or "No close date". */
export function forecastLabel(row: ForecastRow): string {
  if (row.kind === 'overdue') return 'Overdue';
  if (row.kind === 'none') return 'No close date';
  const [year, month] = row.key.split('-').map(Number);
  // Format in UTC: the server groups by UTC month, so the label must agree.
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** A short explanation shown under special rows, so nobody has to guess what they mean. */
export function forecastHint(row: ForecastRow): string | null {
  if (row.kind === 'overdue') return 'Expected close date has passed. Update the date or close the deal.';
  if (row.kind === 'none') return 'Add an expected close date so these show in the right month.';
  return null;
}

/** Weighted value as a share of the total, for display (0 when there is nothing). */
export function weightedShare(weighted: number, total: number): number {
  if (!total) return 0;
  return Math.round((weighted / total) * 100);
}
