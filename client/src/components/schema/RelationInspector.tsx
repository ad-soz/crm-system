import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { ErdRelation, SchemaOp } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmBlock } from './EntityInspector';
import { Card } from '@/components/ui/card';

export function RelationInspector({
  relation,
  canEdit,
  onApplied,
}: {
  relation: ErdRelation;
  canEdit: boolean;
  onApplied: () => void;
}) {
  const [dropping, setDropping] = useState(false);

  return (
    <div className="space-y-5">
      <section className="space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{relation.from}</Badge>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <Badge variant="secondary">{relation.to}</Badge>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="text-muted-foreground">Foreign key</dt>
          <dd className="font-medium">{relation.from}.{relation.fromKey}</dd>
          <dt className="text-muted-foreground">References</dt>
          <dd className="font-medium">{relation.to}.{relation.toKey}</dd>
          <dt className="text-muted-foreground">Relation field</dt>
          <dd className="font-medium">{relation.fromField}</dd>
          <dt className="text-muted-foreground">Cardinality</dt>
          <dd className="font-medium">many {relation.from} → one {relation.to}</dd>
        </dl>
      </section>

      {canEdit && (
        <Card flat className="border-destructive/30 p-3">
          <h3 className="mb-1 text-sm font-semibold text-destructive">Danger zone</h3>
          <p className="mb-2 text-xs text-muted-foreground">
            Dropping this relation removes the foreign-key column{' '}
            <span className="font-medium">{relation.fromKey}</span> from {relation.from} and its link
            to {relation.to}.
          </p>
          {!dropping ? (
            <Button size="sm" variant="destructive" onClick={() => setDropping(true)}>
              Drop relation
            </Button>
          ) : (
            <ConfirmBlock
              title={`Drop relation ${relation.from}.${relation.fromField}`}
              ops={[{ kind: 'dropRelation', from: relation.from, relationField: relation.fromField } as SchemaOp]}
              migrationName={`drop_rel_${relation.from}_${relation.fromField}`.toLowerCase()}
              onCancel={() => setDropping(false)}
              onApplied={() => { setDropping(false); onApplied(); }}
            />
          )}
        </Card>
      )}
    </div>
  );
}
