import { useState } from 'react';
import { useDealReport } from '@/hooks/queries';
import { LoadingState, ErrorState, EmptyState, PageHeader } from '@/components/states';
import { ReportToolbar } from '@/components/reports/ReportToolbar';
import { HistoryNote } from '@/components/reports/HistoryNote';
import { SummaryCards } from '@/components/reports/SummaryCards';
import { DealsOverTime } from '@/components/reports/DealsOverTime';
import { StageMovement } from '@/components/reports/StageMovement';
import { StalledDeals } from '@/components/reports/StalledDeals';
import { ByPerson } from '@/components/reports/ByPerson';

/** Reports: how deals change over time. Read-only; every section can be exported to CSV. */
export default function Reports() {
  const [months, setMonths] = useState(6);
  const [ownerId, setOwnerId] = useState('');
  const { data, isLoading, isError, isFetching } = useDealReport(months, ownerId);

  return (
    <div>
      <PageHeader title="Reports" description="How your deals change over time" />

      {isLoading && <LoadingState />}
      {isError && !data && <ErrorState message="Failed to load the report" />}

      {data && (
        <>
          <ReportToolbar months={months} ownerId={ownerId} owners={data.owners} onMonths={setMonths} onOwner={setOwnerId} />
          <div aria-busy={isFetching} className={isFetching ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
            {isError && <ErrorState message="Could not refresh the report. Showing the last figures." />}
            {data.summary.created.count === 0 && data.summary.open.count === 0 && data.byPerson.length === 0 ? (
              <EmptyState
                title="No deals to report on"
                description={ownerId ? 'This person has no deals in the system.' : 'Add some deals and they will show up here.'}
              />
            ) : (
              <>
                <HistoryNote report={data} />
                <SummaryCards report={data} />
                <DealsOverTime report={data} />
                <StageMovement report={data} />
                <StalledDeals report={data} />
                <ByPerson report={data} />
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
