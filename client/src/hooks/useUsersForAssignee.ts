import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import type { Paginated, User } from '@/types';

/**
 * Returns the users that can be chosen as a task assignee. Listing people
 * needs "users.manage"; anyone else can assign tasks to themselves.
 */
export function useUsersForAssignee() {
  const { user } = useAuth();
  const { can } = usePermissions();
  const canList = can('users.manage');

  const { data } = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get<Paginated<User>>('/users')).data,
    enabled: canList,
  });

  const assignees: User[] = canList && data ? data.data : user ? [user] : [];

  return { assignees, canList };
}
