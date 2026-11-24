import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency } from '@/lib/utils';
import { monthLabel, shortMonthLabel } from '@/lib/reports';
import { BarChart } from './BarChart';
import { ExportButton } from './ExportButton';
import type { DealReport } from '@/types';

/**
 * Deals created, won and lost by month: two charts, and the same figures in a
 * table underneath so nothing is visible only as a picture.
 */
export function DealsOverTime({ report }: { report: DealReport }) {
  const rows = report.byMonth;
  const labels = rows.map((r, i) => shortMonthLabel(r.key, rows[i - 1]?.key));
  const sum = (pick: (r: (typeof rows)[number]) => number) => rows.reduce((n, r) => n + pick(r), 0);

  const exportRows = () => [
    ['Month', 'Created (deals)', 'Created (value)', 'Won (deals)', 'Won (value)', 'Lost (deals)', 'Lost (value)', 'Stage moves'],
    ...rows.map((r) => [monthLabel(r.key), r.created.count, r.created.value, r.won.count, r.won.value, r.lost.count, r.lost.value, r.moves]),
  ];

  return (
    <Card className="mb-6">
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle>Deals over time</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">Created, won and lost each month, by value.</p>
        </div>
        <ExportButton name="Deals over time" rows={exportRows} />
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-semibold">Deals created</h3>
            <BarChart
              title="Deals created per month"
              categories={labels}
              series={[{ name: 'Created', values: rows.map((r) => r.created.value), colour: 'primary' }]}
              describe={formatCurrency}
            />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Won and lost</h3>
            <BarChart
              title="Won and lost per month"
              categories={labels}
              series={[
                { name: 'Won', values: rows.map((r) => r.won.value), colour: 'success' },
                { name: 'Lost', values: rows.map((r) => r.lost.value), colour: 'destructive' },
              ]}
              describe={formatCurrency}
            />
          </div>
        </div>

        <Table flat>
          <caption className="sr-only">Deals created, won and lost by month</caption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Month</TableHead>
              <TableHead scope="col" className="text-right">Created</TableHead>
              <TableHead scope="col" className="text-right">Created value</TableHead>
              <TableHead scope="col" className="text-right">Won</TableHead>
              <TableHead scope="col" className="text-right">Won value</TableHead>
              <TableHead scope="col" className="text-right">Lost</TableHead>
              <TableHead scope="col" className="text-right">Lost value</TableHead>
              <TableHead scope="col" className="text-right">Stage moves</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.key}>
                <TableCell className="font-medium">{monthLabel(r.key)}</TableCell>
                <TableCell className="text-right">{r.created.count}</TableCell>
                <TableCell className="text-right">{formatCurrency(r.created.value)}</TableCell>
                <TableCell className="text-right">{r.won.count}</TableCell>
                <TableCell className="text-right">{formatCurrency(r.won.value)}</TableCell>
                <TableCell className="text-right">{r.lost.count}</TableCell>
                <TableCell className="text-right">{formatCurrency(r.lost.value)}</TableCell>
                <TableCell className="text-right">{r.moves}</TableCell>
              </TableRow>
            ))}
            <TableRow className="font-semibold">
              <TableCell>Total</TableCell>
              <TableCell className="text-right">{sum((r) => r.created.count)}</TableCell>
              <TableCell className="text-right">{formatCurrency(sum((r) => r.created.value))}</TableCell>
              <TableCell className="text-right">{sum((r) => r.won.count)}</TableCell>
              <TableCell className="text-right">{formatCurrency(sum((r) => r.won.value))}</TableCell>
              <TableCell className="text-right">{sum((r) => r.lost.count)}</TableCell>
              <TableCell className="text-right">{formatCurrency(sum((r) => r.lost.value))}</TableCell>
              <TableCell className="text-right">{sum((r) => r.moves)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
