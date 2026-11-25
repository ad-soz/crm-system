import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { LogOut } from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api';
import { useMutation } from '@/hooks/queries';
import { useAuth } from '@/context/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/context/ToastContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { User } from '@/types';

const profileSchema = z.object({
  firstName: z.string().min(1, 'Required'),
  lastName: z.string().min(1, 'Required'),
  email: z.string().email('Invalid email'),
});
type ProfileValues = z.infer<typeof profileSchema>;

/** Settings > My details: your name and email, your role profile, and a way to change your password. */
export function MyDetailsSection() {
  const { user, updateUser, logout } = useAuth();
  const { can } = usePermissions();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: (values: ProfileValues) => api.patch<User>(`/users/${user!.id}`, values),
    onSuccess: (res) => {
      // The response doesn't include permissions; keep the ones we have.
      updateUser({ ...user!, ...res.data, permissions: user!.permissions });
      toast('Details updated');
    },
    onError: (err) => toast(getApiErrorMessage(err), 'error'),
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    values: user ? { firstName: user.firstName, lastName: user.lastName, email: user.email } : undefined,
  });

  if (!user) return null;

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>My details</CardTitle>
        <p className="text-sm text-muted-foreground">
          {user.roleProfile ? (
            <>
              Role profile: <span className="font-medium text-foreground">{user.roleProfile.name}</span>.{' '}
            </>
          ) : null}
          {can('users.manage')
            ? 'You can change role profiles under Users.'
            : 'To change your role profile, ask someone who manages users.'}
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="firstName">First name</Label>
              <Input id="firstName" {...register('firstName')} />
              {errors.firstName && <p className="text-xs text-destructive">{errors.firstName.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName">Last name</Label>
              <Input id="lastName" {...register('lastName')} />
              {errors.lastName && <p className="text-xs text-destructive">{errors.lastName.message}</p>}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" {...register('email')} />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving...' : 'Save details'}
            </Button>
            <Link to="/account" className="text-sm text-muted-foreground underline hover:text-foreground">
              Change my password
            </Link>
            <Button
              type="button"
              variant="ghost"
              onClick={logout}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
