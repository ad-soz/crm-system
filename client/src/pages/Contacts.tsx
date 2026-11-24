import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api';
import { useContacts, useInvalidate, useMutation, useActiveReferenceValues } from '@/hooks/queries';
import { Button } from '@/components/ui/button';
import { Dialog, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { LoadingState, ErrorState, EmptyState, PageHeader } from '@/components/states';
import { ContactForm, type ContactFormValues } from '@/components/forms/ContactForm';
import { FollowUpButton } from '@/components/tasks/FollowUpButton';
import { ContactIcon } from '@/lib/display';
import { formatDate } from '@/lib/utils';
import { cleanup } from '@/pages/Companies';
import { useToast } from '@/context/ToastContext';
import { usePermissions } from '@/hooks/usePermissions';

export default function Contacts() {
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [dialogOpen, setDialogOpen] = useState(false);
  const invalidate = useInvalidate();
  const { toast } = useToast();
  const { can } = usePermissions();

  const { values: types } = useActiveReferenceValues('contact-types');

  const { data, isLoading, isError } = useContacts(
    typeFilter === 'ALL' ? {} : { typeId: typeFilter },
  );

  const createMutation = useMutation({
    mutationFn: (values: ContactFormValues) => api.post('/contacts', cleanup(values)),
    onSuccess: () => {
      invalidate(['contacts', 'dashboard']);
      setDialogOpen(false);
      toast('Contact logged');
    },
    onError: (err) => toast(getApiErrorMessage(err), 'error'),
  });

  return (
    <div>
      <PageHeader
        title="Contacts"
        action={
          can('contacts.create') && (
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4" /> Log Contact
            </Button>
          )
        }
      />

      <Tabs value={typeFilter} onValueChange={setTypeFilter} className="mb-4">
        <TabsList>
          <TabsTrigger value="ALL">All</TabsTrigger>
          {types.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>{t.name}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {isLoading && <LoadingState />}
      {isError && <ErrorState message="Failed to load contacts" />}
      {data && data.data.length === 0 && (
        <EmptyState title="No contacts" description="Log a call, email, meeting, or note." />
      )}

      {data && data.data.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <ul className="space-y-4">
              {data.data.map((a) => (
                <li key={a.id} className="flex items-start gap-3 border-b pb-4 last:border-0 last:pb-0">
                  <div className="mt-0.5"><ContactIcon type={a.type} /></div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{a.subject}</p>
                    {a.description && <p className="text-sm text-muted-foreground">{a.description}</p>}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {a.person && <Link to={`/people/${a.person.id}`} className="hover:underline">{a.person.firstName} {a.person.lastName}</Link>}
                      {a.deal && <Link to={`/deals/${a.deal.id}`} className="hover:underline">{a.person ? ' · ' : ''}{a.deal.title}</Link>}
                      {a.user && ` · ${a.user.firstName} ${a.user.lastName}`}
                      {` · ${formatDate(a.createdAt)}`}
                    </p>
                  </div>
                  <FollowUpButton contact={a} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogHeader><DialogTitle>Log Contact</DialogTitle></DialogHeader>
        <ContactForm showAssociations onSubmit={(v) => createMutation.mutate(v)} onCancel={() => setDialogOpen(false)} submitting={createMutation.isPending} />
      </Dialog>
    </div>
  );
}
