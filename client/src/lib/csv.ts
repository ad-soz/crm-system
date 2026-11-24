/**
 * CSV export for what is on screen.
 *
 * Two protections matter here:
 *  - Text starting with = + - @ (or a tab / carriage return) is prefixed with a
 *    quote, so a deal or person named "=HYPERLINK(...)" opens in Excel as plain
 *    text and not as a formula. Real numbers are left alone.
 *  - Cells containing commas, quotes or line breaks are quoted properly.
 */
export type CsvCell = string | number | null | undefined;

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  let text = typeof value === 'number' ? (Number.isFinite(value) ? String(value) : '') : String(value);
  if (typeof value === 'string' && FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: CsvCell[][]): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** A safe file name: letters, digits, dashes, with the date, e.g. deals-over-time-2026-11-08.csv. */
export function csvFileName(base: string, date: Date = new Date()): string {
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'export';
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return `${slug}-${day}.csv`;
}

/** Save rows as a CSV file. A leading byte-order mark makes Excel read accents and symbols correctly. */
export function downloadCsv(name: string, rows: CsvCell[][]): void {
  const blob = new Blob(['\uFEFF', toCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
