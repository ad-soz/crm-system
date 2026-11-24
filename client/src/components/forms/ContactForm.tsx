import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { DialogFooter } from '@/components/ui/dialog';
import { useAllPeople, useDeals, useActiveReferenceValues } from '@/hooks/queries';

const schema = z
  .object({
    typeId: z.string().optional(),
    subject: z.string().min(1, 'Subject is required'),
    description: z.string().optional(),
    personId: z.string().optional(),
    dealId: z.string().optional(),
  })
  .refine((d) => d.personId || d.dealId, {
    message: 'Select a person or a deal',
    path: ['personId'],
  });

export type ContactFormValues = z.infer<typeof schema>;

export function ContactForm({
  fixedPersonId,
  fixedDealId,
  showAssociations = false,
  onSubmit,
  onCancel,
  submitting,
}: {
  fixedPersonId?: string;
  fixedDealId?: string;
  showAssociations?: boolean;
  onSubmit: (values: ContactFormValues) => void;
  onCancel: () => void;
  submitting?: boolean;
}) {
  const { data: people } = useAllPeople();
  const { data: deals } = useDeals();
  const { values: types } = useActiveReferenceValues('contact-types');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ContactFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      typeId: '',
      subject: '',
      description: '',
      personId: fixedPersonId ?? '',
      dealId: fixedDealId ?? '',
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="type">Type</Label>
        <Select
          id="type"
          placeholder="Default"
          options={types.map((t) => ({ value: t.id, label: t.name }))}
          {...register('typeId')}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="subject">Subject *</Label>
        <Input id="subject" {...register('subject')} />
        {errors.subject && <p className="text-xs text-destructive">{errors.subject.message}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" {...register('description')} />
      </div>
      {showAssociations && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="personId">Person</Label>
            <Select
              id="personId"
              placeholder="None"
              options={(people ?? []).map((c) => ({ value: c.id, label: `${c.firstName} ${c.lastName}` }))}
              {...register('personId')}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dealId">Deal</Label>
            <Select
              id="dealId"
              placeholder="None"
              options={(deals?.data ?? []).map((d) => ({ value: d.id, label: d.title }))}
              {...register('dealId')}
            />
          </div>
        </div>
      )}
      {errors.personId && <p className="text-xs text-destructive">{errors.personId.message}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={submitting}>{submitting ? 'Saving...' : 'Save'}</Button>
      </DialogFooter>
    </form>
  );
}
