import { Badge } from '@/components/ui/badge';
import {
  Mail,
  Phone,
  Users,
  FileText,
  Calendar,
  MessageCircle,
  Video,
  Check,
  Circle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReferenceValue, ContactIconName } from '@/types';

// A reference value's colour comes straight from the list, so renaming or
// recolouring a value in Settings is reflected everywhere automatically.
type Named = Pick<ReferenceValue, 'name' | 'colour'>;

function ReferenceBadge({ value }: { value?: Named | null }) {
  if (!value) return <span className="text-muted-foreground">-</span>;
  return <Badge variant={value.colour ?? 'secondary'}>{value.name}</Badge>;
}

export function StageBadge({ stage }: { stage?: Named | null }) {
  return <ReferenceBadge value={stage} />;
}

export function PriorityBadge({ priority }: { priority?: ReferenceValue | null }) {
  return <ReferenceBadge value={priority} />;
}

export function StatusBadge({ status }: { status?: ReferenceValue | null }) {
  return <ReferenceBadge value={status} />;
}

const ICON_MAP: Record<ContactIconName, LucideIcon> = {
  mail: Mail,
  phone: Phone,
  users: Users,
  'file-text': FileText,
  calendar: Calendar,
  'message-circle': MessageCircle,
  video: Video,
  check: Check,
};

// Map a reference colour to a text-colour class for an icon tint.
const COLOUR_TEXT: Record<string, string> = {
  info: 'text-info',
  success: 'text-success',
  warning: 'text-warning',
  destructive: 'text-destructive',
  default: 'text-primary',
  secondary: 'text-muted-foreground',
};

export function ContactIcon({ type }: { type?: ReferenceValue | null }) {
  const cls = 'h-4 w-4';
  const Icon = (type?.icon && ICON_MAP[type.icon]) || Circle;
  const tint = COLOUR_TEXT[type?.colour ?? 'secondary'] ?? 'text-muted-foreground';
  return <Icon className={`${cls} ${tint}`} aria-label={type?.name} />;
}

export function stageLabel(stage?: ReferenceValue | null): string {
  return stage?.name ?? '';
}
