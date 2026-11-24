import { useForm } from 'react-hook-form';
import { Notice } from '@/components/ui/notice';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { DialogFooter } from '@/components/ui/dialog';
import { useUsersForAssignee } from '@/hooks/useUsersForAssignee';
import { useAllPeople, useDeals, useActiveReferenceValues } from '@/hooks/queries';
import type { Task } from '@/types';

const schema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  dueDate: z.string().optional(),
  priorityId: z.string().optional(),
  statusId: z.string().optional(),
  assigneeId: z.string().optional(),
  personId: z.string().optional(),
  dealId: z.string().optional(),
  contactId: z.string().optional(),
});

export type TaskFormValues = z.infer<typeof schema>;

/**
 * What to send when saving changes to an existing task.
 *
 * Creating a task leaves blank boxes out. Editing must be able to empty them, so a
 * blank due date, person, deal or contact is sent as null (meaning 'none'), and a
 * blank description is sent as empty text. A blank status, priority or assignee
 * means 'leave as it is'.
 */
export function toTaskChanges(v: TaskFormValues) {
  return {
    title: v.title,
    description: v.description ?? '',
    dueDate: v.dueDate || null,
    priorityId: v.priorityId || undefined,
    statusId: v.statusId || undefined,
    assigneeId: v.assigneeId || undefined,
    personId: v.personId || null,
    dealId: v.dealId || null,
    contactId: v.contactId || null,
  };
}

export function TaskForm({
  initial,
  fixedPersonId,
  fixedDealId,
  fixedContactId,
  suggestedTitle,
  showAssociations = false,
  onSubmit,
  onCancel,
  submitting,
}: {
  initial?: Partial<Task>;
  fixedPersonId?: string;
  fixedDealId?: string;
  /** Make the task follow up this Contact. The person and deal come from the Contact. */
  fixedContactId?: string;
  /** Pre-fills the title (only when there is no existing task being edited). */
  suggestedTitle?: string;
  showAssociations?: boolean;
  onSubmit: (values: TaskFormValues) => void;
  onCancel: () => void;
  submitting?: boolean;
}) {
  const { assignees } = useUsersForAssignee();
  const { data: people } = useAllPeople();
  const { data: deals } = useDeals();
  const { values: priorities } = useActiveReferenceValues('task-priorities');
  const { values: statuses } = useActiveReferenceValues('task-statuses');

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<TaskFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: initial?.title ?? suggestedTitle ?? '',
      description: initial?.description ?? '',
      dueDate: initial?.dueDate ? initial.dueDate.slice(0, 10) : '',
      priorityId: initial?.priorityId ?? '',
      statusId: initial?.statusId ?? '',
      assigneeId: initial?.assigneeId ?? '',
      personId: fixedPersonId ?? initial?.personId ?? '',
      dealId: fixedDealId ?? initial?.dealId ?? '',
      contactId: fixedContactId ?? initial?.contactId ?? '',
    },
  });

  // When editing a task that came from a contact, say so and let the link be removed.
  const cameFrom = !fixedContactId ? initial?.contact : null;
  const contactLink = watch('contactId');

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="title">Title *</Label>
        <Input id="title" {...register('title')} />
        {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="t-description">Description</Label>
        <Textarea id="t-description" {...register('description')} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="dueDate">Due date</Label>
          <Input id="dueDate" type="date" {...register('dueDate')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="assigneeId">Assignee</Label>
          <Select
            id="assigneeId"
            placeholder="Me"
            options={assignees.map((u) => ({ value: u.id, label: `${u.firstName} ${u.lastName}` }))}
            {...register('assigneeId')}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="priority">Priority</Label>
          <Select
            id="priority"
            placeholder={initial?.priorityId ? undefined : 'Default'}
            options={priorities.map((p) => ({ value: p.id, label: p.name }))}
            {...register('priorityId')}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="status">Status</Label>
          <Select
            id="status"
            placeholder={initial?.statusId ? undefined : 'Default'}
            options={statuses.map((s) => ({ value: s.id, label: s.name }))}
            {...register('statusId')}
          />
        </div>
      </div>
      {cameFrom && (
        <Notice className="flex items-center justify-between gap-2">
          <span>{contactLink ? <>Follows up: <strong>{cameFrom.subject}</strong></> : 'Will no longer follow up a contact.'}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setValue('contactId', contactLink ? '' : cameFrom.id)}
          >
            {contactLink ? 'Remove link' : 'Undo'}
          </Button>
        </Notice>
      )}
      {showAssociations && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="t-personId">Person</Label>
            <Select
              id="t-personId"
              placeholder="None"
              options={(people ?? []).map((c) => ({ value: c.id, label: `${c.firstName} ${c.lastName}` }))}
              {...register('personId')}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-dealId">Deal</Label>
            <Select
              id="t-dealId"
              placeholder="None"
              options={(deals?.data ?? []).map((d) => ({ value: d.id, label: d.title }))}
              {...register('dealId')}
            />
          </div>
        </div>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={submitting}>{submitting ? 'Saving...' : 'Save'}</Button>
      </DialogFooter>
    </form>
  );
}
