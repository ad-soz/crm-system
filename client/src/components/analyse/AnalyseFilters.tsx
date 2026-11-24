import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { categoryOptions, isNumeric, numberValue, type Column, type Filters } from '@/lib/analyse';

const MAX_OPTIONS = 40;

/**
 * One control for every column that can be filtered: tick values for a category,
 * a smallest and largest for a number, a first and last day for a date.
 * Nothing here narrows the rows itself; it only reports the person's choices.
 */
export function AnalyseFilters<R>({
  columns,
  rows,
  filters,
  onChange,
}: {
  columns: Column<R>[];
  /** The rows the options are counted from. */
  rows: R[];
  filters: Filters;
  onChange: (next: Filters) => void;
}) {
  const categories = columns.filter((c) => c.type === 'category');
  const numbers = columns.filter((c) => isNumeric(c) && rows.some((r) => numberValue(c, r) !== null));
  const dates = columns.filter((c) => c.type === 'date' && rows.some((r) => !!c.get(r)));

  const toggle = (key: string, value: string) => {
    const now = filters.categories[key] ?? [];
    const next = now.includes(value) ? now.filter((v) => v !== value) : [...now, value];
    onChange({ ...filters, categories: { ...filters.categories, [key]: next } });
  };
  const setRange = (key: string, end: 'min' | 'max', raw: string) => {
    const n = raw.trim() === '' ? undefined : Number(raw);
    const value = n !== undefined && Number.isFinite(n) ? n : undefined;
    onChange({ ...filters, ranges: { ...filters.ranges, [key]: { ...filters.ranges[key], [end]: value } } });
  };
  const setDate = (key: string, end: 'from' | 'to', value: string) =>
    onChange({ ...filters, dates: { ...filters.dates, [key]: { ...filters.dates[key], [end]: value || undefined } } });

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Filters">
      {categories.map((c) => {
        const options = categoryOptions(rows, c);
        if (options.length === 0 || (options.length === 1 && options[0].value === '(none)')) return null;
        const chosen = filters.categories[c.key] ?? [];
        // A value that is ticked but no longer in the list (rows changed) must stay visible so it can be unticked.
        const shown = options.slice(0, MAX_OPTIONS);
        for (const v of chosen) if (!shown.some((o) => o.value === v)) shown.push({ value: v, count: 0 });
        return (
          <fieldset key={c.key} className="space-y-1.5">
            <legend className="text-sm font-medium">{c.label}</legend>
            <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
              {shown.map((o) => (
                <label key={o.value} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={chosen.includes(o.value)}
                    onChange={() => toggle(c.key, o.value)}
                    aria-label={`${c.label}: ${o.value}`}
                  />
                  <span className="flex-1 truncate">{o.value}</span>
                  <span className="text-xs text-muted-foreground">{o.count}</span>
                </label>
              ))}
            </div>
            {options.length > MAX_OPTIONS && (
              <p className="text-xs text-muted-foreground">Showing the {MAX_OPTIONS} most common. Use the search box for the rest.</p>
            )}
          </fieldset>
        );
      })}

      {numbers.map((c) => (
        <fieldset key={c.key} className="space-y-1.5">
          <legend className="text-sm font-medium">{c.label}</legend>
          <div className="flex items-center gap-2">
            <Label htmlFor={`min-${c.key}`} className="sr-only">{c.label} at least</Label>
            <Input id={`min-${c.key}`} type="number" inputMode="decimal" placeholder="At least" value={filters.ranges[c.key]?.min ?? ''} onChange={(e) => setRange(c.key, 'min', e.target.value)} />
            <Label htmlFor={`max-${c.key}`} className="sr-only">{c.label} at most</Label>
            <Input id={`max-${c.key}`} type="number" inputMode="decimal" placeholder="At most" value={filters.ranges[c.key]?.max ?? ''} onChange={(e) => setRange(c.key, 'max', e.target.value)} />
          </div>
        </fieldset>
      ))}

      {dates.map((c) => (
        <fieldset key={c.key} className="space-y-1.5">
          <legend className="text-sm font-medium">{c.label}</legend>
          <div className="flex items-center gap-2">
            <Label htmlFor={`from-${c.key}`} className="sr-only">{c.label} from</Label>
            <Input id={`from-${c.key}`} type="date" value={filters.dates[c.key]?.from ?? ''} onChange={(e) => setDate(c.key, 'from', e.target.value)} />
            <Label htmlFor={`to-${c.key}`} className="sr-only">{c.label} to</Label>
            <Input id={`to-${c.key}`} type="date" value={filters.dates[c.key]?.to ?? ''} onChange={(e) => setDate(c.key, 'to', e.target.value)} />
          </div>
        </fieldset>
      ))}
    </div>
  );
}
