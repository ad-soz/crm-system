import { Link } from 'react-router-dom';
import { Users, Building2, Handshake, DollarSign, TrendingUp, AlertTriangle, ArrowRight } from 'lucide-react';
import { useDashboard } from '@/hooks/queries';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingState, ErrorState, PageHeader } from '@/components/states';
import { StageBadge, ContactIcon } from '@/lib/display';
import { formatCurrency, formatDate } from '@/lib/utils';
import { forecastHint, forecastLabel, weightedShare } from '@/lib/forecast';
import { AttentionCard } from '@/components/dashboard/AttentionCard';
import { Badge } from '@/components/ui/badge';
import { PriorityBadge } from '@/lib/display';
import { cn } from '@/lib/utils';

function KpiCard({ label, value, icon: Icon, to }: { label: string; value: string; icon: any; to: string }) {
  return (
    <Link to={to} className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`${label}: ${value}. Analyse the figures behind it.`}>
    <Card className="h-full transition-shadow hover:shadow-md">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          Analyse <ArrowRight className="h-3 w-3" aria-hidden />
        </p>
      </CardContent>
    </Card>
    </Link>
  );
}

// Sections the user's role profile can't view come back as null and are left out.
export default function Dashboard() {
  const { data, isLoading, isError } = useDashboard();

  if (isLoading) return <LoadingState />;
  if (isError || !data) return <ErrorState message="Failed to load dashboard" />;

  const now = new Date();
  const kpis = [
    data.totalPeople !== null && { label: 'Total People', value: String(data.totalPeople), icon: Users, to: '/analyse/people' },
    data.totalCompanies !== null && { label: 'Total Companies', value: String(data.totalCompanies), icon: Building2, to: '/analyse/companies' },
    data.openDeals !== null && { label: 'Open Deals', value: String(data.openDeals), icon: Handshake, to: '/analyse/open-deals' },
    data.pipelineValue !== null && { label: 'Pipeline Value', value: formatCurrency(data.pipelineValue), icon: DollarSign, to: '/analyse/pipeline' },
    data.forecast && { label: 'Weighted Forecast', value: formatCurrency(data.forecast.weighted), icon: TrendingUp, to: '/analyse/forecast' },
  ].filter(Boolean) as { label: string; value: string; icon: any; to: string }[];

  const stages = data.dealsByStage;
  const tasks = data.upcomingTasks;
  const contacts = data.recentContacts;
  const forecast = data.forecast ?? null;
  const maxForecast = forecast ? Math.max(...forecast.rows.map((r) => r.value), 1) : 1;
  const maxStageValue = stages ? Math.max(...stages.map((s) => s.value), 1) : 1;
  const nothing = kpis.length === 0 && !stages && !tasks && !contacts && !forecast;

  return (
    <div>
      <PageHeader title="Dashboard" description="Your CRM at a glance" />

      <AttentionCard attention={data.attention} />

      {nothing && (
        <p className="text-sm text-muted-foreground">
          Your role profile doesn't include any areas shown on the dashboard.
        </p>
      )}

      {kpis.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {kpis.map((k) => (
            <KpiCard key={k.label} {...k} />
          ))}
        </div>
      )}

      {(stages || tasks) && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {stages && (
            <Card>
              <CardHeader>
                <CardTitle>Pipeline by Stage</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {stages.map((s) => (
                  <div key={s.stage.id}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <Link to={`/analyse/open-deals?f.stage=${encodeURIComponent(s.stage.name)}&closed=1`} className="hover:opacity-80" title="See these deals">
                        <StageBadge stage={s.stage} />
                      </Link>
                      <span className="text-muted-foreground">
                        {s.count} · {formatCurrency(s.value)}
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted">
                      <div className="h-2 rounded-full bg-primary" style={{ width: `${(s.value / maxStageValue) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {tasks && (
            <Card>
              <CardHeader>
                <CardTitle>Upcoming Tasks (7 days)</CardTitle>
              </CardHeader>
              <CardContent>
                {tasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No upcoming tasks.</p>
                ) : (
                  <ul className="space-y-3">
                    {tasks.map((t) => {
                      const overdue = t.dueDate && new Date(t.dueDate) < now;
                      return (
                        <li key={t.id} className="flex items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium">{t.title}</p>
                            <p className={cn('text-xs', overdue ? 'text-destructive font-medium' : 'text-muted-foreground')}>
                              Due {formatDate(t.dueDate)} {overdue && '(overdue)'}
                            </p>
                          </div>
                          <PriorityBadge priority={t.priority} />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {forecast && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Forecast by close month</CardTitle>
            <p className="text-sm text-muted-foreground">
              Each open deal counts for its amount times its stage's win chance. {formatCurrency(forecast.weighted)} expected from{' '}
              {formatCurrency(forecast.total)} in {forecast.count} open {forecast.count === 1 ? 'deal' : 'deals'} ({weightedShare(forecast.weighted, forecast.total)}%).
            </p>
          </CardHeader>
          <CardContent>
            {forecast.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No open deals to forecast.</p>
            ) : (
              <ul className="space-y-4">
                {forecast.rows.map((r) => {
                  const hint = forecastHint(r);
                  return (
                    <li key={r.key}>
                      <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className="flex items-center gap-2 font-medium">
                          {r.kind === 'overdue' && <AlertTriangle className="h-4 w-4 text-warning" aria-hidden />}
                          {forecastLabel(r)}
                          {r.kind !== 'month' && <Badge variant={r.kind === 'overdue' ? 'warning' : 'secondary'}>Needs attention</Badge>}
                        </span>
                        <span className="text-muted-foreground">
                          {r.count} {r.count === 1 ? 'deal' : 'deals'} · {formatCurrency(r.value)} · <span className="font-medium text-foreground">{formatCurrency(r.weighted)} expected</span>
                        </span>
                      </div>
                      <div
                        className="h-2 w-full rounded-full bg-muted"
                        role="img"
                        aria-label={`${forecastLabel(r)}: ${formatCurrency(r.weighted)} expected of ${formatCurrency(r.value)}`}
                      >
                        <div className="h-2 rounded-full bg-primary/30" style={{ width: `${(r.value / maxForecast) * 100}%` }}>
                          <div className="h-2 rounded-full bg-primary" style={{ width: `${r.value ? (r.weighted / r.value) * 100 : 0}%` }} />
                        </div>
                      </div>
                      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {contacts && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Recent Contacts</CardTitle>
          </CardHeader>
          <CardContent>
            {contacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent contacts.</p>
            ) : (
              <ul className="space-y-3">
                {contacts.map((a) => (
                  <li key={a.id} className="flex items-start gap-3">
                    <div className="mt-0.5">
                      <ContactIcon type={a.type} />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{a.subject}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.person && (
                          <Link to={`/people/${a.person.id}`} className="hover:underline">
                            {a.person.firstName} {a.person.lastName}
                          </Link>
                        )}
                        {a.deal && (
                          <Link to={`/deals/${a.deal.id}`} className="hover:underline">
                            {a.person ? ' · ' : ''}
                            {a.deal.title}
                          </Link>
                        )}
                        {' · '}
                        {formatDate(a.createdAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
