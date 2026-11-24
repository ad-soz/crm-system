import { useState } from 'react';
import type { ErdResponse, ScalarType, SchemaOp } from '@/types';
import { SCALAR_TYPES } from '@/types';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ApplyFlow } from './ApplyFlow';

/** Panel for creating a new entity or a new relation. */
export function CreatePanel({ erd, onApplied }: { erd: ErdResponse; onApplied: () => void }) {
  const [tab, setTab] = useState('entity');
  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList>
        <TabsTrigger value="entity">New entity</TabsTrigger>
        <TabsTrigger value="relation">New relation</TabsTrigger>
      </TabsList>
      <TabsContent value="entity">
        <NewEntityForm onApplied={onApplied} />
      </TabsContent>
      <TabsContent value="relation">
        <NewRelationForm erd={erd} onApplied={onApplied} />
      </TabsContent>
    </Tabs>
  );
}

function NewEntityForm({ onApplied }: { onApplied: () => void }) {
  const [name, setName] = useState('');
  const [fieldName, setFieldName] = useState('');
  const [fieldType, setFieldType] = useState<ScalarType>('String');

  const valid = /^[A-Z][A-Za-z0-9_]*$/.test(name);
  const extraFields =
    fieldName && /^[A-Za-z][A-Za-z0-9_]*$/.test(fieldName)
      ? [{ name: fieldName, type: fieldType, required: false, unique: false }]
      : undefined;
  const ops: SchemaOp[] | null = valid ? [{ kind: 'addEntity', name, fields: extraFields }] : null;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Creates a table with <code>id</code>, <code>createdAt</code>, and <code>updatedAt</code>{' '}
        automatically. Add relations afterwards.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="ne-name">Entity name (PascalCase)</Label>
        <Input id="ne-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Note" />
        {name && !valid && <p className="text-xs text-destructive">Must start with an uppercase letter.</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="ne-field">First field (optional)</Label>
          <Input id="ne-field" value={fieldName} onChange={(e) => setFieldName(e.target.value)} placeholder="e.g. body" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ne-ftype">Type</Label>
          <Select id="ne-ftype" value={fieldType} options={SCALAR_TYPES.map((t) => ({ value: t, label: t }))} onValueChange={(v) => setFieldType(v as ScalarType)} />
        </div>
      </div>
      <ApplyFlow ops={ops} defaultMigrationName={`add_entity_${name || 'entity'}`.toLowerCase()} disabled={!valid} onApplied={onApplied} />
    </div>
  );
}

function NewRelationForm({ erd, onApplied }: { erd: ErdResponse; onApplied: () => void }) {
  const modelOptions = erd.models.map((m) => ({ value: m.name, label: m.name }));
  const [from, setFrom] = useState(erd.models[0]?.name ?? '');
  const [to, setTo] = useState(erd.models[1]?.name ?? erd.models[0]?.name ?? '');
  const [fkName, setFkName] = useState('');
  const [optional, setOptional] = useState(true);

  const valid = from && to && /^[A-Za-z][A-Za-z0-9_]*$/.test(fkName);
  const ops: SchemaOp[] | null = valid
    ? [{ kind: 'addRelation', from, to, fkName, optional, onDelete: optional ? 'SetNull' : 'Restrict' }]
    : null;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Adds a foreign key on <span className="font-medium">{from || 'the source'}</span> pointing at{' '}
        <span className="font-medium">{to || 'the target'}</span>'s primary key, plus the relation
        fields on both sides.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="nr-from">From (owns the FK)</Label>
          <Select id="nr-from" value={from} options={modelOptions} onValueChange={setFrom} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nr-to">To (referenced)</Label>
          <Select id="nr-to" value={to} options={modelOptions} onValueChange={setTo} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="nr-fk">Foreign key field name</Label>
        <Input id="nr-fk" value={fkName} onChange={(e) => setFkName(e.target.value)} placeholder="e.g. ownerId" />
      </div>
      <label className="flex items-center gap-1.5 text-sm">
        <input type="checkbox" checked={optional} onChange={(e) => setOptional(e.target.checked)} />
        Optional (nullable). Required relations need existing rows to be empty.
      </label>
      <ApplyFlow ops={ops} defaultMigrationName={`add_rel_${from}_${to}`.toLowerCase()} disabled={!valid} onApplied={onApplied} />
    </div>
  );
}
