import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** Shows a generated temporary password once, with a copy button. */
export function TemporaryPasswordNotice({ email, password }: { email: string; password: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; the field is selectable as a fallback.
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="temporary-password">Temporary password for {email}</Label>
        <div className="flex gap-2">
          <Input
            id="temporary-password"
            readOnly
            value={password}
            className="font-mono"
            onFocus={(e) => e.currentTarget.select()}
          />
          <Button type="button" variant="outline" onClick={copy} aria-label="Copy temporary password">
            {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
            <span aria-live="polite">{copied ? 'Copied' : 'Copy'}</span>
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        This is shown only once. Share it with them privately, for example in person or by phone,
        not in the same message as their email address. They'll choose their own password when they
        sign in.
      </p>
    </div>
  );
}
