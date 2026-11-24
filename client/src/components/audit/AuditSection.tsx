import { useSearchParams } from 'react-router-dom';
import { useAudit, useAuditFilters } from '@/hooks/queries';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Notice } from '@/components/ui/notice';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingState, ErrorState } from '@/components/states';
import { AuditEntryItem, formatWhen } from '@/components/audit/AuditEntryItem';

const ACTIONS = [
  { value: 'create', label: 'Created' },
  { value: 'update', label: 'Changed' },
  { value: 'delete', label: 'Deleted' },
  { value: 'sign_in', label: 'Signed in' },
  { value: 'sign_in_failed', label: 'Failed sign-in' },
  { value: 'export', label: 'Exported' },
  { value: 'backup', label: 'Backed up' },
];

const PAGE_SIZE = 50;

/**
 * Settings: the audit log. Every change to every record, who made it and when.
 * The filters live in the address, so a view can be bookmarked or shared, and a
 * record's History card can link straight to its full list.
 */
export function AuditSection() {
  const [params, setParams] = useSearchParams();
  const get = (k: string) => params.get(k) ?? '';
  const page = Math.max(1, parseInt(get('page') || '1', 10) || 1);
  const { entities, actors } = useAuditFilters();

  const set = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) (v ? next.set(k, v) : next.delete(k));
    if (!('page' in changes)) next.delete('page');
    setParams(next, { replace: true });
  };

  // A date picked as 2026-11-09 means that whole day, in local time.
  const dayStart = (d: string) => (d ? new Date(`${d}T00:00:00`).toISOString() : undefined);
  const dayEnd = (d: string) => (d ? new Date(`${d}T23:59:59.999`).toISOString() : undefined);

  const { data, isLoading, isError } = useAudit({
    entity: get('entity') || undefined,
    recordId: get('recordId') || undefined,
    actorId: get('actorId') || undefined,
    action: get('action') || undefined,
    from: dayStart(get('from')),
    to: dayEnd(get('to')),
    page,
    limit: PAGE_SIZE,
  });

  const filtered = ['entity', 'recordId', 'actorId', 'action', 'from', 'to'].some((k) => get(k));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit log</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Every change to every record: who made it, when, and what it was before and after. Entries cannot be edited or deleted.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {data?.since && (
          <Notice>Recording began {formatWhen(data.since)}. Changes made before then are not in the log.</Notice>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1.5">
            <Label htmlFor="audit-who">Who</Label>
            <Select
              id="audit-who"
              placeholder="Anyone"
              value={get('actorId')}
              options={[{ value: 'system', label: 'System' }, ...actors.map((a) => ({ value: a.id, label: a.name }))]}
              onValueChange={(v) => set({ actorId: v })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="audit-what">Kind of record</Label>
            <Select id="audit-what" placeholder="Anything" value={get('entity')} options={entities} onValueChange={(v) => set({ entity: v, recordId: '' })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="audit-action">Action</Label>
            <Select id="audit-action" placeholder="Any action" value={get('action')} options={ACTIONS} onValueChange={(v) => set({ action: v })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="audit-from">From</Label>
            <Input id="audit-from" type="date" value={get('from')} onChange={(e) => set({ from: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="audit-to">To</Label>
            <Input id="audit-to" type="date" value={get('to')} onChange={(e) => set({ to: e.target.value })} />
          </div>
        </div>

        {get('recordId') && (
          <Notice className="flex items-center justify-between gap-2">
            <span>Showing one record only.</span>
            <Button size="sm" variant="ghost" onClick={() => set({ recordId: '' })}>Show all records</Button>
          </Notice>
        )}
        {filtered && (
          <Button size="sm" variant="outline" onClick={() => setParams({}, { replace: true })}>Clear filters</Button>
        )}

        {isLoading && <LoadingState />}
        {isError && <ErrorState message="Failed to load the audit log" />}
        {data && data.data.length === 0 && (
          <p className="text-sm text-muted-foreground">{filtered ? 'Nothing matches those filters.' : 'Nothing has been recorded yet.'}</p>
        )}
        {data && data.data.length > 0 && (
          <>
            <ul className="divide-y" aria-label="Audit log entries">
              {data.data.map((e) => (
                <AuditEntryItem key={e.id} entry={e} />
              ))}
            </ul>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {(data.page - 1) * data.limit + 1}-{(data.page - 1) * data.limit + data.data.length} of {data.total}
              </span>
              <span className="flex gap-2">
                <Button size="sm" variant="outline" disabled={data.page <= 1} onClick={() => set({ page: String(data.page - 1) })}>
                  Newer
                </Button>
                <Button size="sm" variant="outline" disabled={data.page >= data.totalPages} onClick={() => set({ page: String(data.page + 1) })}>
                  Older
                </Button>
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
