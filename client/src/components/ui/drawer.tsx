import * as React from 'react';
import { X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  title?: string;
  description?: string;
  widthClass?: string;
}

export function Drawer({ open, onOpenChange, children, title, description, widthClass }: DrawerProps) {
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="fixed inset-0 bg-black/40" onClick={() => onOpenChange(false)} data-testid="drawer-overlay" />
      <Card
        className={cn(
          'fixed right-0 top-0 z-50 flex h-full flex-col rounded-none border-y-0 border-r-0 shadow-xl',
          widthClass ?? 'w-full max-w-md',
        )}
      >
        <div className="flex items-start justify-between border-b p-4">
          <div>
            {title && <h2 className="text-lg font-semibold">{title}</h2>}
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-sm opacity-70 hover:opacity-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </Card>
    </div>
  );
}
