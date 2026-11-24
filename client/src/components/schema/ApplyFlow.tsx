import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { useSchemaEdit } from '@/hooks/useSchemaEdit';
import type { SchemaOp } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';

/**
 * Drives the preview -> confirm -> apply lifecycle for a set of schema
 * operations. Shows the generated SQL, flags destructive changes, and
 * requires an explicit (and for destructive ops, a second) confirmation.
 */
export function ApplyFlow({
  ops,
  defaultMigrationName,
  disabled,
  onApplied,
  triggerLabel = 'Review change',
}: {
  ops: SchemaOp[] | null;
  defaultMigrationName: string;
  disabled?: boolean;
  onApplied: () => void;
  triggerLabel?: string;
}) {
  const { phase, preview, error, result, runPreview, apply, reset } = useSchemaEdit();
  const [migrationName, setMigrationName] = useState(defaultMigrationName);
  const [ackDestructive, setAckDestructive] = useState(false);

  const start = () => {
    if (!ops) return;
    setAckDestructive(false);
    setMigrationName(defaultMigrationName);
    runPreview(ops);
  };

  if (phase === 'idle') {
    return (
      <Button onClick={start} disabled={disabled || !ops}>
        {triggerLabel}
      </Button>
    );
  }

  if (phase === 'done' && result) {
    return (
      <Notice tone="success" className="space-y-3">
        <p className="flex items-center gap-2 font-medium text-success">
          <CheckCircle2 className="h-4 w-4" /> Migration applied: {result.migrationName}
        </p>
        {result.error && (
          <p className="flex items-start gap-2 text-xs text-warning">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {result.error}
          </p>
        )}
        <Button
          size="sm"
          onClick={() => {
            reset();
            onApplied();
          }}
        >
          Done
        </Button>
      </Notice>
    );
  }

  return (
    <div className="space-y-3">
      {(phase === 'previewing' || phase === 'applying') && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {phase === 'previewing' ? 'Generating SQL preview...' : 'Applying migration...'}
        </p>
      )}

      {error && (
        <Notice tone="error">
          <p className="font-medium">Error</p>
          <pre className="mt-1 whitespace-pre-wrap text-xs">{error}</pre>
        </Notice>
      )}

      {preview && (phase === 'preview-ready' || phase === 'applying') && (
        <div className="space-y-3">
          <div>
            <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">Generated SQL</p>
            <Card flat className="bg-muted/40"><pre className="max-h-48 overflow-auto p-3 text-xs">
              {preview.sql}
            </pre></Card>
          </div>

          {preview.warnings.map((w, i) => (
            <Notice key={i} tone={preview.destructive ? 'error' : 'warning'} className="flex items-start gap-2 p-2 text-xs">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{w}</span>
            </Notice>
          ))}

          <div className="space-y-1.5">
            <Label htmlFor="migrationName">Migration name</Label>
            <Input
              id="migrationName"
              value={migrationName}
              onChange={(e) => setMigrationName(e.target.value)}
            />
          </div>

          {preview.destructive && (
            <label className="flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={ackDestructive}
                onChange={(e) => setAckDestructive(e.target.checked)}
              />
              <span>
                I understand this permanently deletes data and cannot be undone.
              </span>
            </label>
          )}

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={reset} disabled={phase === 'applying'}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant={preview.destructive ? 'destructive' : 'default'}
              disabled={
                phase === 'applying' ||
                !ops ||
                (preview.destructive && !ackDestructive) ||
                preview.warnings.includes('No schema changes detected.')
              }
              onClick={() => ops && apply(ops, migrationName)}
            >
              {preview.destructive ? 'Apply (destructive)' : 'Apply migration'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
