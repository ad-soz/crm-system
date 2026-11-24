import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api';
import { useCompanies, useInvalidate, useMutation } from '@/hooks/queries';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { LoadingState, ErrorState, EmptyState, PageHeader } from '@/components/states';
import { CompanyForm, type CompanyFormValues } from '@/components/forms/CompanyForm';
import { useToast } from '@/context/ToastContext';
import { usePermissions } from '@/hooks/usePermissions';

export default function Companies() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const { toast } = useToast();
  const { can } = usePermissions();

  const { data, isLoading, isError } = useCompanies({ page, search: search || undefined });

  const createMutation = useMutation({
    mutationFn: (values: CompanyFormValues) => api.post('/companies', cleanup(values)),
    onSuccess: () => {
      invalidate(['companies', 'companies-all', 'dashboard']);
      setDialogOpen(false);
      toast('Company created');
    },
    onError: (err) => toast(getApiErrorMessage(err), 'error'),
  });

  return (
    <div>
      <PageHeader
        title="Companies"
        action={
          can('companies.create') && (
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4" /> New Company
            </Button>
          )
        }
      />

      <div className="mb-4 max-w-sm">
        <Input
          placeholder="Search by name..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>

      {isLoading && <LoadingState />}
      {isError && <ErrorState message="Failed to load companies" />}
      {data && data.data.length === 0 && (
        <EmptyState
          title="No companies yet"
          description="Create your first company to get started."
          action={can('companies.create') && <Button onClick={() => setDialogOpen(true)}>New Company</Button>}
        />
      )}

      {data && data.data.length > 0 && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Industries</TableHead>
                <TableHead>Website</TableHead>
                <TableHead>People</TableHead>
                <TableHead>Deals</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((c) => (
                <TableRow
                  key={c.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/companies/${c.id}`)}
                >
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>
                    {c.industries && c.industries.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {c.industries.map((ind) => (
                          <Badge key={ind.id} variant={ind.colour ?? 'secondary'}>{ind.name}</Badge>
                        ))}
                      </div>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell>{c.website ?? '-'}</TableCell>
                  <TableCell>{c._count?.people ?? 0}</TableCell>
                  <TableCell>{c._count?.deals ?? 0}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination page={page} totalPages={data.totalPages} onChange={setPage} />
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogHeader>
          <DialogTitle>New Company</DialogTitle>
        </DialogHeader>
        <CompanyForm
          onSubmit={(v) => createMutation.mutate(v)}
          onCancel={() => setDialogOpen(false)}
          submitting={createMutation.isPending}
        />
      </Dialog>
    </div>
  );
}

export function cleanup<T extends Record<string, any>>(values: T): T {
  const out: any = {};
  for (const [k, v] of Object.entries(values)) {
    out[k] = v === '' ? undefined : v;
  }
  return out;
}

export function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-end gap-2">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Previous
      </Button>
      <span className="text-sm text-muted-foreground">
        Page {page} of {totalPages}
      </span>
      <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        Next
      </Button>
    </div>
  );
}
