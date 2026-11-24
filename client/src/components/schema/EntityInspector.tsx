import { useState } from 'react';
import { KeyRound, Link2, Plus, Pencil, Trash2 } from 'lucide-react';
import type { ErdModel, ErdResponse, ScalarType, SchemaOp } from '@/types';
import { SCALAR_TYPES } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ApplyFlow } from './ApplyFlow';
import { Card } from '@/components/ui/card';

type Mode =
  | { type: 'view' }
  | { type: 'addField' }
  | { type: 'editField'; field: string }
  | { type: 'dropField'; field: string }
  | { type: 'dropEntity' };

const RESERVED = new Set(['id', 'createdAt', 'updatedAt']);

export function EntityInspector({
  model,
  erd,
  canEdit,
  onApplied,
}: {
  model: ErdModel;
  erd: ErdResponse;
  canEdit: boolean;
  onApplied: () => void;
}) {
  const [mode, setMode] = useState<Mode>({ type: 'view' });
  const scalars = model.fields.filter((f) => f.kind !== 'object');
  const relations = model.fields.filter((f) => f.kind === 'object');
  const fkNames = new Set(
    erd.relations.filter((r) => r.from === model.name).map((r) => r.fromKey).filter(Boolean) as string[],
  );

  return (
    <div className="space-y-5">
      {/* Field list */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Fields</h3>
          {canEdit && mode.type === 'view' && (
            <Button size="sm" variant="outline" onClick={() => setMode({ type: 'addField' })}>
              <Plus className="h-3.5 w-3.5" /> Add field
            </Button>
          )}
        </div>
        <Card flat className="overflow-hidden"><ul className="divide-y text-sm">
          {scalars.map((f) => (
            <li key={f.name} className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="flex items-center gap-1.5">
                {f.isId && <KeyRound className="h-3.5 w-3.5 text-warning" />}
                {fkNames.has(f.name) && <Link2 className="h-3.5 w-3.5 text-info" />}
                <span className="font-medium">{f.name}</span>
                <span className="text-muted-foreground">
                  {f.type}
                  {f.isRequired || f.isId ? '' : '?'}
                </span>
                {f.isUnique && !f.isId && <Badge variant="info">unique</Badge>}
              </span>
              {canEdit && !f.isId && !RESERVED.has(f.name) && !fkNames.has(f.name) && (
                <span className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setMode({ type: 'editField', field: f.name })} aria-label={`Edit ${f.name}`}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setMode({ type: 'dropField', field: f.name })} aria-label={`Drop ${f.name}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul></Card>
      </section>

      {/* Relations summary */}
      {relations.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold">Relations</h3>
          <ul className="space-y-1 text-sm">
            {relations.map((r) => (
              <li key={r.name} className="flex items-center gap-2 text-muted-foreground">
                <Link2 className="h-3.5 w-3.5 text-info" />
                <span className="font-medium text-foreground">{r.name}</span>
                <span>
                  {r.isList ? `many ${r.type}` : `one ${r.type}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Danger zone */}
      {canEdit && mode.type === 'view' && (
        <Card flat className="border-destructive/30 p-3">
          <h3 className="mb-1 text-sm font-semibold text-destructive">Danger zone</h3>
          <p className="mb-2 text-xs text-muted-foreground">
            Dropping this entity removes the table and all its data. Allowed only if no other table
            references it.
          </p>
          <Button size="sm" variant="destructive" onClick={() => setMode({ type: 'dropEntity' })}>
            <Trash2 className="h-3.5 w-3.5" /> Drop {model.name}
          </Button>
        </Card>
      )}

      {/* Edit modes */}
      {mode.type === 'addField' && (
        <AddFieldForm model={model.name} onCancel={() => setMode({ type: 'view' })} onApplied={() => { setMode({ type: 'view' }); onApplied(); }} />
      )}
      {mode.type === 'editField' && (
        <EditFieldForm
          model={model.name}
          field={scalars.find((f) => f.name === mode.field)!}
          onCancel={() => setMode({ type: 'view' })}
          onApplied={() => { setMode({ type: 'view' }); onApplied(); }}
        />
      )}
      {mode.type === 'dropField' && (
        <ConfirmBlock
          title={`Drop field "${mode.field}"`}
          ops={[{ kind: 'dropField', model: model.name, field: mode.field }]}
          migrationName={`drop_${model.name}_${mode.field}`.toLowerCase()}
          onCancel={() => setMode({ type: 'view' })}
          onApplied={() => { setMode({ type: 'view' }); onApplied(); }}
        />
      )}
      {mode.type === 'dropEntity' && (
        <ConfirmBlock
          title={`Drop entity "${model.name}"`}
          ops={[{ kind: 'dropEntity', name: model.name }]}
          migrationName={`drop_${model.name}`.toLowerCase()}
          onCancel={() => setMode({ type: 'view' })}
          onApplied={() => { setMode({ type: 'view' }); onApplied(); }}
        />
      )}
    </div>
  );
}

function AddFieldForm({ model, onCancel, onApplied }: { model: string; onCancel: () => void; onApplied: () => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<ScalarType>('String');
  const [required, setRequired] = useState(false);
  const [unique, setUnique] = useState(false);
  const [defaultValue, setDefaultValue] = useState('');

  const valid = /^[A-Za-z][A-Za-z0-9_]*$/.test(name) && (!required || defaultValue !== '');
  const ops: SchemaOp[] | null = valid
    ? [{ kind: 'addField', model, field: { name, type, required, unique, defaultValue: defaultValue === '' ? undefined : coerce(defaultValue, type) } }]
    : null;

  return (
    <Card flat className="space-y-3 p-3">
      <h3 className="text-sm font-semibold">Add field to {model}</h3>
      <div className="space-y-1.5">
        <Label htmlFor="nf-name">Name</Label>
        <Input id="nf-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. notes" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="nf-type">Type</Label>
          <Select id="nf-type" value={type} options={SCALAR_TYPES.map((t) => ({ value: t, label: t }))} onValueChange={(v) => setType(v as ScalarType)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nf-default">Default {required && <span className="text-destructive">*</span>}</Label>
          <Input id="nf-default" value={defaultValue} onChange={(e) => setDefaultValue(e.target.value)} placeholder="optional" />
        </div>
      </div>
      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} /> Required
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={unique} onChange={(e) => setUnique(e.target.checked)} /> Unique
        </label>
      </div>
      {required && defaultValue === '' && (
        <p className="text-xs text-warning">A required field needs a default so existing rows stay valid.</p>
      )}
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        <ApplyFlow ops={ops} defaultMigrationName={`add_${model}_${name || 'field'}`.toLowerCase()} disabled={!valid} onApplied={onApplied} />
      </div>
    </Card>
  );
}

function EditFieldForm({
  model,
  field,
  onCancel,
  onApplied,
}: {
  model: string;
  field: { name: string; type: string; isRequired: boolean; isUnique: boolean };
  onCancel: () => void;
  onApplied: () => void;
}) {
  const [name, setName] = useState(field.name);
  const [type, setType] = useState<ScalarType>(field.type as ScalarType);
  const [required, setRequired] = useState(field.isRequired);
  const [unique, setUnique] = useState(field.isUnique);

  const changes: Record<string, unknown> = {};
  if (name !== field.name) changes.name = name;
  if (type !== field.type) changes.type = type;
  if (required !== field.isRequired) changes.required = required;
  if (unique !== field.isUnique) changes.unique = unique;
  const hasChanges = Object.keys(changes).length > 0 && /^[A-Za-z][A-Za-z0-9_]*$/.test(name);

  const ops: SchemaOp[] | null = hasChanges
    ? [{ kind: 'updateField', model, field: field.name, changes }]
    : null;

  return (
    <Card flat className="space-y-3 p-3">
      <h3 className="text-sm font-semibold">Edit field "{field.name}"</h3>
      <div className="space-y-1.5">
        <Label htmlFor="ef-name">Name</Label>
        <Input id="ef-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ef-type">Type</Label>
        <Select id="ef-type" value={type} options={SCALAR_TYPES.map((t) => ({ value: t, label: t }))} onValueChange={(v) => setType(v as ScalarType)} />
      </div>
      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} /> Required
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={unique} onChange={(e) => setUnique(e.target.checked)} /> Unique
        </label>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        <ApplyFlow ops={ops} defaultMigrationName={`edit_${model}_${field.name}`.toLowerCase()} disabled={!hasChanges} onApplied={onApplied} />
      </div>
    </Card>
  );
}

export function ConfirmBlock({
  title,
  ops,
  migrationName,
  onCancel,
  onApplied,
}: {
  title: string;
  ops: SchemaOp[];
  migrationName: string;
  onCancel: () => void;
  onApplied: () => void;
}) {
  return (
    <Card flat className="space-y-3 border-destructive/30 p-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        <ApplyFlow ops={ops} defaultMigrationName={migrationName} onApplied={onApplied} triggerLabel="Review change" />
      </div>
    </Card>
  );
}

function coerce(value: string, type: ScalarType): string | number | boolean {
  if (type === 'Int' || type === 'Float') return Number(value);
  if (type === 'Boolean') return value === 'true';
  return value;
}
