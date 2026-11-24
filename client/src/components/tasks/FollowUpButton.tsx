import { useState } from 'react';
import { ListPlus } from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api';
import { useInvalidate, useMutation } from '@/hooks/queries';
import { Button } from '@/components/ui/button';
import { Dialog, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TaskForm, type TaskFormValues } from '@/components/forms/TaskForm';
import { cleanup } from '@/pages/Companies';
import { useToast } from '@/context/ToastContext';
import { usePermissions } from '@/hooks/usePermissions';

/**
 * "Follow up": spawn a task from a Contact (a call, email, meeting or note).
 *
 * Used wherever a Contact is shown, so every page offers it the same way. The task
 * is about the same person and deal as the Contact; the server fills those in.
 */
export function FollowUpButton({ contact }: { contact: { id: string; subject: string } }) {
  const [open, setOpen] = useState(false);
  const invalidate = useInvalidate();
  const { toast } = useToast();
  const { can } = usePermissions();

  const create = useMutation({
    mutationFn: (values: TaskFormValues) => api.post('/tasks', cleanup(values)),
    onSuccess: () => {
      invalidate(['tasks', 'person', 'deal', 'deals', 'dashboard']);
      setOpen(false);
      toast('Follow-up task created');
    },
    onError: (err) => toast(getApiErrorMessage(err), 'error'),
  });

  if (!can('tasks.create')) return null;

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-xs"
        aria-label={`Follow up: ${contact.subject}`}
        onClick={() => setOpen(true)}
      >
        <ListPlus className="h-3.5 w-3.5" /> Follow up
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogHeader>
          <DialogTitle>Follow up</DialogTitle>
        </DialogHeader>
        <p className="mb-3 text-sm text-muted-foreground">New task from: {contact.subject}</p>
        <TaskForm
          fixedContactId={contact.id}
          suggestedTitle={`Follow up: ${contact.subject}`}
          onSubmit={(v) => create.mutate(v)}
          onCancel={() => setOpen(false)}
          submitting={create.isPending}
        />
      </Dialog>
    </>
  );
}
