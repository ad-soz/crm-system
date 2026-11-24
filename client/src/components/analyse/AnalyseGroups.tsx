import { BarChart } from '@/components/reports/BarChart';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Notice } from '@/components/ui/notice';
import { NONE, type Column, type Grouping } from '@/lib/analyse';
import { compactCurrency } from '@/lib/reports';
import { formatCurrency } from '@/lib/utils';

const CHART_BARS = 10;

const whole = (n: number) => String(Math.round(n));

/**
 * The rows split into groups: a chart above a table that shows the same figures.
 * Clicking a group narrows the whole page to it (that is how you drill further).
 */
export function AnalyseGroups<R>({
  grouping,
  by,
  measure,
  onPick,
}: {
  grouping: Grouping<R>;
  by: Column<R>;
  measure?: Column<R>;
  /** Narrow the page to this group. Not offered for "no date", which a date filter cannot express. */
  onPick: (groupKey: string) => void;
}) {
  const { groups, total, overlapping } = grouping;
  const money = measure?.type === 'currency';
  const pct = measure?.type === 'percent';
  const say = (n: number) => (money ? formatCurrency(n) : pct ? `${Math.round(n * 100) / 100}%` : n.toLocaleString('en-US', { maximumFractionDigits: 2 }));
  const bar = (g: { count: number; sum: number }) => (measure ? g.sum : g.count);
  const unit = measure ? measure.label : 'Rows';

  // The chart shows the biggest groups; the table lists them all.
  const top = groups.slice(0, CHART_BARS);
  const rest = groups.slice(CHART_BARS);
  const chartGroups = rest.length ? [...top, { label: `${rest.length} more`, count: rest.reduce((s, g) => s + g.count, 0), sum: rest.reduce((s, g) => s + g.sum, 0) }] : top;

  if (groups.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Nothing to group: no rows match.</p>;
  }

  return (
    <div className="space-y-4">
      <BarChart
        title={`${unit} by ${by.label.toLowerCase()}`}
        categories={chartGroups.map((g) => g.label)}
        series={[{ name: unit, values: chartGroups.map(bar), colour: 'primary' }]}
        format={money ? compactCurrency : (n) => whole(n)}
        describe={measure ? say : whole}
      />

      {overlapping && (
        <Notice>
          Some rows have more than one {by.label.toLowerCase()}, so they appear in each group. The groups can add up to more than the total.
        </Notice>
      )}

      <Table flat aria-label={`${unit} by ${by.label.toLowerCase()}`}>
        <TableHeader>
          <TableRow>
            <TableHead>{by.label}</TableHead>
            <TableHead className="text-right">Rows</TableHead>
            {measure && <TableHead className="text-right">Total {measure.label.toLowerCase()}</TableHead>}
            {measure && <TableHead className="text-right">Average</TableHead>}
            <TableHead className="text-right">Share</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((g) => {
            const pickable = !(by.type === 'date' && g.key === NONE);
            return (
              <TableRow key={g.key}>
                <TableCell className="font-medium">
                  {pickable ? (
                    <button type="button" className="text-left hover:underline" onClick={() => onPick(g.key)} title="Show only this group">
                      {g.label}
                    </button>
                  ) : (
                    g.label
                  )}
                </TableCell>
                <TableCell className="text-right">{g.count}</TableCell>
                {measure && <TableCell className="text-right">{say(g.sum)}</TableCell>}
                {measure && <TableCell className="text-right">{g.average === null ? '-' : say(g.average)}</TableCell>}
                <TableCell className="text-right text-muted-foreground">{g.share}%</TableCell>
              </TableRow>
            );
          })}
          <TableRow className="font-semibold">
            <TableCell>All</TableCell>
            <TableCell className="text-right">{total.count}</TableCell>
            {measure && <TableCell className="text-right">{say(total.sum)}</TableCell>}
            {measure && <TableCell className="text-right">{total.average === null ? '-' : say(total.average)}</TableCell>}
            <TableCell className="text-right">{overlapping ? '' : '100%'}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
