import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Clock, Hourglass } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Attention, AttentionDeal, AttentionSection, AttentionTask } from '@/types';

const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;

/** Where a task link should go: the deal or person it belongs to, else the task list. */
export function taskLink(task: AttentionTask): string {
  if (task.deal) return `/deals/${task.deal.id}`;
  if (task.person) return `/people/${task.person.id}`;
  return '/tasks';
}

/**
 * "Needs your attention": the person's own overdue tasks, quiet deals and deals
 * past their close date. A section the person can't view is left out. When
 * nothing needs attention it says so, so an empty panel is never mistaken for
 * a broken one.
 */
export function AttentionCard({ attention }: { attention: Attention | null | undefined }) {
  if (!attention) return null;
  const { overdueTasks, staleDeals, pastDueDeals } = attention;
  const sections = [overdueTasks, staleDeals, pastDueDeals].filter((s): s is NonNullable<typeof s> => s !== null);
  if (sections.length === 0) return null;

  const total = sections.reduce((n, s) => n + s.count, 0);

  return (
    <Card className="mb-6" role="region" aria-label="Needs your attention">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          Needs your attention
          {total > 0 ? <Badge variant="warning">{total}</Badge> : null}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Your own overdue tasks, and your open deals that have gone quiet or passed their close date.
        </p>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
            Nothing needs your attention. You're all caught up.
          </p>
        ) : (
          <div className="grid gap-6 md:grid-cols-3">
            {overdueTasks && (
              <Section
                title="Overdue tasks"
                icon={<Clock className="h-4 w-4 text-destructive" aria-hidden />}
                section={overdueTasks}
                empty="No overdue tasks."
                moreTo="/tasks"
                moreLabel="all tasks"
                render={(t: AttentionTask) => (
                  <Row key={t.id} to={taskLink(t)} title={t.title} detail={`Due ${formatDate(t.dueDate)}`} />
                )}
              />
            )}
            {staleDeals && (
              <Section
                title="Deals gone quiet"
                icon={<Hourglass className="h-4 w-4 text-warning" aria-hidden />}
                section={staleDeals}
                empty="No quiet deals."
                moreTo="/deals"
                moreLabel="all deals"
                render={(d: AttentionDeal) => (
                  <Row
                    key={d.id}
                    to={`/deals/${d.id}`}
                    title={d.title}
                    detail={`No contact for ${days(d.quietDays ?? 0)} · ${formatCurrency(d.amount)}`}
                  />
                )}
              />
            )}
            {pastDueDeals && (
              <Section
                title="Past their close date"
                icon={<AlertTriangle className="h-4 w-4 text-warning" aria-hidden />}
                section={pastDueDeals}
                empty="No deals past their close date."
                moreTo="/deals"
                moreLabel="all deals"
                render={(d: AttentionDeal) => (
                  <Row
                    key={d.id}
                    to={`/deals/${d.id}`}
                    title={d.title}
                    detail={`${days(d.daysLate ?? 0)} late · ${formatCurrency(d.amount)}`}
                  />
                )}
              />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ to, title, detail }: { to: string; title: string; detail: string }) {
  return (
    <li>
      <Link to={to} className="block rounded-sm text-sm font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {title}
      </Link>
      <p className="text-xs text-muted-foreground">{detail}</p>
    </li>
  );
}

function Section<T>({
  title,
  icon,
  section,
  empty,
  moreTo,
  moreLabel,
  render,
}: {
  title: string;
  icon: React.ReactNode;
  section: AttentionSection<T>;
  empty: string;
  moreTo: string;
  moreLabel: string;
  render: (item: T) => React.ReactNode;
}) {
  const hidden = section.count - section.items.length;
  return (
    <section aria-label={title}>
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        {icon}
        {title}
        <Badge variant={section.count > 0 ? 'secondary' : 'outline'}>{section.count}</Badge>
      </h3>
      {section.count === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <>
          <ul className="space-y-2">{section.items.map(render)}</ul>
          {hidden > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              and {hidden} more.{' '}
              <Link to={moreTo} className="underline hover:text-foreground">
                See {moreLabel}
              </Link>
            </p>
          )}
        </>
      )}
    </section>
  );
}
