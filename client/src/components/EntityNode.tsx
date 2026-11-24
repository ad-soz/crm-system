import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { KeyRound, Link2 } from 'lucide-react';
import type { EntityNode as EntityNodeType } from '@/lib/erd-graph';
import { Card } from '@/components/ui/card';

function EntityNodeComponent({ data }: NodeProps<EntityNodeType>) {
  const { model, fkFields, referencedFields } = data;
  const scalarFields = model.fields.filter((f) => f.kind !== 'object');

  return (
    <Card flat className="w-[260px] overflow-hidden shadow-md">
      <div className="border-b bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">
        {model.name}
        {model.dbName && (
          <span className="ml-1 text-xs font-normal opacity-70">({model.dbName})</span>
        )}
      </div>

      <ul className="divide-y text-xs">
        {scalarFields.map((f) => {
          const isFk = fkFields.has(f.name);
          const isReferenced = referencedFields.has(f.name);
          return (
            <li
              key={f.name}
              className="relative flex items-center justify-between gap-2 px-3 py-1.5"
            >
              {/* Target handle on referenced (PK) fields: edges terminate here. */}
              {isReferenced && (
                <Handle
                  id={f.name}
                  type="target"
                  position={Position.Left}
                  className="!h-2 !w-2 !border-2 !border-primary !bg-background"
                  style={{ left: -5 }}
                />
              )}

              <span className="flex items-center gap-1.5">
                {f.isId && <KeyRound className="h-3 w-3 shrink-0 text-warning" />}
                {isFk && <Link2 className="h-3 w-3 shrink-0 text-info" />}
                <span className="font-medium">{f.name}</span>
              </span>
              <span className="text-muted-foreground">
                {f.type}
                {f.isList ? '[]' : ''}
                {!f.isRequired && !f.isId ? '?' : ''}
              </span>

              {/* Source handle on FK fields: edges originate here. */}
              {isFk && (
                <Handle
                  id={f.name}
                  type="source"
                  position={Position.Right}
                  className="!h-2 !w-2 !border-2 !border-info !bg-background"
                  style={{ right: -5 }}
                />
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export const EntityNode = memo(EntityNodeComponent);
