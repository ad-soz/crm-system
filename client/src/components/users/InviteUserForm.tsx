import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { DialogFooter } from '@/components/ui/dialog';
import type { RoleProfile } from '@/types';

const schema = z.object({
  firstName: z.string().trim().min(1, 'Required').max(100),
  lastName: z.string().trim().min(1, 'Required').max(100),
  email: z.string().trim().email('Enter a valid email'),
  roleProfileId: z.string().min(1, 'Choose a role profile'),
});

export type InviteValues = z.infer<typeof schema>;

export function InviteUserForm({
  profiles,
  onSubmit,
  onCancel,
  submitting,
  error,
}: {
  /** Profiles the current user is allowed to hand out. */
  profiles: RoleProfile[];
  onSubmit: (values: InviteValues) => void;
  onCancel: () => void;
  submitting?: boolean;
  error?: string | null;
}) {
  const defaultProfile = profiles.find((p) => !p.isSystem) ?? profiles[0];
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<InviteValues>({
    resolver: zodResolver(schema),
    defaultValues: { roleProfileId: defaultProfile?.id ?? '' },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="invite-first">First name</Label>
          <Input id="invite-first" {...register('firstName')} />
          {errors.firstName && <p className="text-xs text-destructive">{errors.firstName.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="invite-last">Last name</Label>
          <Input id="invite-last" {...register('lastName')} />
          {errors.lastName && <p className="text-xs text-destructive">{errors.lastName.message}</p>}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="invite-email">Email</Label>
        <Input id="invite-email" type="email" {...register('email')} />
        {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="invite-profile">Role profile</Label>
        <Select
          id="invite-profile"
          placeholder="Choose a profile"
          options={profiles.map((p) => ({ value: p.id, label: p.name }))}
          {...register('roleProfileId')}
        />
        {errors.roleProfileId && <p className="text-xs text-destructive">{errors.roleProfileId.message}</p>}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting || profiles.length === 0}>
          {submitting ? 'Inviting...' : 'Invite'}
        </Button>
      </DialogFooter>
    </form>
  );
}
