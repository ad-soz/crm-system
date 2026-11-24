import { useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';

/**
 * Check the signed-in user's permissions, e.g. can('deals.edit').
 * This only decides what the app shows; the server enforces the same rules
 * on every request.
 */
export function usePermissions() {
  const { user } = useAuth();
  const permissions = user?.permissions ?? [];

  const can = useCallback((permission: string) => permissions.includes(permission), [permissions]);
  const canAny = useCallback((...list: string[]) => list.some((p) => permissions.includes(p)), [permissions]);

  return { can, canAny, permissions };
}
