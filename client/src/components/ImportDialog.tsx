import { useState } from 'react';
import { api, getApiErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/context/ToastContext';
import type { ImportResult } from '@/types';
import { Card } from '@/components/ui/card';

export function ImportDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const reset = () => {
    setFile(null);
    setResult(null);
  };

  const handleImport = async () => {
    if (!file) return;
    setSubmitting(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post<ImportResult>('/import/people', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(res.data);
      onImported();
      toast(`Imported ${res.data.imported} of ${res.data.total} people`);
    } catch (err) {
      toast(getApiErrorMessage(err), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogHeader>
        <DialogTitle>Import People</DialogTitle>
        <DialogDescription>
          Upload a CSV with columns: firstName, lastName, email, phone, title, companyName.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <Card flat dashed className="hover:bg-accent/40"><label className="flex cursor-pointer flex-col items-center justify-center p-6 text-center text-sm text-muted-foreground">
          <input
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f && !f.name.toLowerCase().endsWith('.csv')) {
                toast('Only .csv files are accepted', 'error');
                return;
              }
              setFile(f ?? null);
              setResult(null);
            }}
          />
          {file ? <span className="font-medium text-foreground">{file.name}</span> : 'Click to choose a CSV file'}
        </label></Card>

        {result && (
          <Card flat className="p-3 text-sm">
            <p className="font-medium">
              {result.imported} imported, {result.errors.length} error(s), {result.total} total
            </p>
            {result.errors.length > 0 && (
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-destructive">
                {result.errors.map((e, i) => (
                  <li key={i}>
                    Row {e.row}: {e.message}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Close
        </Button>
        <Button onClick={handleImport} disabled={!file || submitting}>
          {submitting ? 'Importing...' : 'Import'}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
