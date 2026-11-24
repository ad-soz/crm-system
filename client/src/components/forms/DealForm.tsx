import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { DialogFooter } from '@/components/ui/dialog';
import { useAllCompanies, useAllPeople, useActiveReferenceValues } from '@/hooks/queries';
import type { Deal } from '@/types';

const schema = z.object({
  title: z.string().min(1, 'Title is required'),
  amount: z.coerce.number().min(0, 'Amount must be 0 or more'),
  stageId: z.string().optional(),
  companyId: z.string().optional(),
  personId: z.string().optional(),
  expectedCloseDate: z.string().optional(),
  // Why the deal is moving to another stage. Required when editing a deal and changing its stage.
  stageComment: z.string().max(1000, 'Keep it under 1000 characters').optional(),
});

export type DealFormValues = z.infer<typeof schema>;

export function DealForm({
  initial,
  onSubmit,
  onCancel,
  submitting,
  autoFocusTitle = false,
  submitLabel = 'Save',
}: {
  initial?: Partial<Deal>;
  /** Put the cursor in the title with its text selected, so a new name can be typed straight over it. */
  autoFocusTitle?: boolean;
  submitLabel?: string;
  onSubmit: (values: DealFormValues) => void;
  onCancel: () => void;
  submitting?: boolean;
}) {
  const { data: companies } = useAllCompanies();
  const { data: people } = useAllPeople();
  const { values: stages } = useActiveReferenceValues('deal-stages');

  const {
    register,
    handleSubmit,
    watch,
    setError,
    setFocus,
    formState: { errors },
  } = useForm<DealFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: initial?.title ?? '',
      amount: initial?.amount ?? 0,
      stageId: initial?.stageId ?? '',
      companyId: initial?.companyId ?? '',
      personId: initial?.personId ?? '',
      expectedCloseDate: initial?.expectedCloseDate ? initial.expectedCloseDate.slice(0, 10) : '',
      stageComment: '',
    },
  });

  useEffect(() => {
    if (autoFocusTitle) setFocus('title', { shouldSelect: true });
  }, [autoFocusTitle, setFocus]);

  // Editing an existing deal and picking a different stage is a stage move: it needs a reason.
  const chosenStage = watch('stageId');
  const moving = !!initial?.stageId && !!chosenStage && chosenStage !== initial.stageId;

  const submit = handleSubmit((values) => {
    if (moving && !values.stageComment?.trim()) {
      setError('stageComment', { type: 'required', message: 'Add a comment to explain why the deal is moving' });
      return;
    }
    // The reason only travels with a real move.
    onSubmit(moving ? { ...values, stageComment: values.stageComment!.trim() } : { ...values, stageComment: undefined });
  });

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="title">Title *</Label>
        <Input id="title" {...register('title')} />
        {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="amount">Amount *</Label>
          <Input id="amount" type="number" step="0.01" {...register('amount')} />
          {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="stage">Stage</Label>
          <Select
            id="stage"
            placeholder={initial?.stageId ? undefined : 'Default'}
            options={stages.map((s) => ({ value: s.id, label: s.name }))}
            {...register('stageId')}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="d-companyId">Company</Label>
          <Select
            id="d-companyId"
            placeholder="None"
            options={(companies ?? []).map((c) => ({ value: c.id, label: c.name }))}
            {...register('companyId')}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="d-personId">Person</Label>
          <Select
            id="d-personId"
            placeholder="None"
            options={(people ?? []).map((c) => ({ value: c.id, label: `${c.firstName} ${c.lastName}` }))}
            {...register('personId')}
          />
        </div>
      </div>
      {moving && (
        <div className="space-y-1.5">
          <Label htmlFor="d-stageComment">Why is it moving to this stage? *</Label>
          <Textarea
            id="d-stageComment"
            rows={3}
            aria-invalid={!!errors.stageComment}
            aria-describedby="d-stageComment-help"
            {...register('stageComment')}
          />
          <p id="d-stageComment-help" className="text-xs text-muted-foreground">
            Saved with the date and time and your name, in the deal's stage history.
          </p>
          {errors.stageComment && <p role="alert" className="text-xs text-destructive">{errors.stageComment.message}</p>}
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="expectedCloseDate">Expected close date</Label>
        <Input id="expectedCloseDate" type="date" {...register('expectedCloseDate')} />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={submitting}>{submitting ? 'Saving...' : submitLabel}</Button>
      </DialogFooter>
    </form>
  );
}
