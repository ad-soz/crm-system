import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { DialogFooter } from '@/components/ui/dialog';
import { useState } from 'react';
import { useAllCompanies, useTitleSuggestions } from '@/hooks/queries';
import type { Person } from '@/types';

const schema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  title: z.string().optional(),
  companyId: z.string().optional(),
});

export type PersonFormValues = z.infer<typeof schema>;

export function PersonForm({
  initial,
  onSubmit,
  onCancel,
  submitting,
}: {
  initial?: Partial<Person>;
  onSubmit: (values: PersonFormValues) => void;
  onCancel: () => void;
  submitting?: boolean;
}) {
  const { data: companies } = useAllCompanies();
  const [titleQuery, setTitleQuery] = useState(initial?.title ?? '');
  const { data: titleSuggestions } = useTitleSuggestions(titleQuery);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PersonFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: initial?.firstName ?? '',
      lastName: initial?.lastName ?? '',
      email: initial?.email ?? '',
      phone: initial?.phone ?? '',
      title: initial?.title ?? '',
      companyId: initial?.companyId ?? '',
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="firstName">First name *</Label>
          <Input id="firstName" {...register('firstName')} />
          {errors.firstName && <p className="text-xs text-destructive">{errors.firstName.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lastName">Last name *</Label>
          <Input id="lastName" {...register('lastName')} />
          {errors.lastName && <p className="text-xs text-destructive">{errors.lastName.message}</p>}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" {...register('email')} />
        {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" {...register('phone')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="title">Title</Label>
          {/* Free text, with suggestions drawn from job titles already in use. */}
          <Input
            id="title"
            list="person-title-suggestions"
            autoComplete="off"
            {...register('title', {
              onChange: (e) => setTitleQuery(e.target.value),
            })}
          />
          <datalist id="person-title-suggestions">
            {(titleSuggestions ?? []).map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="companyId">Company</Label>
        <Select
          id="companyId"
          placeholder="No company"
          options={(companies ?? []).map((c) => ({ value: c.id, label: c.name }))}
          {...register('companyId')}
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving...' : 'Save'}
        </Button>
      </DialogFooter>
    </form>
  );
}
