import * as React from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const TONES = {
  neutral: '',
  error: 'border-destructive/30 bg-destructive/5 text-destructive',
  warning: 'border-warning/40 bg-warning/10 text-warning',
  success: 'border-success/40 bg-success/10 text-success',
} as const;

export interface NoticeProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: keyof typeof TONES;
}

/** A tinted message box (errors, warnings, results). Built on Card, without the glow. */
export const Notice = React.forwardRef<HTMLDivElement, NoticeProps>(
  ({ tone = 'neutral', className, ...props }, ref) => (
    <Card ref={ref} flat className={cn('p-3 text-sm', TONES[tone], className)} {...props} />
  ),
);
Notice.displayName = 'Notice';
