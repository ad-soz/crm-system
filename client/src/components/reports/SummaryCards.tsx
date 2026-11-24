import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import type { DealReport } from '@/types';

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

const deals = (n: number) => `${n} ${n === 1 ? 'deal' : 'deals'}`;

/** The headline numbers for the chosen period. */
export function SummaryCards({ report }: { report: DealReport }) {
  const { summary } = report;
  const closed = summary.won.count + summary.lost.count;
  return (
    <section aria-label="Summary" className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <Stat label="Deals created" value={formatCurrency(summary.created.value)} detail={deals(summary.created.count)} />
      <Stat label="Won" value={formatCurrency(summary.won.value)} detail={deals(summary.won.count)} />
      <Stat label="Lost" value={formatCurrency(summary.lost.value)} detail={deals(summary.lost.count)} />
      <Stat
        label="Win rate"
        value={summary.winRate === null ? 'None yet' : `${summary.winRate}%`}
        detail={closed ? `${summary.won.count} won of ${closed} closed` : 'No deals closed in this period'}
      />
      <Stat
        label="Open pipeline"
        value={formatCurrency(summary.open.value)}
        detail={`${deals(summary.open.count)} · ${formatCurrency(summary.open.weighted)} expected`}
      />
    </section>
  );
}
