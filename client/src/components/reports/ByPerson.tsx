import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency } from '@/lib/utils';
import { ExportButton } from './ExportButton';
import type { DealReport } from '@/types';

/** The same figures, split by who owns the deal. Hidden when a single person is already chosen. */
export function ByPerson({ report }: { report: DealReport }) {
  const people = report.byPerson;
  if (people.length < 2) return null;

  const exportRows = () => [
    ['Person', 'Open deals', 'Open value', 'Expected value', 'Created (deals)', 'Created (value)', 'Won (deals)', 'Won (value)', 'Lost (deals)', 'Lost (value)'],
    ...people.map((p) => [p.name, p.open.count, p.open.value, p.open.weighted, p.created.count, p.created.value, p.won.count, p.won.value, p.lost.count, p.lost.value]),
  ];

  return (
    <Card className="mb-6">
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle>By person</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">Who owns what. Created, won and lost are for the chosen period.</p>
        </div>
        <ExportButton name="Deals by person" rows={exportRows} />
      </CardHeader>
      <CardContent>
        <Table flat>
          <caption className="sr-only">Deal figures by owner</caption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Person</TableHead>
              <TableHead scope="col" className="text-right">Open deals</TableHead>
              <TableHead scope="col" className="text-right">Open value</TableHead>
              <TableHead scope="col" className="text-right">Expected</TableHead>
              <TableHead scope="col" className="text-right">Created</TableHead>
              <TableHead scope="col" className="text-right">Won</TableHead>
              <TableHead scope="col" className="text-right">Lost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {people.map((p) => (
              <TableRow key={p.ownerId ?? 'unassigned'}>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell className="text-right">{p.open.count}</TableCell>
                <TableCell className="text-right">{formatCurrency(p.open.value)}</TableCell>
                <TableCell className="text-right">{formatCurrency(p.open.weighted)}</TableCell>
                <TableCell className="text-right">{p.created.count} · {formatCurrency(p.created.value)}</TableCell>
                <TableCell className="text-right">{p.won.count} · {formatCurrency(p.won.value)}</TableCell>
                <TableCell className="text-right">{p.lost.count} · {formatCurrency(p.lost.value)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
