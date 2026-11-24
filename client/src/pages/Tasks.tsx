import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api';
import { useTasks, useDeals, useInvalidate, useMutation, useActiveReferenceValues } from '@/hooks/queries';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Dialog, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { LoadingState, ErrorState, EmptyState, PageHeader } from '@/components/states';
import { TaskForm, type TaskFormValues } from '@/components/forms/TaskForm';
import { TaskActions } from '@/components/tasks/TaskActions';
import { PriorityBadge, StageBadge } from '@/lib/display';
import { formatDate, cn } from '@/lib/utils';
import { cleanup } from '@/pages/Companies';
import { useToast } from '@/context/ToastContext';
import { usePermissions } from '@/hooks/usePermissions';
import type { Deal, Task } from '@/types';

type KindFilter = 'ALL' | 'TASK' | 'DEAL';
type Row = { kind: 'task'; due: string | null; task: Task } | { kind: 'deal'; due: string | null; deal: Deal };

/** Earliest date first; rows without a date go last. */
function byDue(a: Row, b: Row) {
  if (a.due === b.due) return 0;
  if (!a.due) return 1;
  if (!b.due) return -1;
  return new Date(a.due).getTime() - new Date(b.due).getTime();
}

export default function Tasks() {
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [kindFilter, setKindFilter] = useState<KindFilter>('ALL');
  const [dialogOpen, setDialogOpen] = useState(false);
  const invalidate = useInvalidate();
  const { toast } = useToast();
  const { can } = usePermissions();

  const { values: statuses } = useActiveReferenceValues('task-statuses');

  const { data, isLoading, isError } = useTasks(
    statusFilter === 'ALL' ? {} : { statusId: statusFilter },
  );

  // A deal is a kind of task: open deals are listed here beside the tasks.
  // A deal has a stage rather than a task status, so choosing a status shows tasks only.
  const canSeeDeals = can('deals.view');
  const { data: dealData } = useDeals({ limit: 500 }, { enabled: canSeeDeals });
  const showTasks = kindFilter !== 'DEAL';
  const showDeals = canSeeDeals && kindFilter !== 'TASK' && statusFilter === 'ALL';
  const rows: Row[] = [
    ...(showTasks ? (data?.data ?? []).map((task): Row => ({ kind: 'task', due: task.dueDate ?? null, task })) : []),
    ...(showDeals
      ? (dealData?.data ?? [])
          .filter((d) => d.stage?.outcome === 'OPEN')
          .map((deal): Row => ({ kind: 'deal', due: deal.expectedCloseDate ?? null, deal }))
      : []),
  ].sort(byDue);

  const createMutation = useMutation({
    mutationFn: (values: TaskFormValues) => api.post('/tasks', cleanup(values)),
    onSuccess: () => {
      invalidate(['tasks', 'dashboard']);
      setDialogOpen(false);
      toast('Task created');
    },
    onError: (err) => toast(getApiErrorMessage(err), 'error'),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, statusId }: { id: string; statusId: string }) => api.patch(`/tasks/${id}`, { statusId }),
    onSuccess: () => {
      invalidate(['tasks', 'dashboard']);
      toast('Task updated');
    },
    onError: (err) => toast(getApiErrorMessage(err), 'error'),
  });

  const now = new Date();

  return (
    <div>
      <PageHeader
        title="Tasks"
        action={
          can('tasks.create') && (
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4" /> New Task
            </Button>
          )
        }
      />

      {canSeeDeals && (
        <Tabs value={kindFilter} onValueChange={(v) => setKindFilter(v as KindFilter)} className="mb-3">
          <TabsList aria-label="Show">
            <TabsTrigger value="ALL">Tasks and deals</TabsTrigger>
            <TabsTrigger value="TASK">Tasks only</TabsTrigger>
            <TabsTrigger value="DEAL">Open deals only</TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {kindFilter !== 'DEAL' && (
        <Tabs value={statusFilter} onValueChange={setStatusFilter} className="mb-4">
          <TabsList>
            <TabsTrigger value="ALL">All</TabsTrigger>
            {statuses.map((s) => (
              <TabsTrigger key={s.id} value={s.id}>{s.name}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

      {isLoading && <LoadingState />}
      {isError && <ErrorState message="Failed to load tasks" />}
      {data && rows.length === 0 && (
        <EmptyState
          title={kindFilter === 'DEAL' ? 'No open deals' : 'No tasks'}
          description={kindFilter === 'DEAL' ? 'Deals that are still open appear here.' : 'Create a task to track your follow-ups.'}
          action={kindFilter !== 'DEAL' && can('tasks.create') && <Button onClick={() => setDialogOpen(true)}>New Task</Button>}
        />
      )}

      {data && rows.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              {showDeals && <TableHead>Type</TableHead>}
              <TableHead>Title</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Assignee</TableHead>
              <TableHead>Related</TableHead>
              <TableHead><span className="sr-only">Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              if (row.kind === 'deal') {
                const d = row.deal;
                const late = d.expectedCloseDate && new Date(d.expectedCloseDate) < now;
                const taskCount = d._count?.tasks ?? 0;
                return (
                  <TableRow key={`deal-${d.id}`}>
                    <TableCell><Badge variant="info">Deal</Badge></TableCell>
                    <TableCell className="font-medium">
                      <Link to={`/deals/${d.id}`} className="hover:underline">{d.title}</Link>
                    </TableCell>
                    <TableCell className={cn(late && 'text-destructive font-medium')}>
                      {d.expectedCloseDate ? `Closes ${formatDate(d.expectedCloseDate)}` : '-'} {late && '(past close date)'}
                    </TableCell>
                    <TableCell>-</TableCell>
                    <TableCell><StageBadge stage={d.stage} /></TableCell>
                    <TableCell>{d.owner ? `${d.owner.firstName} ${d.owner.lastName}` : '-'}</TableCell>
                    <TableCell>
                      {[d.company?.name, d.person && `${d.person.firstName} ${d.person.lastName}`].filter(Boolean).join(' · ') || '-'}
                      <span className="block text-xs text-muted-foreground">
                        {taskCount === 1 ? '1 task under this deal' : `${taskCount} tasks under this deal`}
                      </span>
                    </TableCell>
                    <TableCell />
                  </TableRow>
                );
              }

              const t = row.task;
              const overdue = t.dueDate && new Date(t.dueDate) < now && !t.status.isDone;
              return (
                <TableRow key={t.id}>
                  {showDeals && <TableCell><Badge variant="outline">Task</Badge></TableCell>}
                  <TableCell className="font-medium">
                    {t.title}
                    {t.contact && <span className="block text-xs font-normal text-muted-foreground">From: {t.contact.subject}</span>}
                  </TableCell>
                  <TableCell className={cn(overdue && 'text-destructive font-medium')}>
                    {formatDate(t.dueDate)} {overdue && '(overdue)'}
                  </TableCell>
                  <TableCell><PriorityBadge priority={t.priority} /></TableCell>
                  <TableCell>
                    <Select
                      value={t.statusId}
                      options={statuses.map((s) => ({ value: s.id, label: s.name }))}
                      disabled={!can('tasks.edit')}
                      onValueChange={(v) => statusMutation.mutate({ id: t.id, statusId: v })}
                      className="h-7 w-36"
                    />
                  </TableCell>
                  <TableCell>{t.assignee ? `${t.assignee.firstName} ${t.assignee.lastName}` : '-'}</TableCell>
                  <TableCell>
                    {t.person && <Link to={`/people/${t.person.id}`} className="hover:underline">{t.person.firstName} {t.person.lastName}</Link>}
                    {t.person && t.deal && ' · '}
                    {t.deal && <Link to={`/deals/${t.deal.id}`} className="hover:underline">{t.deal.title}</Link>}
                    {!t.person && !t.deal && '-'}
                  </TableCell>
                  <TableCell><TaskActions task={t} /></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogHeader><DialogTitle>New Task</DialogTitle></DialogHeader>
        <TaskForm showAssociations onSubmit={(v) => createMutation.mutate(v)} onCancel={() => setDialogOpen(false)} submitting={createMutation.isPending} />
      </Dialog>
    </div>
  );
}
