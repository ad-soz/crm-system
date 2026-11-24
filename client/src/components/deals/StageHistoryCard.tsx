import { ArrowRight } from 'lucide-react';
import { useDealHistory } from '@/hooks/queries';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingState, ErrorState } from '@/components/states';
import { StageBadge } from '@/lib/display';

/** "8 Nov 2026, 9:41 pm": the date and the time, because both matter for an audit trail. */
export function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Every move of a deal between stages: when, who, from where to where, and why. */
export function StageHistoryCard({ dealId }: { dealId: string }) {
  const { data, isLoading, isError } = useDealHistory(dealId);

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Stage history</CardTitle>
        <p className="text-sm text-muted-foreground">Each time this deal moved, with the reason given.</p>
      </CardHeader>
      <CardContent>
        {isLoading && <LoadingState />}
        {isError && <ErrorState message="Failed to load the stage history" />}
        {data && data.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No moves recorded yet. The history starts with the next time this deal changes stage.
          </p>
        )}
        {data && data.length > 0 && (
          <ol className="space-y-4">
            {data.map((c) => (
              <li key={c.id} className="border-l-2 pl-4">
                <div className="flex flex-wrap items-center gap-2">
                  <StageBadge stage={c.fromStage} />
                  <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden />
                  <StageBadge stage={c.toStage} />
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-sm">{c.comment}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {c.userName} · <time dateTime={c.createdAt}>{formatWhen(c.createdAt)}</time>
                </p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
