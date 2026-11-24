import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DialogFooter } from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import { useActiveReferenceValues, useReferenceCatalog } from '@/hooks/queries';
import type { Company } from '@/types';
import { Card } from '@/components/ui/card';

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  industryIds: z.array(z.string()).optional(),
  website: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  address: z.string().optional(),
});

export type CompanyFormValues = z.infer<typeof schema>;

export function CompanyForm({
  initial,
  onSubmit,
  onCancel,
  submitting,
}: {
  initial?: Partial<Company>;
  onSubmit: (values: CompanyFormValues) => void;
  onCancel: () => void;
  submitting?: boolean;
}) {
  const { values: industries } = useActiveReferenceValues('industries');
  const { data: catalog } = useReferenceCatalog();
  // Whether the admin has turned on choosing several industries at once.
  const allowMultiple = catalog?.lists.find((l) => l.key === 'industries')?.allowMultiple ?? false;

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<CompanyFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initial?.name ?? '',
      industryIds: initial?.industries?.map((i) => i.id) ?? [],
      website: initial?.website ?? '',
      phone: initial?.phone ?? '',
      email: initial?.email ?? '',
      address: initial?.address ?? '',
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="name">Name *</Label>
        <Input id="name" {...register('name')} />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="industry">{allowMultiple ? 'Industries' : 'Industry'}</Label>
        <Controller
          control={control}
          name="industryIds"
          render={({ field }) => {
            const selected = field.value ?? [];
            if (allowMultiple) {
              // A compact checklist so several industries can be chosen.
              return (
                <Card flat id="industry" className="flex flex-wrap gap-x-4 gap-y-2 p-3">
                  {industries.length === 0 && (
                    <span className="text-sm text-muted-foreground">No industries defined yet.</span>
                  )}
                  {industries.map((ind) => {
                    const checked = selected.includes(ind.id);
                    return (
                      <label key={ind.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-input"
                          checked={checked}
                          onChange={(e) =>
                            field.onChange(
                              e.target.checked
                                ? [...selected, ind.id]
                                : selected.filter((id) => id !== ind.id),
                            )
                          }
                        />
                        {ind.name}
                      </label>
                    );
                  })}
                </Card>
              );
            }
            // Single choice uses a plain dropdown.
            return (
              <Select
                id="industry"
                placeholder="None"
                options={industries.map((ind) => ({ value: ind.id, label: ind.name }))}
                value={selected[0] ?? ''}
                onValueChange={(v) => field.onChange(v ? [v] : [])}
              />
            );
          }}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="website">Website</Label>
          <Input id="website" {...register('website')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" {...register('phone')} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="c-email">Email</Label>
          <Input id="c-email" {...register('email')} />
          {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="address">Address</Label>
          <Input id="address" {...register('address')} />
        </div>
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
