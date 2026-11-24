import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { monthLabel } from '@/lib/reports';
import { ExportButton } from './ExportButton';
import type { DealReport } from '@/types';

/**
 * How many deals moved INTO each stage each month. Busier cells are shaded
 * darker, but every cell also shows its number, so colour is never the only cue.
 */
export function StageMovement({ report }: { report: DealReport }) {
  const { stages, rows, totals } = report.movement;
  const max = Math.max(1, ...rows.flatMap((r) => stages.map((s) => r.counts[s.id] ?? 0)));
  const any = rows.some((r) => stages.some((s) => (r.counts[s.id] ?? 0) > 0));

  const exportRows = () => [
    ['Month', ...stages.map((s) => s.name)],
    ...rows.map((r) => [monthLabel(r.key), ...stages.map((s) => r.counts[s.id] ?? 0)]),
    ['Total', ...stages.map((s) => totals[s.id] ?? 0)],
  ];

  return (
    <Card className="mb-6">
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle>Pipeline movement</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">How many deals moved into each stage, month by month.</p>
        </div>
        <ExportButton name="Pipeline movement" rows={exportRows} />
      </CardHeader>
      <CardContent>
        {!any ? (
          <p className="text-sm text-muted-foreground">No stage moves have been recorded in this period.</p>
        ) : (
          <Table flat>
            <caption className="sr-only">Deals moved into each stage, by month</caption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Month</TableHead>
                {stages.map((s) => (
                  <TableHead key={s.id} scope="col" className="text-right">
                    {s.name}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.key}>
                  <TableCell className="font-medium">{monthLabel(r.key)}</TableCell>
                  {stages.map((s) => {
                    const n = r.counts[s.id] ?? 0;
                    return (
                      <TableCell
                        key={s.id}
                        className="text-right"
                        style={n ? { background: `hsl(var(--primary) / ${(0.08 + (n / max) * 0.27).toFixed(2)})` } : undefined}
                      >
                        {n}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
              <TableRow className="font-semibold">
                <TableCell>Total</TableCell>
                {stages.map((s) => (
                  <TableCell key={s.id} className="text-right">
                    {totals[s.id] ?? 0}
                  </TableCell>
                ))}
              </TableRow>
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
