// The reference lists, described once. The service, the catalog endpoint, and
// the client's Reference Data settings page are all built from this.

export interface ExtraFlag {
  key: 'outcome' | 'winChance' | 'isDone' | 'icon';
  label: string;
}

export interface ListConfig {
  /** URL segment and client key, e.g. /reference/deal-stages. */
  key: string;
  model:
    | 'industry'
    | 'dealStage'
    | 'contactType'
    | 'taskStatus'
    | 'taskPriority';
  label: string;
  /** Singular noun for messages. */
  noun: string;
  /** Required lists always have a default and cannot be emptied. */
  required: boolean;
  /** Field key for the single/multiple setting, if this list supports it. */
  multiField?: string;
  /** Extra per-value attributes beyond name/colour/order/active. */
  extra: ExtraFlag[];
}

export const LISTS: ListConfig[] = [
  {
    key: 'industries',
    model: 'industry',
    label: 'Company industries',
    noun: 'industry',
    required: false,
    multiField: 'company.industry',
    extra: [],
  },
  {
    key: 'deal-stages',
    model: 'dealStage',
    label: 'Deal stages',
    noun: 'deal stage',
    required: true,
    extra: [
      { key: 'outcome', label: 'Outcome' },
      { key: 'winChance', label: 'Win chance (%)' },
    ],
  },
  {
    key: 'contact-types',
    model: 'contactType',
    label: 'Contact types',
    noun: 'contact type',
    required: true,
    extra: [{ key: 'icon', label: 'Icon' }],
  },
  {
    key: 'task-statuses',
    model: 'taskStatus',
    label: 'Task statuses',
    noun: 'task status',
    required: true,
    extra: [{ key: 'isDone', label: 'Counts as done' }],
  },
  {
    key: 'task-priorities',
    model: 'taskPriority',
    label: 'Task priorities',
    noun: 'task priority',
    required: true,
    extra: [],
  },
];

export function listByKey(key: string): ListConfig | undefined {
  return LISTS.find((l) => l.key === key);
}

// Badge colours a value may use, matching the UI theme tokens.
export const COLOURS = ['secondary', 'default', 'info', 'success', 'warning', 'destructive'] as const;

// Icon names a value may use (lucide-react), kept small and curated.
export const ICONS = ['mail', 'phone', 'users', 'file-text', 'calendar', 'message-circle', 'video', 'check'] as const;

export const STAGE_OUTCOMES = ['OPEN', 'WON', 'LOST'] as const;
