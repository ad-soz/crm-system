import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StageBadge } from '@/lib/display';
import type { ReferenceValue } from '@/types';

export const MAX_COMMENT = 1000;

/** What a person has typed, tidied the way the server will tidy it. */
export function cleanComment(text: string): string {
  return text.trim();
}

/**
 * Asks why a deal is moving to another stage. The move only happens when a
 * comment is given: it is saved with the date/time and who made the move.
 * The server and database insist on the same rule, so this is a convenience,
 * not the only guard.
 */
export function StageChangeDialog({
  open,
  dealTitle,
  from,
  to,
  submitting,
  error,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  dealTitle: string;
  from?: ReferenceValue | null;
  to?: ReferenceValue | null;
  submitting?: boolean;
  /** A message from the server if the last attempt was refused. */
  error?: string | null;
  onConfirm: (comment: string) => void;
  onCancel: () => void;
}) {
  const [comment, setComment] = useState('');
  const [touched, setTouched] = useState(false);

  // Start empty each time the dialog opens.
  useEffect(() => {
    if (open) {
      setComment('');
      setTouched(false);
    }
  }, [open]);

  const clean = cleanComment(comment);
  const tooLong = comment.length > MAX_COMMENT;
  const problem = !clean ? 'Add a comment to explain the move' : tooLong ? `Keep it under ${MAX_COMMENT} characters` : null;

  const submit = () => {
    setTouched(true);
    if (!problem) onConfirm(clean);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !submitting && onCancel()}>
      <DialogHeader>
        <DialogTitle>Move deal to another stage</DialogTitle>
        <DialogDescription>
          <span className="font-medium text-foreground">{dealTitle}</span>
        </DialogDescription>
      </DialogHeader>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="space-y-4"
      >
        <div className="flex flex-wrap items-center gap-2" aria-label="Stage change">
          <StageBadge stage={from} />
          <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden />
          <StageBadge stage={to} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="stage-comment">Why is it moving? *</Label>
          <Textarea
            id="stage-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onBlur={() => setTouched(true)}
            autoFocus
            rows={3}
            aria-invalid={touched && !!problem}
            aria-describedby="stage-comment-help"
            placeholder="e.g. Budget approved, waiting on legal"
          />
          <p id="stage-comment-help" className="text-xs text-muted-foreground">
            Saved with the date and time and your name, in the deal's history. {clean.length}/{MAX_COMMENT}
          </p>
          {touched && problem && (
            <p role="alert" className="text-xs text-destructive">
              {problem}
            </p>
          )}
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Moving...' : 'Move deal'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
