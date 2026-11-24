import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency } from '@/lib/utils';
import { formatDays } from '@/lib/reports';
import { StageBadge } from '@/lib/display';
import { ExportButton } from './ExportButton';
import type { DealReport } from '@/types';

/** Open deals that have been in their current stage the longest. */
export function StalledDeals({ report }: { report: DealReport }) {
  const { items, total } = report.stalled;
  const anyApproximate = items.some((d) => d.approximate);

  const exportRows = () => [
    ['Deal', 'Stage', 'Owner', 'Days in stage', 'In stage since', 'Date certain', 'Value'],
    ...items.map((d) => [d.title, d.stage.name, d.ownerName ?? 'Unassigned', d.days, d.since.slice(0, 10), d.approximate ? 'No (could be shorter)' : 'Yes', d.amount]),
  ];

  return (
    <Card className="mb-6">
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle>Where deals are stalling</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">Open deals that have been in their current stage the longest.</p>
        </div>
        <ExportButton name="Stalled deals" rows={exportRows} />
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">There are no open deals.</p>
        ) : (
          <>
            <Table flat>
              <caption className="sr-only">Open deals by time in their current stage, longest first</caption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Deal</TableHead>
                  <TableHead scope="col">Stage</TableHead>
                  <TableHead scope="col">Owner</TableHead>
                  <TableHead scope="col" className="text-right">In this stage for</TableHead>
                  <TableHead scope="col" className="text-right">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">
                      <Link to={`/deals/${d.id}`} className="hover:underline">
                        {d.title}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <StageBadge stage={d.stage} />
                    </TableCell>
                    <TableCell>{d.ownerName ?? 'Unassigned'}</TableCell>
                    <TableCell className="text-right">
                      {d.approximate ? (
                        <span title="This deal may have moved before moves were recorded, so the real time could be shorter.">
                          up to {formatDays(d.days)} <Badge variant="outline">estimate</Badge>
                        </span>
                      ) : (
                        formatDays(d.days)
                      )}
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(d.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="text-xs text-muted-foreground">
              {total > items.length ? `Showing the ${items.length} longest of ${total} open deals. ` : ''}
              {anyApproximate
                ? 'An estimate means the deal may have moved before moves were recorded, so it has been in its stage for up to that long.'
                : 'Every time shown comes from recorded moves.'}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
