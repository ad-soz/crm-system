import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

export const PERIODS = [
  { value: '3', label: 'Last 3 months' },
  { value: '6', label: 'Last 6 months' },
  { value: '12', label: 'Last 12 months' },
];

/** Choose the period and, optionally, one person. Everything on the page follows these two choices. */
export function ReportToolbar({
  months,
  ownerId,
  owners,
  onMonths,
  onOwner,
}: {
  months: number;
  ownerId: string;
  owners: { id: string; name: string }[];
  onMonths: (months: number) => void;
  onOwner: (ownerId: string) => void;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end gap-4" role="group" aria-label="Report filters">
      <div className="space-y-1.5">
        <Label htmlFor="report-period">Period</Label>
        <Select
          id="report-period"
          value={String(months)}
          options={PERIODS}
          onValueChange={(v) => onMonths(Number(v))}
          className="w-44"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="report-person">Person</Label>
        <Select
          id="report-person"
          value={ownerId}
          placeholder="Everyone"
          options={owners.map((o) => ({ value: o.id, label: o.name }))}
          onValueChange={onOwner}
          className="w-52"
        />
      </div>
    </div>
  );
}
