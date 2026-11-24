import { Lock } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { usePermissions } from '@/hooks/usePermissions';

/** Shows the page only if the user has the permission; otherwise explains why not. */
export function RequirePermission({
  permission,
  children,
}: {
  permission: string | string[];
  children: React.ReactNode;
}) {
  const { canAny } = usePermissions();
  const list = Array.isArray(permission) ? permission : [permission];
  if (canAny(...list)) return <>{children}</>;

  return (
    <Card role="alert" className="mx-auto mt-16 max-w-md p-6 text-center">
      <Lock className="mx-auto mb-3 h-6 w-6 text-muted-foreground" aria-hidden />
      <p className="font-medium">You don't have access to this page</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Your role profile doesn't include it. Ask an administrator if you need it.
      </p>
    </Card>
  );
}
