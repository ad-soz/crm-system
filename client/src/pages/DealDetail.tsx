import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Copy, Pencil, Trash2, Plus } from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api';
import { useDeal, useInvalidate, useMutation, useActiveReferenceValues } from '@/hooks/queries';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LoadingState, ErrorState } from '@/components/states';
import { DealForm, type DealFormValues } from '@/components/forms/DealForm';
import { StageChangeDialog } from '@/components/deals/StageChangeDialog';
import { StageHistoryCard } from '@/components/deals/StageHistoryCard';
import { DuplicateDealDialog } from '@/components/deals/DuplicateDealDialog';
import { ContactForm, type ContactFormValues } from '@/components/forms/ContactForm';
import { TaskForm, type TaskFormValues } from '@/components/forms/TaskForm';
import { RecordHistory } from '@/components/audit/RecordHistory';
import { FollowUpButton } from '@/components/tasks/FollowUpButton';
import { TaskListItem } from '@/components/tasks/TaskListItem';
import { ContactIcon } from '@/lib/display';
import { formatCurrency, formatDate } from '@/lib/utils';
import { cleanup } from '@/pages/Companies';
import { useToast } from '@/context/ToastContext';
import { usePermissions } from '@/hooks/usePermissions';

export default function DealDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const { toast } = useToast();
  const { can } = usePermissions();
  const [editOpen, setEditOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);

  const { data: deal, isLoading, isError } = useDeal(id);
  const { values: stages } = useActiveReferenceValues('deal-stages');

  const updateMutation = useMutation({
    mutationFn: (values: Partial<DealFormValues>) => api.patch(`/deals/${id}`, cleanup(values)),
    onSuccess: () => {
      invalidate(['deal', 'deals', 'pipeline', 'dashboard', 'deal-history']);
      setEditOpen(false);
      toast('Deal updated');
    },
    onError: (err) => toast(getApiErrorMessage(err), 'error'),
  });

  // Clicking a stage proposes a move; it happens when a reason is given.
  const [targetStageId, setTargetStageId] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const moveMutation = useMutation({
    mutationFn: ({ stageId, stageComment }: { stageId: string; stageComment: string }) =>
      api.patch(`/deals/${id}`, { stageId, stageComment }),
    onSuccess: () => {
      invalidate(['deal', 'deals', 'pipeline', 'dashboard', 'deal-history']);
      setTargetStageId(null);
      setMoveError(null);
      toast('Deal moved');
    },
    // Keep the dialog open so what was typed isn't lost.
    onError: (err) => setMoveError(getApiErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/deals/${id}`),
    onSuccess: () => {
      invalidate(['deals', 'pipeline', 'dashboard']);
      toast('Deal deleted');
      navigate('/deals');
    },
    onError: (err) => toast(getApiErrorMessage(err), 'error'),
  });

  const contactMutation = useMutation({
    mutationFn: (values: ContactFormValues) => api.post('/contacts', cleanup(values)),
    onSuccess: () => {
      invalidate(['deal', 'contacts', 'dashboard']);
      setContactOpen(false);
      toast('Contact logged');
    },
    onError: (err) => toast(getApiErrorMessage(err), 'error'),
  });

  const taskMutation = useMutation({
    mutationFn: (values: TaskFormValues) => api.post('/tasks', cleanup(values)),
    onSuccess: () => {
      invalidate(['deal', 'tasks', 'dashboard']);
      setTaskOpen(false);
      toast('Task created');
    },
    onError: (err) => toast(getApiErrorMessage(err), 'error'),
  });

  if (isLoading) return <LoadingState />;
  if (isError || !deal) return <ErrorState message="Deal not found" />;

  return (
    <div>
      <Button variant="ghost" size="sm" onClick={() => navigate('/deals')} className="mb-4">
        <ArrowLeft className="h-4 w-4" /> Back
      </Button>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{deal.title}</h1>
          <p className="text-sm text-muted-foreground">{formatCurrency(deal.amount)}</p>
        </div>
        <div className="flex gap-2">
          {can('deals.edit') && (
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          )}
          {can('deals.create') && (
            <Button variant="outline" size="sm" onClick={() => setDuplicateOpen(true)}>
              <Copy className="h-4 w-4" /> Duplicate
            </Button>
          )}
          {can('deals.delete') && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (confirm('Delete this deal?')) deleteMutation.mutate();
              }}
            >
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          )}
        </div>
      </div>

      <Card className="mb-6">
        <CardHeader><CardTitle>Stage</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {stages.map((s) => (
              <Button
                key={s.id}
                size="sm"
                variant={deal.stageId === s.id ? 'default' : 'outline'}
                disabled={!can('deals.edit')}
                onClick={() => {
                  if (deal.stageId === s.id) return;
                  setMoveError(null);
                  setTargetStageId(s.id);
                }}
              >
                {s.name}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <StageHistoryCard dealId={deal.id} />

      <StageChangeDialog
        open={targetStageId !== null}
        dealTitle={deal.title}
        from={deal.stage}
        to={stages.find((s) => s.id === targetStageId)}
        submitting={moveMutation.isPending}
        error={moveError}
        onConfirm={(stageComment) => targetStageId && moveMutation.mutate({ stageId: targetStageId, stageComment })}
        onCancel={() => {
          setTargetStageId(null);
          setMoveError(null);
        }}
      />

      <Card className="mb-6">
        <CardHeader><CardTitle>Details</CardTitle></CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <span className="text-muted-foreground">Company: </span>
            {deal.company ? <Link to={`/companies/${deal.company.id}`} className="hover:underline">{deal.company.name}</Link> : '-'}
          </div>
          <div>
            <span className="text-muted-foreground">Person: </span>
            {deal.person ? <Link to={`/people/${deal.person.id}`} className="hover:underline">{deal.person.firstName} {deal.person.lastName}</Link> : '-'}
          </div>
          <div><span className="text-muted-foreground">Owner: </span>{deal.owner ? `${deal.owner.firstName} ${deal.owner.lastName}` : '-'}</div>
          <div><span className="text-muted-foreground">Expected close: </span>{formatDate(deal.expectedCloseDate)}</div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Contacts</CardTitle>
            {can('contacts.create') && (
              <Button size="sm" variant="outline" onClick={() => setContactOpen(true)}>
                <Plus className="h-4 w-4" /> Log
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {(deal.contacts ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No contacts.</p>
            ) : (
              <ul className="space-y-3">
                {deal.contacts!.map((a) => (
                  <li key={a.id} className="flex items-start gap-3">
                    <ContactIcon type={a.type} />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{a.subject}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(a.createdAt)}</p>
                    </div>
                    <FollowUpButton contact={a} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Tasks</CardTitle>
            {can('tasks.create') && (
              <Button size="sm" variant="outline" onClick={() => setTaskOpen(true)}>
                <Plus className="h-4 w-4" /> Add
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {(deal.tasks ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No tasks.</p>
            ) : (
              <ul className="space-y-2">
                {deal.tasks!.map((t) => (
                  <TaskListItem key={t.id} task={t} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <RecordHistory entity="deals" recordId={deal.id} />

      <DuplicateDealDialog
        deal={duplicateOpen ? deal : null}
        onClose={() => setDuplicateOpen(false)}
        onCreated={(created) => navigate(`/deals/${created.id}`)}
      />

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogHeader><DialogTitle>Edit Deal</DialogTitle></DialogHeader>
        <DealForm initial={deal} onSubmit={(v) => updateMutation.mutate(v)} onCancel={() => setEditOpen(false)} submitting={updateMutation.isPending} />
      </Dialog>

      <Dialog open={contactOpen} onOpenChange={setContactOpen}>
        <DialogHeader><DialogTitle>Log Contact</DialogTitle></DialogHeader>
        <ContactForm fixedDealId={deal.id} onSubmit={(v) => contactMutation.mutate(v)} onCancel={() => setContactOpen(false)} submitting={contactMutation.isPending} />
      </Dialog>

      <Dialog open={taskOpen} onOpenChange={setTaskOpen}>
        <DialogHeader><DialogTitle>Add Task</DialogTitle></DialogHeader>
        <TaskForm fixedDealId={deal.id} onSubmit={(v) => taskMutation.mutate(v)} onCancel={() => setTaskOpen(false)} submitting={taskMutation.isPending} />
      </Dialog>
    </div>
  );
}
