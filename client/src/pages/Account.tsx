import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/states';
import type { User } from '@/types';

// Keep in sync with server/src/auth/passwords.ts.
const MIN = 10;
const MAX = 72;

const schema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z
      .string()
      .min(MIN, `Use at least ${MIN} characters`)
      .max(MAX, `Use ${MAX} characters or fewer`),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: 'The passwords do not match',
    path: ['confirmPassword'],
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    message: 'Choose a password different from your current one',
    path: ['newPassword'],
  });

type FormValues = z.infer<typeof schema>;

export default function Account() {
  const { user, setSession, logout } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const forced = !!user?.mustChangePassword;

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    try {
      const res = await api.post<{ accessToken: string; user: User }>('/auth/change-password', {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      // The change ends all other sessions; keep this one with the new token.
      setSession(res.data.accessToken, res.data.user);
      reset();
      toast('Your password was changed');
      if (forced) navigate('/dashboard', { replace: true });
    } catch (err) {
      setError('root', { message: getApiErrorMessage(err) });
    }
  };

  return (
    <div>
      <PageHeader title="Account" description={user ? `Signed in as ${user.email}` : undefined} />

      {forced && (
        <Notice tone="warning" role="alert" className="mb-6 flex max-w-lg items-start gap-3 p-4">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            You're using a temporary password. Choose your own to continue. Use your temporary
            password as the current password.
          </p>
        </Notice>
      )}

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="text-base">Change password</CardTitle>
          <p className="text-sm text-muted-foreground">
            Use at least {MIN} characters. A few unrelated words make a strong, memorable password.
            Changing it signs you out on your other devices.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="currentPassword">{forced ? 'Temporary password' : 'Current password'}</Label>
              <Input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                aria-invalid={!!errors.currentPassword}
                {...register('currentPassword')}
              />
              {errors.currentPassword && <p className="text-xs text-destructive">{errors.currentPassword.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="newPassword">New password</Label>
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                aria-invalid={!!errors.newPassword}
                {...register('newPassword')}
              />
              {errors.newPassword && <p className="text-xs text-destructive">{errors.newPassword.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">Confirm new password</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                aria-invalid={!!errors.confirmPassword}
                {...register('confirmPassword')}
              />
              {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>}
            </div>
            {errors.root && (
              <p role="alert" className="text-sm text-destructive">
                {errors.root.message}
              </p>
            )}
            <div className="flex gap-2">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Change password'}
              </Button>
              {forced && (
                <Button type="button" variant="ghost" onClick={logout}>
                  Sign out
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
