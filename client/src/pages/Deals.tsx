import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, LayoutGrid, List, Copy } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api, getApiErrorMessage } from '@/lib/api';
import { useInvalidate, useMutation, useActiveReferenceValues } from '@/hooks/queries';
import type { Deal, Paginated } from '@/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LoadingState, ErrorState, PageHeader } from '@/components/states';
import { DealForm, type DealFormValues } from '@/components/forms/DealForm';
import { StageChangeDialog } from '@/components/deals/StageChangeDialog';
import { DuplicateDealDialog } from '@/components/deals/DuplicateDealDialog';
import { StageBadge } from '@/lib/display';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { cleanup } from '@/pages/Companies';
import { useToast } from '@/context/ToastContext';
import { usePermissions } from '@/hooks/usePermissions';

/** The small copy button on a deal in the board or the table. It must not open the deal or start a drag. */
function DuplicateIcon({ deal, onDuplicate }: { deal: Deal; onDuplicate: (deal: Deal) => void }) {
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="-mr-1 -mt-1 h-6 w-6 shrink-0"
      aria-label={`Duplicate deal: ${deal.title}`}
      title="Duplicate"
      draggable={false}
      onClick={(e) => {
        e.stopPropagation();
        onDuplicate(deal);
      }}
    >
      <Copy className="h-3.5 w-3.5" aria-hidden />
    </Button>
  );
}

export default function Deals() {
  const [view, setView] = useState<'board' | 'table'>('board');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dragStage, setDragStage] = useState<string | null>(null);
  const [duplicating, setDuplicating] = useState<Deal | null>(null);
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const { toast } = useToast();
  const { can } = usePermissions();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['deals', {}],
    queryFn: async () => (await api.get<Paginated<Deal>>('/deals', { params: { limit: 500 } })).data,
  });
  const { values: stages, isLoading: stagesLoading } = useActiveReferenceValues('deal-stages');

  const createMutation = useMutation({
    mutationFn: (values: DealFormValues) => api.post('/deals', cleanup(values)),
    onSuccess: () => {
      invalidate(['deals', 'pipeline', 'dashboard']);
      setDialogOpen(false);
      toast('Deal created');
    },
    onError: (err) => toast(getApiErrorMessage(err), 'error'),
  });

  // A drop only proposes a move; it happens when a comment is given.
  const [pending, setPending] = useState<{ deal: Deal; toStageId: string } | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);

  const stageMutation = useMutation({
    mutationFn: ({ id, stageId, stageComment }: { id: string; stageId: string; stageComment: string }) =>
      api.patch(`/deals/${id}`, { stageId, stageComment }),
    onSuccess: () => {
      invalidate(['deals', 'pipeline', 'dashboard', 'deal', 'deal-history']);
      setPending(null);
      setMoveError(null);
      toast('Deal moved');
    },
    // Keep the dialog open so what was typed isn't lost.
    onError: (err) => setMoveError(getApiErrorMessage(err)),
  });

  if (isLoading || stagesLoading) return <LoadingState />;
  if (isError || !data) return <ErrorState message="Failed to load deals" />;

  const deals = data.data;
  const byStage = (stageId: string) => deals.filter((d) => d.stageId === stageId);
  const stageTotal = (stageId: string) => byStage(stageId).reduce((sum, d) => sum + d.amount, 0);

  const handleDrop = (stageId: string, dealId: string) => {
    const deal = deals.find((d) => d.id === dealId);
    if (deal && deal.stageId !== stageId && can('deals.edit')) {
      setMoveError(null);
      setPending({ deal, toStageId: stageId });
    }
    setDragStage(null);
  };

  return (
    <div>
      <PageHeader
        title="Deals"
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="icon" onClick={() => setView(view === 'board' ? 'table' : 'board')} aria-label="Toggle view">
              {view === 'board' ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
            </Button>
            {can('deals.create') && (
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4" /> New Deal
              </Button>
            )}
          </div>
        }
      />

      {view === 'board' ? (
        <div className="-m-4 flex gap-4 overflow-x-auto p-4">
          {stages.map((stage) => (
            <Card
              key={stage.id}
              className={cn('flex w-72 flex-shrink-0 flex-col bg-muted/20', dragStage === stage.id && 'ring-2 ring-primary')}
              onDragOver={(e) => {
                e.preventDefault();
                setDragStage(stage.id);
              }}
              onDragLeave={() => setDragStage((s) => (s === stage.id ? null : s))}
              onDrop={(e) => handleDrop(stage.id, e.dataTransfer.getData('text/plain'))}
            >
              <div className="flex items-center justify-between border-b px-3 py-2">
                <span className="text-sm font-medium">{stage.name}</span>
                <span className="text-xs text-muted-foreground">{byStage(stage.id).length}</span>
              </div>
              <div className="flex-1 space-y-2 p-2 min-h-[120px]">
                {byStage(stage.id).map((d) => (
                  <Card
                    flat
                    key={d.id}
                    draggable={can('deals.edit')}
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', d.id)}
                    onClick={() => navigate(`/deals/${d.id}`)}
                    className="cursor-pointer bg-background p-3 shadow-sm hover:shadow"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium">{d.title}</p>
                      {can('deals.create') && <DuplicateIcon deal={d} onDuplicate={setDuplicating} />}
                    </div>
                    <p className="text-sm text-muted-foreground">{formatCurrency(d.amount)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {d.company?.name}
                      {d.person && ` · ${d.person.firstName} ${d.person.lastName}`}
                    </p>
                  </Card>
                ))}
              </div>
              <div className="border-t px-3 py-2 text-xs font-medium text-muted-foreground">
                Total: {formatCurrency(stageTotal(stage.id))}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Close date</TableHead>
              <TableHead><span className="sr-only">Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deals.map((d) => (
              <TableRow key={d.id} className="cursor-pointer" onClick={() => navigate(`/deals/${d.id}`)}>
                <TableCell className="font-medium">{d.title}</TableCell>
                <TableCell><StageBadge stage={d.stage} /></TableCell>
                <TableCell>{formatCurrency(d.amount)}</TableCell>
                <TableCell>{d.company?.name ?? '-'}</TableCell>
                <TableCell>{d.owner ? `${d.owner.firstName} ${d.owner.lastName}` : '-'}</TableCell>
                <TableCell>{formatDate(d.expectedCloseDate)}</TableCell>
                <TableCell className="text-right">{can('deals.create') && <DuplicateIcon deal={d} onDuplicate={setDuplicating} />}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <StageChangeDialog
        open={pending !== null}
        dealTitle={pending?.deal.title ?? ''}
        from={pending?.deal.stage}
        to={stages.find((s) => s.id === pending?.toStageId)}
        submitting={stageMutation.isPending}
        error={moveError}
        onConfirm={(stageComment) =>
          pending && stageMutation.mutate({ id: pending.deal.id, stageId: pending.toStageId, stageComment })
        }
        onCancel={() => {
          setPending(null);
          setMoveError(null);
        }}
      />

      <DuplicateDealDialog deal={duplicating} onClose={() => setDuplicating(null)} />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogHeader><DialogTitle>New Deal</DialogTitle></DialogHeader>
        <DealForm onSubmit={(v) => createMutation.mutate(v)} onCancel={() => setDialogOpen(false)} submitting={createMutation.isPending} />
      </Dialog>
    </div>
  );
}
