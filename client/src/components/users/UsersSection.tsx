import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api';
import { useUsers, useInvalidate, useMutation, useRoleProfiles } from '@/hooks/queries';
import { useAuth } from '@/context/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/context/ToastContext';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LoadingState, ErrorState } from '@/components/states';
import { InviteUserForm, type InviteValues } from './InviteUserForm';
import { TemporaryPasswordNotice } from './TemporaryPasswordNotice';
import type { RoleProfile, User } from '@/types';

type DialogState =
  | { type: 'invite' }
  | { type: 'confirmReset'; target: User }
  | { type: 'showPassword'; title: string; email: string; password: string }
  | null;

/** Profiles whose permissions are all within the given set (what you may hand out). */
function within(profiles: RoleProfile[] | undefined, held: string[]) {
  return (profiles ?? []).filter((p) => p.permissions.every((perm) => held.includes(perm)));
}

/** Settings > Users: invite people, assign role profiles, reset passwords. */
export function UsersSection() {
  const { user: currentUser } = useAuth();
  const { permissions: held } = usePermissions();
  const invalidate = useInvalidate();
  const { toast } = useToast();
  const { data, isLoading, isError } = useUsers();
  const { data: profiles } = useRoleProfiles();
  const [dialog, setDialog] = useState<DialogState>(null);

  const grantable = within(profiles, held);
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  // You can manage someone only if their access doesn't go beyond yours.
  const canManage = (u: User) => {
    const p = u.roleProfile && profileById.get(u.roleProfile.id);
    return !p || p.permissions.every((perm) => held.includes(perm));
  };

  const profileMutation = useMutation({
    mutationFn: ({ id, roleProfileId }: { id: string; roleProfileId: string }) =>
      api.patch(`/users/${id}/profile`, { roleProfileId }),
    onSuccess: () => {
      invalidate(['users', 'role-profiles']);
      toast('Role profile changed. It applies straight away.');
    },
    onError: (err) => toast(getApiErrorMessage(err), 'error'),
  });

  const inviteMutation = useMutation({
    mutationFn: (values: InviteValues) => api.post<{ user: User; temporaryPassword: string }>('/users', values),
    onSuccess: (res) => {
      invalidate(['users', 'role-profiles']);
      setDialog({
        type: 'showPassword',
        title: 'User invited',
        email: res.data.user.email,
        password: res.data.temporaryPassword,
      });
    },
  });

  const resetMutation = useMutation({
    mutationFn: (target: User) =>
      api.post<{ temporaryPassword: string }>(`/users/${target.id}/reset-password`).then((res) => ({
        target,
        temporaryPassword: res.data.temporaryPassword,
      })),
    onSuccess: ({ target, temporaryPassword }) => {
      invalidate(['users']);
      setDialog({ type: 'showPassword', title: 'Password reset', email: target.email, password: temporaryPassword });
    },
    onError: (err) => toast(getApiErrorMessage(err), 'error'),
  });

  const closeDialog = () => {
    setDialog(null);
    inviteMutation.reset();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Users</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Invite people and choose what each person can do. Changes apply straight away.
          </p>
        </div>
        <Button size="sm" onClick={() => setDialog({ type: 'invite' })} disabled={!profiles}>
          <UserPlus className="h-4 w-4" aria-hidden /> Invite user
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading && <LoadingState />}
        {isError && <ErrorState message="Failed to load users" />}
        {data && (
          <Table flat>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role profile</TableHead>
                <TableHead>
                  <span className="sr-only">Password</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((u) => {
                const self = u.id === currentUser?.id;
                const manageable = canManage(u);
                // Show the current profile even if it's not one you could hand out.
                const options = [
                  ...grantable,
                  ...(u.roleProfile && !grantable.some((g) => g.id === u.roleProfile!.id)
                    ? [profileById.get(u.roleProfile.id)!].filter(Boolean)
                    : []),
                ];
                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {u.firstName} {u.lastName}
                        {self && <Badge variant="info">You</Badge>}
                        {u.mustChangePassword && <Badge variant="warning">Awaiting first sign-in</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>
                      <Select
                        aria-label={`Role profile for ${u.firstName} ${u.lastName}`}
                        value={u.roleProfile?.id ?? ''}
                        options={options.map((p) => ({ value: p.id, label: p.name }))}
                        onValueChange={(v) => v && profileMutation.mutate({ id: u.id, roleProfileId: v })}
                        disabled={self || !manageable || profileMutation.isPending}
                        title={
                          self
                            ? "You can't change your own profile"
                            : !manageable
                              ? 'This person has access you don’t have'
                              : undefined
                        }
                        className="h-8 w-48"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      {!self && manageable && (
                        <Button size="sm" variant="ghost" onClick={() => setDialog({ type: 'confirmReset', target: u })}>
                          Reset password
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && closeDialog()}>
        {dialog?.type === 'invite' && (
          <>
            <DialogHeader>
              <DialogTitle>Invite user</DialogTitle>
              <DialogDescription>
                They'll get a temporary password and choose their own when they first sign in.
              </DialogDescription>
            </DialogHeader>
            <InviteUserForm
              profiles={grantable}
              onSubmit={(v) => inviteMutation.mutate(v)}
              onCancel={closeDialog}
              submitting={inviteMutation.isPending}
              error={inviteMutation.isError ? getApiErrorMessage(inviteMutation.error) : null}
            />
          </>
        )}
        {dialog?.type === 'confirmReset' && (
          <>
            <DialogHeader>
              <DialogTitle>Reset password?</DialogTitle>
              <DialogDescription>
                {dialog.target.firstName} {dialog.target.lastName} will be signed out everywhere and will need the
                new temporary password to sign in.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={resetMutation.isPending}
                onClick={() => resetMutation.mutate(dialog.target)}
              >
                {resetMutation.isPending ? 'Resetting...' : 'Reset password'}
              </Button>
            </DialogFooter>
          </>
        )}
        {dialog?.type === 'showPassword' && (
          <>
            <DialogHeader>
              <DialogTitle>{dialog.title}</DialogTitle>
            </DialogHeader>
            <TemporaryPasswordNotice email={dialog.email} password={dialog.password} />
            <DialogFooter>
              <Button onClick={closeDialog}>Done</Button>
            </DialogFooter>
          </>
        )}
      </Dialog>
    </Card>
  );
}
