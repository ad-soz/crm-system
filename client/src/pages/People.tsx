import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Download, Upload } from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api';
import { usePeople, useAllCompanies, useInvalidate, useMutation } from '@/hooks/queries';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LoadingState, ErrorState, EmptyState, PageHeader } from '@/components/states';
import { PersonForm, type PersonFormValues } from '@/components/forms/PersonForm';
import { ImportDialog } from '@/components/ImportDialog';
import { cleanup, Pagination } from '@/pages/Companies';
import { useToast } from '@/context/ToastContext';
import { usePermissions } from '@/hooks/usePermissions';
import { TOKEN_KEY } from '@/lib/api';

export default function People() {
  const [search, setSearch] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const { toast } = useToast();
  const { can } = usePermissions();

  const { data, isLoading, isError } = usePeople({
    page,
    search: search || undefined,
    companyId: companyId || undefined,
  });
  const { data: companies } = useAllCompanies();

  const createMutation = useMutation({
    mutationFn: (values: PersonFormValues) => api.post('/people', cleanup(values)),
    onSuccess: () => {
      invalidate(['people', 'people-all', 'dashboard']);
      setDialogOpen(false);
      toast('Person created');
    },
    onError: (err) => toast(getApiErrorMessage(err), 'error'),
  });

  const handleExport = async () => {
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      const res = await fetch('/api/export/people', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'people.csv';
      a.click();
      window.URL.revokeObjectURL(url);
      toast('People exported');
    } catch {
      toast('Export failed', 'error');
    }
  };

  return (
    <div>
      <PageHeader
        title="People"
        action={
          <div className="flex gap-2">
            {can('data.export') && (
              <Button variant="outline" onClick={handleExport}>
                <Download className="h-4 w-4" /> Export
              </Button>
            )}
            {can('data.import') && can('people.create') && (
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4" /> Import
              </Button>
            )}
            {can('people.create') && (
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4" /> New Person
              </Button>
            )}
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <Input
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="max-w-xs"
        />
        <Select
          placeholder="All companies"
          value={companyId}
          options={(companies ?? []).map((c) => ({ value: c.id, label: c.name }))}
          onValueChange={(v) => {
            setCompanyId(v);
            setPage(1);
          }}
          className="max-w-xs"
        />
      </div>

      {isLoading && <LoadingState />}
      {isError && <ErrorState message="Failed to load people" />}
      {data && data.data.length === 0 && (
        <EmptyState
          title="No people yet"
          description="Add a person or import from CSV."
          action={can('people.create') && <Button onClick={() => setDialogOpen(true)}>New Person</Button>}
        />
      )}

      {data && data.data.length > 0 && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Owner</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((c) => (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => navigate(`/people/${c.id}`)}>
                  <TableCell className="font-medium">{c.firstName} {c.lastName}</TableCell>
                  <TableCell>{c.email ?? '-'}</TableCell>
                  <TableCell>{c.phone ?? '-'}</TableCell>
                  <TableCell>{c.company?.name ?? '-'}</TableCell>
                  <TableCell>{c.owner ? `${c.owner.firstName} ${c.owner.lastName}` : '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination page={page} totalPages={data.totalPages} onChange={setPage} />
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogHeader>
          <DialogTitle>New Person</DialogTitle>
        </DialogHeader>
        <PersonForm
          onSubmit={(v) => createMutation.mutate(v)}
          onCancel={() => setDialogOpen(false)}
          submitting={createMutation.isPending}
        />
      </Dialog>

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={() => invalidate(['people', 'people-all', 'dashboard'])}
      />
    </div>
  );
}
