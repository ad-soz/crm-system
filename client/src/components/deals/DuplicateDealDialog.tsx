import { useState } from 'react';
import { api, getApiErrorMessage } from '@/lib/api';
import { useInvalidate, useMutation } from '@/hooks/queries';
import { Dialog, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Notice } from '@/components/ui/notice';
import { DealForm, type DealFormValues } from '@/components/forms/DealForm';
import { cleanup } from '@/pages/Companies';
import { useToast } from '@/context/ToastContext';
import type { Deal } from '@/types';

/** What a copy starts with. Everything here can still be changed before saving. */
export function copyOf(deal: Deal): Partial<Deal> {
  return {
    title: `${deal.title} (copy)`,
    amount: deal.amount,
    companyId: deal.companyId ?? undefined,
    personId: deal.personId ?? undefined,
    expectedCloseDate: deal.expectedCloseDate ?? undefined,
    // No stage on purpose: a copy is a new opportunity, so it starts at the list's default stage
    // (and a copy of a won deal does not start out won).
  };
}

/**
 * Duplicate a deal: the new deal's form opens already filled in from the original, with the
 * title selected so a new name can be typed straight away. Enter saves.
 *
 * Copied: title, amount, company, person, expected close date.
 * Not copied: stage (starts at the default), contacts, tasks, stage history, and owner
 * (the person making the copy owns it).
 *
 * One dialog serves every place a deal is listed, so each page offers duplicating the same way.
 */
export function DuplicateDealDialog({
  deal,
  onClose,
  onCreated,
}: {
  /** The deal to copy, or null when closed. */
  deal: Deal | null;
  onClose: () => void;
  onCreated?: (created: Deal) => void;
}) {
  const invalidate = useInvalidate();
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async (values: DealFormValues) => (await api.post<Deal>('/deals', cleanup(values))).data,
    onSuccess: (created) => {
      invalidate(['deals', 'pipeline', 'dashboard', 'analyse']);
      toast(`Deal duplicated as "${created?.title ?? 'the copy'}"`);
      setError(null);
      onClose();
      if (created) onCreated?.(created);
    },
    // Keep the form open so what was typed is not lost.
    onError: (err) => setError(getApiErrorMessage(err)),
  });

  const close = () => {
    setError(null);
    onClose();
  };

  return (
    <Dialog open={deal !== null} onOpenChange={(open) => !open && close()}>
      <DialogHeader>
        <DialogTitle>Duplicate deal</DialogTitle>
      </DialogHeader>
      {deal && (
        <>
          <p className="mb-3 text-sm text-muted-foreground">
            A new deal, copied from "{deal.title}". Contacts, tasks and history are not copied.
          </p>
          {error && (
            <Notice tone="error" role="alert" className="mb-3">
              {error}
            </Notice>
          )}
          <DealForm
            initial={copyOf(deal)}
            autoFocusTitle
            submitLabel="Create copy"
            onSubmit={(v) => {
              setError(null);
              create.mutate(v);
            }}
            onCancel={close}
            submitting={create.isPending}
          />
        </>
      )}
    </Dialog>
  );
}
