import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { Direction } from '@/lib/analyse';
import type { TableColumn } from '@/components/analyse/subjects';

export const PAGE_SIZE = 25;

/** The rows themselves: sortable columns, and pages when there are many. */
export function AnalyseTable<R extends { id: string }>({
  rows,
  columns,
  sort,
  dir,
  onSort,
  page,
  onPage,
}: {
  /** Already filtered and sorted. */
  rows: R[];
  columns: TableColumn<R>[];
  sort: string;
  dir: Direction;
  onSort: (key: string) => void;
  page: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const start = (current - 1) * PAGE_SIZE;
  const shown = rows.slice(start, start + PAGE_SIZE);

  return (
    <div className="space-y-3">
      <Table aria-label="Rows">
        <TableHeader>
          <TableRow>
            {columns.map((c) => {
              const active = sort === c.key;
              const Icon = !active ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown;
              return (
                <TableHead key={c.key} aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={cn(c.align === 'right' && 'text-right')}>
                  <button
                    type="button"
                    onClick={() => onSort(c.key)}
                    className={cn('inline-flex items-center gap-1 hover:text-foreground', active && 'text-foreground')}
                    title={`Sort by ${c.label.toLowerCase()}`}
                  >
                    {c.label}
                    <Icon className="h-3 w-3" aria-hidden />
                  </button>
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((row) => (
            <TableRow key={row.id}>
              {columns.map((c) => {
                const v = c.get(row);
                const fallback = Array.isArray(v) ? (v.length ? v.join(', ') : '-') : (v ?? '-');
                return (
                  <TableCell key={c.key} className={cn(c.align === 'right' && 'text-right tabular-nums')}>
                    {c.render ? c.render(row) : fallback}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {rows.length === 0 ? '0 rows' : `${start + 1}-${start + shown.length} of ${rows.length}`}
        </span>
        {pages > 1 && (
          <span className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={current <= 1} onClick={() => onPage(current - 1)}>Previous</Button>
            <span>Page {current} of {pages}</span>
            <Button size="sm" variant="outline" disabled={current >= pages} onClick={() => onPage(current + 1)}>Next</Button>
          </span>
        )}
      </div>
    </div>
  );
}
