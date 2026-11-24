import { Info } from 'lucide-react';
import { Notice } from '@/components/ui/notice';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { DealReport } from '@/types';

/**
 * Says plainly what the figures cover. Deals created are always complete; stage
 * moves, wins and losses are only known from the day moves began to be recorded.
 * Saying so beats showing a number that looks complete and is not.
 */
export function HistoryNote({ report }: { report: DealReport }) {
  const { historySince, closedDateUnknown } = report;
  const unknownCount = closedDateUnknown.won.count + closedDateUnknown.lost.count;
  const unknownValue = closedDateUnknown.won.value + closedDateUnknown.lost.value;
  const periodStart = report.months[0];
  const startsBeforeHistory = !!historySince && periodStart < historySince.slice(0, 7);

  return (
    <Notice tone="neutral" className="mb-6 flex items-start gap-3" aria-label="What these figures cover">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="space-y-1">
        <p>
          <span className="font-medium">Deals created</span> is complete for every month.{' '}
          <span className="font-medium">Stage moves, wins and losses</span>{' '}
          {historySince ? (
            <>
              are recorded from <time dateTime={historySince}>{formatDate(historySince)}</time> onward
              {startsBeforeHistory ? ', so earlier months in this period will look quieter than they were' : ''}.
            </>
          ) : (
            <>have not been recorded long enough to date.</>
          )}
        </p>
        {unknownCount > 0 && (
          <p>
            {unknownCount} {unknownCount === 1 ? 'deal was' : 'deals were'} already won or lost before then (
            {formatCurrency(unknownValue)}). Their closing date was never recorded, so they are not placed in any month.
          </p>
        )}
      </div>
    </Notice>
  );
}
