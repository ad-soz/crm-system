import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Pencil, Trash2, Plus } from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api';
import { usePerson, useInvalidate, useMutation } from '@/hooks/queries';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LoadingState, ErrorState } from '@/components/states';
import { PersonForm, type PersonFormValues } from '@/components/forms/PersonForm';
import { ContactForm, type ContactFormValues } from '@/components/forms/ContactForm';
import { TaskForm, type TaskFormValues } from '@/components/forms/TaskForm';
import { RecordHistory } from '@/components/audit/RecordHistory';
import { FollowUpButton } from '@/components/tasks/FollowUpButton';
import { TaskListItem } from '@/components/tasks/TaskListItem';
import { ContactIcon, StageBadge } from '@/lib/display';
import { formatCurrency, formatDate } from '@/lib/utils';
import { cleanup } from '@/pages/Companies';
import { useToast } from '@/context/ToastContext';
import { usePermissions } from '@/hooks/usePermissions';

export default function PersonDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const { toast } = useToast();
  const { can } = usePermissions();
  const [editOpen, setEditOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);

  const { data: person, isLoading, isError } = usePerson(id);

  const updateMutation = useMutation({
    mutationFn: (values: PersonFormValues) => api.patch(`/people/${id}`, cleanup(values)),
    onSuccess: () => {
      invalidate(['person', 'people']);
      setEditOpen(false);
      toast('Person updated');
    },
    onError: (err) => toast(getApiErrorMessage(err), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/people/${id}`),
    onSuccess: () => {
      invalidate(['people', 'dashboard']);
      toast('Person deleted');
      navigate('/people');
    },
    onError: (err) => toast(getApiErrorMessage(err), 'error'),
  });

  const contactMutation = useMutation({
    mutationFn: (values: ContactFormValues) => api.post('/contacts', cleanup(values)),
    onSuccess: () => {
      invalidate(['person', 'contacts', 'dashboard']);
      setContactOpen(false);
      toast('Contact logged');
    },
    onError: (err) => toast(getApiErrorMessage(err), 'error'),
  });

  const taskMutation = useMutation({
    mutationFn: (values: TaskFormValues) => api.post('/tasks', cleanup(values)),
    onSuccess: () => {
      invalidate(['person', 'tasks', 'dashboard']);
      setTaskOpen(false);
      toast('Task created');
    },
    onError: (err) => toast(getApiErrorMessage(err), 'error'),
  });

  if (isLoading) return <LoadingState />;
  if (isError || !person) return <ErrorState message="Person not found" />;

  return (
    <div>
      <Button variant="ghost" size="sm" onClick={() => navigate('/people')} className="mb-4">
        <ArrowLeft className="h-4 w-4" /> Back
      </Button>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{person.firstName} {person.lastName}</h1>
          <p className="text-sm text-muted-foreground">
            {person.title}
            {person.company && (
              <>
                {person.title ? ' · ' : ''}
                <Link to={`/companies/${person.company.id}`} className="hover:underline">
                  {person.company.name}
                </Link>
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {can('people.edit') && (
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          )}
          {can('people.delete') && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (confirm('Delete this person?')) deleteMutation.mutate();
              }}
            >
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div><span className="text-muted-foreground">Email: </span>{person.email ?? '-'}</div>
            <div><span className="text-muted-foreground">Phone: </span>{person.phone ?? '-'}</div>
            <div><span className="text-muted-foreground">Owner: </span>{person.owner ? `${person.owner.firstName} ${person.owner.lastName}` : '-'}</div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Contact Timeline</CardTitle>
            {can('contacts.create') && (
              <Button size="sm" variant="outline" onClick={() => setContactOpen(true)}>
                <Plus className="h-4 w-4" /> Log Contact
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {(person.contacts ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No contacts yet.</p>
            ) : (
              <ul className="space-y-3">
                {person.contacts!.map((a) => (
                  <li key={a.id} className="flex items-start gap-3">
                    <ContactIcon type={a.type} />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{a.subject}</p>
                      {a.description && <p className="text-sm text-muted-foreground">{a.description}</p>}
                      <p className="text-xs text-muted-foreground">{formatDate(a.createdAt)}</p>
                    </div>
                    <FollowUpButton contact={a} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Tasks</CardTitle>
            {can('tasks.create') && (
              <Button size="sm" variant="outline" onClick={() => setTaskOpen(true)}>
                <Plus className="h-4 w-4" /> Add Task
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {(person.tasks ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No tasks.</p>
            ) : (
              <ul className="space-y-2">
                {person.tasks!.map((t) => (
                  <TaskListItem key={t.id} task={t} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Deals</CardTitle></CardHeader>
          <CardContent>
            {(person.deals ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No deals.</p>
            ) : (
              <ul className="space-y-2">
                {person.deals!.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2">
                    <Link to={`/deals/${d.id}`} className="text-sm font-medium hover:underline">
                      {d.title}
                    </Link>
                    <div className="flex items-center gap-2">
                      <StageBadge stage={d.stage} />
                      <span className="text-sm">{formatCurrency(d.amount)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <RecordHistory entity="people" recordId={person.id} />

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogHeader><DialogTitle>Edit Person</DialogTitle></DialogHeader>
        <PersonForm initial={person} onSubmit={(v) => updateMutation.mutate(v)} onCancel={() => setEditOpen(false)} submitting={updateMutation.isPending} />
      </Dialog>

      <Dialog open={contactOpen} onOpenChange={setContactOpen}>
        <DialogHeader><DialogTitle>Log Contact</DialogTitle></DialogHeader>
        <ContactForm fixedPersonId={person.id} onSubmit={(v) => contactMutation.mutate(v)} onCancel={() => setContactOpen(false)} submitting={contactMutation.isPending} />
      </Dialog>

      <Dialog open={taskOpen} onOpenChange={setTaskOpen}>
        <DialogHeader><DialogTitle>Add Task</DialogTitle></DialogHeader>
        <TaskForm fixedPersonId={person.id} onSubmit={(v) => taskMutation.mutate(v)} onCancel={() => setTaskOpen(false)} submitting={taskMutation.isPending} />
      </Dialog>
    </div>
  );
}
