import { useState } from 'react';
import { Plus, ArrowUp, ArrowDown, Star, Trash2 } from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api';
import {
  useReferenceCatalog,
  useReferenceList,
  useInvalidateReference,
  useMutation,
} from '@/hooks/queries';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingState, ErrorState, PageHeader } from '@/components/states';
import { useToast } from '@/context/ToastContext';
import { RequirePermission } from '@/components/RequirePermission';
import { REFERENCE_COLOURS, CONTACT_ICONS } from '@/types';
import type { ReferenceListMeta, ReferenceValue } from '@/types';

const COLOUR_OPTIONS = REFERENCE_COLOURS.map((c) => ({ value: c, label: c }));
const ICON_OPTIONS = CONTACT_ICONS.map((i) => ({ value: i, label: i }));
const OUTCOME_OPTIONS = [
  { value: 'OPEN', label: 'Open' },
  { value: 'WON', label: 'Won (closed, counts as a win)' },
  { value: 'LOST', label: 'Lost (closed, counts as a loss)' },
];

export default function ReferenceData() {
  const { data: catalog, isLoading, isError } = useReferenceCatalog();

  return (
    <RequirePermission permission="reference.manage">
      <div>
        <PageHeader
          title="Reference lists"
          description="The fixed choices used across the app. Add, rename, recolour, reorder, or retire values, and set defaults."
        />
        {isLoading && <LoadingState />}
        {isError && <ErrorState message="Failed to load reference lists" />}
        {catalog && (
          <div className="space-y-6">
            {catalog.lists.map((list) => (
              <ListCard key={list.key} list={list} />
            ))}
          </div>
        )}
      </div>
    </RequirePermission>
  );
}

function ListCard({ list }: { list: ReferenceListMeta }) {
  const { data, isLoading } = useReferenceList(list.key);
  const invalidate = useInvalidateReference();
  const { toast } = useToast();
  const [newName, setNewName] = useState('');

  const onError = (err: unknown) => toast(getApiErrorMessage(err), 'error');
  const onOk = (msg: string) => {
    invalidate();
    toast(msg);
  };

  const createMutation = useMutation({
    mutationFn: (name: string) => api.post(`/reference/${list.key}`, { name }),
    onSuccess: () => {
      setNewName('');
      onOk('Value added');
    },
    onError,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: Partial<ReferenceValue> }) =>
      api.patch(`/reference/${list.key}/${id}`, changes),
    onSuccess: () => onOk('Saved'),
    onError,
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/reference/${list.key}/${id}`),
    onSuccess: () => onOk('Value deleted'),
    onError,
  });

  const reorderMutation = useMutation({
    mutationFn: (ids: string[]) => api.patch(`/reference/${list.key}/order`, { ids }),
    onSuccess: () => invalidate(),
    onError,
  });

  const multipleMutation = useMutation({
    mutationFn: (allowMultiple: boolean) => api.put(`/reference/${list.key}/multiple`, { allowMultiple }),
    onSuccess: () => onOk('Selection setting updated'),
    onError,
  });

  const values = data?.values ?? [];

  const move = (index: number, dir: -1 | 1) => {
    const next = [...values];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    reorderMutation.mutate(next.map((v) => v.id));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{list.label}</span>
          {list.required && <Badge variant="secondary">Required</Badge>}
        </CardTitle>
        {list.multiField && (
          <label className="mt-2 flex items-center gap-2 text-sm font-normal text-muted-foreground">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input"
              checked={!!list.allowMultiple}
              onChange={(e) => multipleMutation.mutate(e.target.checked)}
            />
            Allow choosing more than one {list.noun} per record
          </label>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <LoadingState />
        ) : (
          <div className="space-y-2">
            {values.map((value, index) => (
              <ValueRow
                key={value.id}
                list={list}
                value={value}
                isFirst={index === 0}
                isLast={index === values.length - 1}
                onMove={(dir) => move(index, dir)}
                onChange={(changes) => updateMutation.mutate({ id: value.id, changes })}
                onRemove={() => {
                  if (value.inUse) {
                    toast('This value is in use. Retire it instead of deleting.', 'error');
                    return;
                  }
                  if (confirm(`Delete "${value.name}"?`)) removeMutation.mutate(value.id);
                }}
              />
            ))}

            <div className="flex items-end gap-2 pt-2">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor={`new-${list.key}`}>Add a {list.noun}</Label>
                <Input
                  id={`new-${list.key}`}
                  value={newName}
                  placeholder={`New ${list.noun} name`}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newName.trim()) createMutation.mutate(newName.trim());
                  }}
                />
              </div>
              <Button
                type="button"
                disabled={!newName.trim() || createMutation.isPending}
                onClick={() => createMutation.mutate(newName.trim())}
              >
                <Plus className="h-4 w-4" /> Add
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ValueRow({
  list,
  value,
  isFirst,
  isLast,
  onMove,
  onChange,
  onRemove,
}: {
  list: ReferenceListMeta;
  value: ReferenceValue;
  isFirst: boolean;
  isLast: boolean;
  onMove: (dir: -1 | 1) => void;
  onChange: (changes: Partial<ReferenceValue>) => void;
  onRemove: () => void;
}) {
  const hasDefault = list.required; // required lists carry a default value
  const supportsOutcome = list.extra.some((e) => e.key === 'outcome');
  const supportsChance = list.extra.some((e) => e.key === 'winChance');
  const supportsDone = list.extra.some((e) => e.key === 'isDone');
  const supportsIcon = list.extra.some((e) => e.key === 'icon');
  // A locally-editable name that commits on blur, so typing isn't interrupted.
  const [name, setName] = useState(value.name);
  const [chance, setChance] = useState(String(value.winChance ?? 0));
  const isOpenStage = (value.outcome ?? 'OPEN') === 'OPEN';
  const chanceValid = /^\d{1,3}$/.test(chance) && Number(chance) <= 100;

  return (
    <Card flat className="flex flex-wrap items-center gap-2 p-2">
      <div className="flex flex-col">
        <button
          type="button"
          aria-label="Move up"
          disabled={isFirst}
          onClick={() => onMove(-1)}
          className="text-muted-foreground disabled:opacity-30"
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Move down"
          disabled={isLast}
          onClick={() => onMove(1)}
          className="text-muted-foreground disabled:opacity-30"
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </button>
      </div>

      <Input
        aria-label={`Name for ${value.name}`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() && name !== value.name && onChange({ name: name.trim() })}
        className="h-8 w-40"
      />

      <Select
        aria-label={`Colour for ${value.name}`}
        value={value.colour}
        options={COLOUR_OPTIONS}
        onValueChange={(v) => onChange({ colour: v as ReferenceValue['colour'] })}
        className="h-8 w-32"
      />

      {supportsIcon && (
        <Select
          aria-label={`Icon for ${value.name}`}
          value={value.icon ?? ''}
          placeholder="icon"
          options={ICON_OPTIONS}
          onValueChange={(v) => onChange({ icon: (v || null) as ReferenceValue['icon'] })}
          className="h-8 w-32"
        />
      )}

      {supportsOutcome && (
        <Select
          aria-label={`Outcome for ${value.name}`}
          value={value.outcome ?? 'OPEN'}
          options={OUTCOME_OPTIONS}
          onValueChange={(v) => onChange({ outcome: v as ReferenceValue['outcome'] })}
          className="h-8 w-56"
        />
      )}

      {supportsChance &&
        (isOpenStage ? (
          <label className="flex items-center gap-1.5 text-xs">
            <span>Win chance</span>
            <Input
              type="number"
              min={0}
              max={100}
              step={1}
              inputMode="numeric"
              aria-label={`Win chance (%) for ${value.name}`}
              aria-invalid={!chanceValid}
              value={chance}
              onChange={(e) => setChance(e.target.value)}
              onBlur={() => {
                if (!chanceValid) setChance(String(value.winChance ?? 0));
                else if (Number(chance) !== value.winChance) onChange({ winChance: Number(chance) });
              }}
              className="h-8 w-20"
            />
            <span>%</span>
          </label>
        ) : (
          <span className="text-xs text-muted-foreground">
            {value.outcome === 'WON' ? 'Always 100% (won)' : 'Always 0% (lost)'}
          </span>
        ))}

      {supportsDone && (
        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-input"
            checked={!!value.isDone}
            onChange={(e) => onChange({ isDone: e.target.checked })}
          />
          Counts as done
        </label>
      )}

      <Badge variant={value.colour ?? 'secondary'}>{value.name}</Badge>

      <div className="ml-auto flex items-center gap-1">
        {hasDefault && (
          <Button
            type="button"
            size="sm"
            variant={value.isDefault ? 'default' : 'ghost'}
            title={value.isDefault ? 'This is the default' : 'Make default'}
            disabled={value.isDefault || !value.isActive}
            onClick={() => onChange({ isDefault: true })}
          >
            <Star className="h-3.5 w-3.5" /> {value.isDefault ? 'Default' : 'Set default'}
          </Button>
        )}

        <Button
          type="button"
          size="sm"
          variant="ghost"
          title={value.isActive ? 'Retire (hide from new records)' : 'Restore'}
          onClick={() => onChange({ isActive: !value.isActive })}
        >
          {value.isActive ? 'Retire' : 'Restore'}
        </Button>

        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={`Delete ${value.name}`}
          title={value.inUse ? 'In use — retire instead' : 'Delete'}
          onClick={onRemove}
        >
          <Trash2 className="h-4 w-4" />
        </Button>

        {value.usageCount ? (
          <span className="text-xs text-muted-foreground">{value.usageCount} in use</span>
        ) : null}
        {!value.isActive && <Badge variant="secondary">Retired</Badge>}
      </div>
    </Card>
  );
}
