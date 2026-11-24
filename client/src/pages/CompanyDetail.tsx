import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api';
import { useCompany, useInvalidate, useMutation } from '@/hooks/queries';
import { Button } from '@/components/ui/button';
import { RecordHistory } from '@/components/audit/RecordHistory';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LoadingState, ErrorState } from '@/components/states';
import { CompanyForm, type CompanyFormValues } from '@/components/forms/CompanyForm';
import { Badge } from '@/components/ui/badge';
import { StageBadge } from '@/lib/display';
import { formatCurrency } from '@/lib/utils';
import { cleanup } from '@/pages/Companies';
import { useToast } from '@/context/ToastContext';
import { usePermissions } from '@/hooks/usePermissions';

export default function CompanyDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const { toast } = useToast();
  const { can } = usePermissions();
  const [tab, setTab] = useState('people');
  const [editOpen, setEditOpen] = useState(false);

  const { data: company, isLoading, isError } = useCompany(id);

  const updateMutation = useMutation({
    mutationFn: (values: CompanyFormValues) => api.patch(`/companies/${id}`, cleanup(values)),
    onSuccess: () => {
      invalidate(['company', 'companies']);
      setEditOpen(false);
      toast('Company updated');
    },
    onError: (err) => toast(getApiErrorMessage(err), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/companies/${id}`),
    onSuccess: () => {
      invalidate(['companies', 'dashboard']);
      toast('Company deleted');
      navigate('/companies');
    },
    onError: (err) => toast(getApiErrorMessage(err), 'error'),
  });

  if (isLoading) return <LoadingState />;
  if (isError || !company) return <ErrorState message="Company not found" />;

  return (
    <div>
      <Button variant="ghost" size="sm" onClick={() => navigate('/companies')} className="mb-4">
        <ArrowLeft className="h-4 w-4" /> Back
      </Button>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{company.name}</h1>
          {company.industries && company.industries.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {company.industries.map((ind) => (
                <Badge key={ind.id} variant={ind.colour ?? 'secondary'}>{ind.name}</Badge>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          {can('companies.edit') && (
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          )}
          {can('companies.delete') && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (confirm('Delete this company?')) deleteMutation.mutate();
              }}
            >
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          )}
        </div>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <div><span className="text-muted-foreground">Website: </span>{company.website ?? '-'}</div>
          <div><span className="text-muted-foreground">Phone: </span>{company.phone ?? '-'}</div>
          <div><span className="text-muted-foreground">Email: </span>{company.email ?? '-'}</div>
          <div><span className="text-muted-foreground">Address: </span>{company.address ?? '-'}</div>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        {(can('people.view') || can('deals.view')) && (
          <TabsList>
            {can('people.view') && (
              <TabsTrigger value="people">People ({company.people?.length ?? 0})</TabsTrigger>
            )}
            {can('deals.view') && <TabsTrigger value="deals">Deals ({company.deals?.length ?? 0})</TabsTrigger>}
          </TabsList>
        )}
        <TabsContent value="people">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Title</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(company.people ?? []).map((c) => (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => navigate(`/people/${c.id}`)}>
                  <TableCell className="font-medium">{c.firstName} {c.lastName}</TableCell>
                  <TableCell>{c.email ?? '-'}</TableCell>
                  <TableCell>{c.title ?? '-'}</TableCell>
                </TableRow>
              ))}
              {(company.people ?? []).length === 0 && (
                <TableRow><TableCell colSpan={3} className="text-muted-foreground">No people</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>
        <TabsContent value="deals">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(company.deals ?? []).map((d) => (
                <TableRow key={d.id} className="cursor-pointer" onClick={() => navigate(`/deals/${d.id}`)}>
                  <TableCell className="font-medium">{d.title}</TableCell>
                  <TableCell><StageBadge stage={d.stage} /></TableCell>
                  <TableCell>{formatCurrency(d.amount)}</TableCell>
                </TableRow>
              ))}
              {(company.deals ?? []).length === 0 && (
                <TableRow><TableCell colSpan={3} className="text-muted-foreground">No deals</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>

      <RecordHistory entity="companies" recordId={company.id} />

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogHeader>
          <DialogTitle>Edit Company</DialogTitle>
        </DialogHeader>
        <CompanyForm
          initial={company}
          onSubmit={(v) => updateMutation.mutate(v)}
          onCancel={() => setEditOpen(false)}
          submitting={updateMutation.isPending}
        />
      </Dialog>
    </div>
  );
}
