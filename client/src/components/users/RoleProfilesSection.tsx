import { useState } from 'react';
import { Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api';
import { useInvalidate, useMutation, usePermissionCatalog, useRoleProfiles } from '@/hooks/queries';
import { useAuth } from '@/context/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/context/ToastContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LoadingState, ErrorState } from '@/components/states';
import { PermissionMatrix } from './PermissionMatrix';
import type { PermissionCatalog, RoleProfile } from '@/types';

type Editing = { mode: 'create' } | { mode: 'edit'; profile: RoleProfile } | { mode: 'delete'; profile: RoleProfile } | null;

/** One-line summary of what a profile can do. */
export function summarize(profile: RoleProfile, catalog?: PermissionCatalog): string {
  if (!catalog) return `${profile.permissions.length} permissions`;
  const set = new Set(profile.permissions);
  const areas = catalog.areas
    .filter((a) => set.has(`${a.key}.view`))
    .map((a) => {
      const full = a.permissions.every((p) => set.has(p.key));
      return full ? a.label : `${a.label} (${a.permissions.filter((p) => set.has(p.key)).map((p) => p.action).join(', ')})`;
    });
  const admin = catalog.admin.filter((p) => set.has(p.key)).map((p) => p.label);
  const parts = [...areas, ...admin];
  return parts.length ? parts.join(' · ') : 'No access';
}

export function RoleProfilesSection() {
  const { user } = useAuth();
  const { permissions } = usePermissions();
  const { toast } = useToast();
  const invalidate = useInvalidate();
  const { data: profiles, isLoading, isError } = useRoleProfiles();
  const { data: catalog } = usePermissionCatalog();
  const [editing, setEditing] = useState<Editing>(null);

  const deleteMutation = useMutation({
    mutationFn: (p: RoleProfile) => api.delete(`/role-profiles/${p.id}`),
    onSuccess: () => {
      invalidate(['role-profiles']);
      setEditing(null);
      toast('Profile deleted');
    },
    onError: (err) => toast(getApiErrorMessage(err), 'error'),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Role profiles</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            A profile is a set of permissions. Each person has one profile.
          </p>
        </div>
        <Button size="sm" onClick={() => setEditing({ mode: 'create' })} disabled={!catalog}>
          <Plus className="h-4 w-4" aria-hidden /> New profile
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading && <LoadingState />}
        {isError && <ErrorState message="Failed to load role profiles" />}
        {profiles && (
          <Card flat className="overflow-hidden">
          <ul className="divide-y">
            {profiles.map((p) => {
              const own = user?.roleProfile?.id === p.id;
              return (
                <li key={p.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {p.name}
                      {p.isSystem && (
                        <Badge variant="secondary" className="gap-1">
                          <Lock className="h-3 w-3" aria-hidden /> Built in
                        </Badge>
                      )}
                      {own && <Badge variant="info">Your profile</Badge>}
                      <span className="text-xs font-normal text-muted-foreground">
                        {p.userCount} {p.userCount === 1 ? 'person' : 'people'}
                      </span>
                    </p>
                    {p.description && <p className="text-sm text-muted-foreground">{p.description}</p>}
                    <p className="mt-1 text-xs text-muted-foreground">{summarize(p, catalog)}</p>
                  </div>
                  {!p.isSystem && (
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditing({ mode: 'edit', profile: p })}
                        disabled={own || !catalog}
                        title={own ? "You can't edit the profile you're using" : undefined}
                        aria-label={`Edit ${p.name}`}
                      >
                        <Pencil className="h-4 w-4" aria-hidden />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => setEditing({ mode: 'delete', profile: p })}
                        disabled={p.userCount > 0}
                        title={p.userCount > 0 ? 'Move its people to another profile first' : undefined}
                        aria-label={`Delete ${p.name}`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          </Card>
        )}
      </CardContent>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        {(editing?.mode === 'create' || editing?.mode === 'edit') && catalog && (
          <ProfileEditor
            key={editing.mode === 'edit' ? editing.profile.id : 'new'}
            catalog={catalog}
            profile={editing.mode === 'edit' ? editing.profile : undefined}
            grantable={permissions}
            onDone={() => setEditing(null)}
          />
        )}
        {editing?.mode === 'delete' && (
          <>
            <DialogHeader>
              <DialogTitle>Delete "{editing.profile.name}"?</DialogTitle>
              <DialogDescription>Nobody uses this profile, so nothing else changes.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(editing.profile)}
              >
                Delete profile
              </Button>
            </DialogFooter>
          </>
        )}
      </Dialog>
    </Card>
  );
}

export function ProfileEditor({
  catalog,
  profile,
  grantable,
  onDone,
}: {
  catalog: PermissionCatalog;
  profile?: RoleProfile;
  grantable: string[];
  onDone: () => void;
}) {
  const { toast } = useToast();
  const invalidate = useInvalidate();
  const [name, setName] = useState(profile?.name ?? '');
  const [description, setDescription] = useState(profile?.description ?? '');
  const [permissions, setPermissions] = useState<string[]>(profile?.permissions ?? []);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), description: description.trim(), permissions };
      return profile ? api.patch(`/role-profiles/${profile.id}`, body) : api.post('/role-profiles', body);
    },
    onSuccess: () => {
      invalidate(['role-profiles', 'users']);
      toast(profile ? 'Profile updated. Changes apply straight away.' : 'Profile created');
      onDone();
    },
    onError: (err) => setError(getApiErrorMessage(err)),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) {
          setError('Give the profile a name');
          return;
        }
        setError(null);
        save.mutate();
      }}
      noValidate
    >
      <DialogHeader>
        <DialogTitle>{profile ? `Edit ${profile.name}` : 'New role profile'}</DialogTitle>
        {profile && profile.userCount > 0 && (
          <DialogDescription>
            Changes apply immediately to the {profile.userCount} {profile.userCount === 1 ? 'person' : 'people'} using it.
          </DialogDescription>
        )}
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="profile-name">Name</Label>
          <Input id="profile-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="profile-description">Description (optional)</Label>
          <Textarea
            id="profile-description"
            value={description}
            maxLength={200}
            rows={2}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <PermissionMatrix catalog={catalog} value={permissions} onChange={setPermissions} grantable={grantable} />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Saving...' : profile ? 'Save changes' : 'Create profile'}
        </Button>
      </DialogFooter>
    </form>
  );
}
