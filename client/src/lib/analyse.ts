/**
 * The analysis engine behind the dashboard drill-downs.
 *
 * Pure functions: given rows and a description of what the person asked for
 * (search words, filters, how to group, how to sort), they work out what to show.
 * Nothing here knows about screens, so every figure can be checked by hand in a test.
 */
import type { CsvCell } from '@/lib/csv';

export type ColumnType = 'text' | 'category' | 'number' | 'currency' | 'percent' | 'date';

export interface Column<R> {
  key: string;
  label: string;
  type: ColumnType;
  /** The value used to filter, sort, group and export. A category may have several values. */
  get: (row: R) => string | number | string[] | null | undefined;
  /** Shown in the table at first. */
  defaultVisible?: boolean;
}

export const NONE = '(none)';

export const isNumeric = (c: { type: ColumnType }) => c.type === 'number' || c.type === 'currency' || c.type === 'percent';
export const canGroup = (c: { type: ColumnType }) => c.type === 'category' || c.type === 'date';
export const canFilter = (c: { type: ColumnType }) => c.type !== 'text';

// ---------------------------------------------------------------- the person's choices

export interface RangeFilter {
  min?: number;
  max?: number;
}
export interface DateFilter {
  from?: string;
  to?: string;
}

export interface Filters {
  /** Words that must all appear somewhere in the row. */
  q: string;
  categories: Record<string, string[]>;
  ranges: Record<string, RangeFilter>;
  dates: Record<string, DateFilter>;
}

export const emptyFilters = (): Filters => ({ q: '', categories: {}, ranges: {}, dates: {} });

export function countFilters(f: Filters): number {
  return (
    (f.q.trim() ? 1 : 0) +
    Object.values(f.categories).filter((v) => v.length).length +
    Object.values(f.ranges).filter((r) => r.min !== undefined || r.max !== undefined).length +
    Object.values(f.dates).filter((d) => d.from || d.to).length
  );
}

// ---------------------------------------------------------------- reading cells

/** Every value of a category cell. A cell with no value counts as "(none)". */
export function categoryValues<R>(col: Column<R>, row: R): string[] {
  const v = col.get(row);
  if (Array.isArray(v)) return v.length ? v : [NONE];
  if (v === null || v === undefined || v === '') return [NONE];
  return [String(v)];
}

export function numberValue<R>(col: Column<R>, row: R): number | null {
  const v = col.get(row);
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** The calendar day of an ISO date, as 'YYYY-MM-DD' (in UTC, the way due and close dates are stored). */
export function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

// ---------------------------------------------------------------- filtering

const text = (v: unknown) => (Array.isArray(v) ? v.join(' ') : v === null || v === undefined ? '' : String(v)).toLowerCase();

export function applyFilters<R>(rows: R[], columns: Column<R>[], f: Filters): R[] {
  const words = f.q.toLowerCase().split(/\s+/).filter(Boolean);
  const searchable = columns.filter((c) => c.type === 'text' || c.type === 'category');
  const byKey = new Map(columns.map((c) => [c.key, c]));

  return rows.filter((row) => {
    if (words.length) {
      const haystack = searchable.map((c) => text(c.get(row))).join(' ');
      if (!words.every((w) => haystack.includes(w))) return false;
    }
    for (const [key, wanted] of Object.entries(f.categories)) {
      const col = byKey.get(key);
      if (!col || !wanted.length) continue;
      if (!categoryValues(col, row).some((v) => wanted.includes(v))) return false;
    }
    for (const [key, range] of Object.entries(f.ranges)) {
      const col = byKey.get(key);
      if (!col || (range.min === undefined && range.max === undefined)) continue;
      const n = numberValue(col, row);
      // A row with no figure can't be said to fall inside a range.
      if (n === null) return false;
      if (range.min !== undefined && n < range.min) return false;
      if (range.max !== undefined && n > range.max) return false;
    }
    for (const [key, range] of Object.entries(f.dates)) {
      const col = byKey.get(key);
      if (!col || (!range.from && !range.to)) continue;
      const v = col.get(row);
      if (typeof v !== 'string' || !v) return false;
      const day = dayOf(v);
      if (range.from && day < range.from) return false;
      if (range.to && day > range.to) return false;
    }
    return true;
  });
}

/** How many rows each value of a category would give, counting the rows as filtered by everything else. */
export function categoryOptions<R>(rows: R[], col: Column<R>): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const row of rows) for (const v of new Set(categoryValues(col, row))) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => (a.value === NONE ? 1 : b.value === NONE ? -1 : b.count - a.count || a.value.localeCompare(b.value)));
}

// ---------------------------------------------------------------- sorting

export type Direction = 'asc' | 'desc';

/** Sorts a copy. Rows with nothing in the column always go last, whichever way it sorts. */
export function sortRows<R>(rows: R[], col: Column<R> | undefined, dir: Direction): R[] {
  if (!col) return rows;
  const sign = dir === 'asc' ? 1 : -1;
  const key = (row: R): string | number | null => {
    const v = col.get(row);
    if (Array.isArray(v)) return v.length ? v.join(', ').toLowerCase() : null;
    if (v === null || v === undefined || v === '') return null;
    return typeof v === 'number' ? v : String(v).toLowerCase();
  };
  return rows
    .map((row, i) => ({ row, i, k: key(row) }))
    .sort((a, b) => {
      if (a.k === null && b.k === null) return a.i - b.i;
      if (a.k === null) return 1;
      if (b.k === null) return -1;
      const c = typeof a.k === 'number' && typeof b.k === 'number' ? a.k - b.k : String(a.k).localeCompare(String(b.k), undefined, { numeric: true });
      return c !== 0 ? c * sign : a.i - b.i;
    })
    .map((x) => x.row);
}

// ---------------------------------------------------------------- summarising

export interface Summary {
  count: number;
  /** Rows that have a figure in the measure column. */
  counted: number;
  sum: number;
  average: number | null;
  min: number | null;
  max: number | null;
}

const round = (n: number) => Math.round(n * 100) / 100;

export function summarise<R>(rows: R[], measure?: Column<R>): Summary {
  let sum = 0;
  let counted = 0;
  let min: number | null = null;
  let max: number | null = null;
  if (measure) {
    for (const row of rows) {
      const n = numberValue(measure, row);
      if (n === null) continue;
      sum += n;
      counted += 1;
      min = min === null ? n : Math.min(min, n);
      max = max === null ? n : Math.max(max, n);
    }
  }
  return { count: rows.length, counted, sum: round(sum), average: counted ? round(sum / counted) : null, min, max };
}

// ---------------------------------------------------------------- grouping

export interface Group<R> extends Summary {
  key: string;
  label: string;
  rows: R[];
  /** Share of the grand total of the measure (or of the row count when there is no measure), 0 to 100. */
  share: number;
}

export interface Grouping<R> {
  groups: Group<R>[];
  /** True when a row can sit in more than one group (a company with several industries). */
  overlapping: boolean;
  total: Summary;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function monthLabel(key: string): string {
  const [y, m] = key.split('-');
  return `${MONTHS[Number(m) - 1] ?? m} ${y}`;
}

/**
 * Splits rows into groups by a category (each of its values) or by month (a date column).
 * Each group is summarised on the measure column; with no measure the row count is used.
 */
export function groupRows<R>(rows: R[], by: Column<R>, measure?: Column<R>): Grouping<R> {
  const buckets = new Map<string, R[]>();
  let overlapping = false;
  const put = (key: string, row: R) => {
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(row);
  };

  for (const row of rows) {
    if (by.type === 'date') {
      const v = by.get(row);
      put(typeof v === 'string' && v ? monthOf(v) : NONE, row);
    } else {
      const values = [...new Set(categoryValues(by, row))];
      if (values.length > 1) overlapping = true;
      for (const v of values) put(v, row);
    }
  }

  const total = summarise(rows, measure);
  const denominator = measure ? total.sum : total.count;
  const groups: Group<R>[] = [...buckets.entries()].map(([key, list]) => {
    const s = summarise(list, measure);
    const part = measure ? s.sum : s.count;
    return {
      ...s,
      key,
      label: by.type === 'date' && key !== NONE ? monthLabel(key) : key,
      rows: list,
      share: denominator > 0 ? round((part / denominator) * 100) : 0,
    };
  });

  groups.sort((a, b) => {
    if (a.key === NONE) return 1;
    if (b.key === NONE) return -1;
    if (by.type === 'date') return a.key.localeCompare(b.key);
    const x = measure ? a.sum : a.count;
    const y = measure ? b.sum : b.count;
    return y - x || a.label.localeCompare(b.label);
  });
  return { groups, overlapping, total };
}

// ---------------------------------------------------------------- export

/** What the table shows, as rows for a CSV file: the visible columns, in order. */
export function exportRows<R>(rows: R[], columns: Column<R>[]): CsvCell[][] {
  return [
    columns.map((c) => c.label),
    ...rows.map((row) =>
      columns.map((c) => {
        const v = c.get(row);
        return Array.isArray(v) ? v.join('; ') : (v ?? '');
      }),
    ),
  ];
}

// ---------------------------------------------------------------- the address bar

export interface View {
  filters: Filters;
  group: string;
  measure: string;
  sort: string;
  dir: Direction;
  /** Visible columns, or null for the standard set. */
  cols: string[] | null;
  /** Deals only: also list won and lost deals. */
  closed: boolean;
  page: number;
}

export interface ViewDefaults {
  group: string;
  measure: string;
  sort: string;
  dir: Direction;
}

const list = (v: string | null) => (v ? v.split('|').filter(Boolean) : []);
const num = (v: string | null) => (v !== null && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);

/** Reads a view from the address. Anything unknown or malformed is ignored, never an error. */
export function parseView<R>(params: URLSearchParams, columns: Column<R>[], defaults: ViewDefaults): View {
  const keys = new Set(columns.map((c) => c.key));
  const filters = emptyFilters();
  filters.q = params.get('q') ?? '';
  for (const [name, value] of params.entries()) {
    const [kind, ...rest] = name.split('.');
    const key = rest.join('.');
    if (!keys.has(key)) continue;
    if (kind === 'f') {
      const values = list(value);
      if (values.length) filters.categories[key] = values;
    } else if (kind === 'min' || kind === 'max') {
      const n = num(value);
      if (n !== undefined) filters.ranges[key] = { ...filters.ranges[key], [kind]: n };
    } else if (kind === 'from' || kind === 'to') {
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) filters.dates[key] = { ...filters.dates[key], [kind]: value };
    }
  }
  const pick = (name: string, fallback: string, allow: (k: string) => boolean) => {
    const v = params.get(name);
    return v !== null && (v === '' || allow(v)) ? v : fallback;
  };
  const colSet = list(params.get('cols')).filter((k) => keys.has(k));
  return {
    filters,
    group: pick('group', defaults.group, (k) => columns.some((c) => c.key === k && canGroup(c))),
    measure: pick('measure', defaults.measure, (k) => columns.some((c) => c.key === k && isNumeric(c))),
    sort: pick('sort', defaults.sort, (k) => keys.has(k)),
    dir: params.get('dir') === 'asc' ? 'asc' : params.get('dir') === 'desc' ? 'desc' : defaults.dir,
    cols: colSet.length ? colSet : null,
    closed: params.get('closed') === '1',
    page: Math.max(1, Math.floor(num(params.get('page')) ?? 1)),
  };
}

/** The address for a view. Choices that match the defaults are left out, so addresses stay short. */
export function viewToParams(view: View, defaults: ViewDefaults): URLSearchParams {
  const p = new URLSearchParams();
  if (view.filters.q.trim()) p.set('q', view.filters.q.trim());
  for (const [k, v] of Object.entries(view.filters.categories)) if (v.length) p.set(`f.${k}`, v.join('|'));
  for (const [k, r] of Object.entries(view.filters.ranges)) {
    if (r.min !== undefined) p.set(`min.${k}`, String(r.min));
    if (r.max !== undefined) p.set(`max.${k}`, String(r.max));
  }
  for (const [k, r] of Object.entries(view.filters.dates)) {
    if (r.from) p.set(`from.${k}`, r.from);
    if (r.to) p.set(`to.${k}`, r.to);
  }
  if (view.group !== defaults.group) p.set('group', view.group);
  if (view.measure !== defaults.measure) p.set('measure', view.measure);
  if (view.sort !== defaults.sort) p.set('sort', view.sort);
  if (view.dir !== defaults.dir) p.set('dir', view.dir);
  if (view.cols) p.set('cols', view.cols.join('|'));
  if (view.closed) p.set('closed', '1');
  if (view.page > 1) p.set('page', String(view.page));
  return p;
}
