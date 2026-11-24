import { DatabaseBackup } from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api';
import { useBackups, useInvalidate, useMutation } from '@/hooks/queries';
import { useToast } from '@/context/ToastContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Notice } from '@/components/ui/notice';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LoadingState, ErrorState } from '@/components/states';
import type { BackupKind } from '@/types';

const KIND_LABEL: Record<BackupKind, string> = {
  auto: 'Automatic',
  manual: 'Manual',
  'pre-update': 'Before an update',
};

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Settings card: see the database backups and make one on demand. */
export function BackupsSection() {
  const { toast } = useToast();
  const invalidate = useInvalidate();
  const { data, isLoading, isError } = useBackups();

  const backupNow = useMutation({
    mutationFn: () => api.post('/backups'),
    onSuccess: () => {
      invalidate(['backups']);
      toast('Backup created');
    },
    onError: (err) => {
      invalidate(['backups']);
      toast(getApiErrorMessage(err), 'error');
    },
  });

  const status = data?.status;
  const newestGood = data?.backups.find((b) => b.kind !== 'pre-update');

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Backups</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            A copy of all your data is saved automatically every day, and checked after it is made.
          </p>
        </div>
        <Button size="sm" onClick={() => backupNow.mutate()} disabled={backupNow.isPending || !data}>
          <DatabaseBackup className="h-4 w-4" aria-hidden /> {backupNow.isPending ? 'Backing up...' : 'Back up now'}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && <LoadingState />}
        {isError && <ErrorState message="Failed to load backups" />}

        {status?.lastError && (
          <Notice tone="error" role="alert">
            <p className="font-medium">The last backup did not work</p>
            <p className="text-xs">
              {status.lastError.message} ({formatWhen(status.lastError.at)}). Your data is safe and the app is still running.
              It will try again within the hour.
            </p>
          </Notice>
        )}

        {data && (
          <>
            {data.backups.length === 0 ? (
              <Notice tone="warning">
                No backups yet. The first one is made shortly after the app starts, or press "Back up now".
              </Notice>
            ) : (
              <p className="text-sm text-muted-foreground">
                Newest backup: <span className="font-medium text-foreground">{newestGood ? formatWhen(newestGood.createdAt) : 'none'}</span>
              </p>
            )}

            {data.backups.length > 0 && (
              <Table flat>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Size</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.backups.map((b) => (
                    <TableRow key={b.name}>
                      <TableCell>{formatWhen(b.createdAt)}</TableCell>
                      <TableCell>
                        <Badge variant={b.kind === 'pre-update' ? 'warning' : b.kind === 'manual' ? 'info' : 'secondary'}>
                          {KIND_LABEL[b.kind]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{formatSize(b.size)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            <p className="text-xs text-muted-foreground">
              Saved in <span className="font-mono">{status?.directory}</span>, outside the synced project folder because
              they contain customer data. The newest {status?.keep.auto} automatic and {status?.keep.manual} manual backups are kept.
              To restore one, run <span className="font-mono">.\scripts\restore-backup.ps1 -List</span> on the computer that runs
              the CRM. It saves your current data first, so a restore can be undone.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
