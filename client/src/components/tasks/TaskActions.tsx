import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api';
import { useInvalidate, useMutation } from '@/hooks/queries';
import { Button } from '@/components/ui/button';
import { Dialog, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Notice } from '@/components/ui/notice';
import { TaskForm, toTaskChanges, type TaskFormValues } from '@/components/forms/TaskForm';
import { useToast } from '@/context/ToastContext';
import { usePermissions } from '@/hooks/usePermissions';
import type { Task } from '@/types';

/**
 * Edit and Delete for one task. Used wherever a task is listed, so every page
 * offers them the same way, and each button appears only to people allowed to use it.
 */
export function TaskActions({ task }: { task: Task }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const invalidate = useInvalidate();
  const { toast } = useToast();
  const { can } = usePermissions();

  const refresh = () => invalidate(['tasks', 'person', 'deal', 'deals', 'dashboard']);

  const save = useMutation({
    mutationFn: (values: TaskFormValues) => api.patch(`/tasks/${task.id}`, toTaskChanges(values)),
    onSuccess: () => {
      refresh();
      setEditing(false);
      toast('Task updated');
    },
    // Keep the dialog open so what was typed is not lost.
    onError: (err) => setError(getApiErrorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/tasks/${task.id}`),
    onSuccess: () => {
      refresh();
      toast('Task deleted');
    },
    onError: (err) => toast(getApiErrorMessage(err), 'error'),
  });

  const canEdit = can('tasks.edit');
  const canDelete = can('tasks.delete');
  if (!canEdit && !canDelete) return null;

  return (
    <>
      <span className="inline-flex items-center">
        {canEdit && (
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            aria-label={`Edit task: ${task.title}`}
            title="Edit"
            onClick={() => {
              setError(null);
              setEditing(true);
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
        {canDelete && (
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            aria-label={`Delete task: ${task.title}`}
            title="Delete"
            disabled={remove.isPending}
            onClick={() => {
              if (confirm(`Delete the task "${task.title}"?`)) remove.mutate();
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </span>
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogHeader>
          <DialogTitle>Edit task</DialogTitle>
        </DialogHeader>
        {error && (
          <Notice tone="error" role="alert" className="mb-3">
            {error}
          </Notice>
        )}
        <TaskForm
          initial={task}
          showAssociations
          onSubmit={(v) => {
            setError(null);
            save.mutate(v);
          }}
          onCancel={() => setEditing(false)}
          submitting={save.isPending}
        />
      </Dialog>
    </>
  );
}
