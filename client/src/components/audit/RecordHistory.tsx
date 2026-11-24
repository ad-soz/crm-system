import { Link } from 'react-router-dom';
import { useAudit } from '@/hooks/queries';
import { usePermissions } from '@/hooks/usePermissions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AuditEntryItem } from '@/components/audit/AuditEntryItem';

/**
 * "History" on a person, company or deal page: every change to this record, newest
 * first. Shown only to people who may see the audit log.
 */
export function RecordHistory({ entity, recordId }: { entity: string; recordId: string }) {
  const { can } = usePermissions();
  const allowed = can('audit.view');
  const { data, isLoading, isError } = useAudit({ entity, recordId, limit: 20 }, { enabled: allowed });
  if (!allowed) return null;

  return (
    <Card className="mt-6">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>History</CardTitle>
        {data && data.total > data.data.length && (
          <Link to={`/settings/audit?entity=${entity}&recordId=${recordId}`} className="text-sm text-primary hover:underline">
            See all {data.total}
          </Link>
        )}
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">Loading history...</p>}
        {isError && <p className="text-sm text-destructive">The history could not be loaded.</p>}
        {data && data.data.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No changes recorded yet.{data.since ? ' Changes made before the audit log began are not included.' : ''}
          </p>
        )}
        {data && data.data.length > 0 && (
          <ul className="divide-y" aria-label="History of this record">
            {data.data.map((e) => (
              <AuditEntryItem key={e.id} entry={e} showRecord={false} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
