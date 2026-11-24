import type { Edge, Node } from '@xyflow/react';
import type { ErdModel, ErdResponse } from '@/types';

export interface EntityNodeData extends Record<string, unknown> {
  model: ErdModel;
  // Field names on this model that are foreign keys (source handles).
  fkFields: Set<string>;
  // Field names on this model that are referenced by a FK elsewhere (target handles).
  referencedFields: Set<string>;
}

export type EntityNode = Node<EntityNodeData, 'entity'>;

// Approximate node dimensions used for the initial auto-layout so entities
// don't overlap before the user rearranges them.
const NODE_WIDTH = 260;
const H_GAP = 140;
const V_GAP = 80;
const HEADER_HEIGHT = 44;
const ROW_HEIGHT = 28;

function estimateNodeHeight(model: ErdModel): number {
  const scalarCount = model.fields.filter((f) => f.kind !== 'object').length;
  return HEADER_HEIGHT + scalarCount * ROW_HEIGHT + 16;
}

/**
 * Lays models out in a balanced grid and wires each relationship edge to the
 * specific foreign-key field on the source and the referenced (PK) field on
 * the target, so it's clear which column points at which.
 */
export function buildGraph(erd: ErdResponse): { nodes: EntityNode[]; edges: Edge[] } {
  // Collect, per model, which fields are FKs and which are referenced targets.
  const fkByModel = new Map<string, Set<string>>();
  const referencedByModel = new Map<string, Set<string>>();
  for (const m of erd.models) {
    fkByModel.set(m.name, new Set());
    referencedByModel.set(m.name, new Set());
  }
  for (const rel of erd.relations) {
    if (rel.fromKey) fkByModel.get(rel.from)?.add(rel.fromKey);
    if (rel.toKey) referencedByModel.get(rel.to)?.add(rel.toKey);
  }

  const columns = Math.max(1, Math.ceil(Math.sqrt(erd.models.length)));
  const columnHeights = new Array(columns).fill(0);

  const nodes: EntityNode[] = erd.models.map((model, i) => {
    const col = i % columns;
    const x = col * (NODE_WIDTH + H_GAP);
    const y = columnHeights[col];
    columnHeights[col] += estimateNodeHeight(model) + V_GAP;

    return {
      id: model.name,
      type: 'entity',
      position: { x, y },
      data: {
        model,
        fkFields: fkByModel.get(model.name) ?? new Set(),
        referencedFields: referencedByModel.get(model.name) ?? new Set(),
      },
    };
  });

  const edges: Edge[] = erd.relations.map((rel, i) => ({
    id: `${rel.from}-${rel.to}-${rel.name}-${i}`,
    source: rel.from,
    target: rel.to,
    // Anchor the edge to the exact FK field and the referenced PK field.
    sourceHandle: rel.fromKey ?? undefined,
    targetHandle: rel.toKey ?? undefined,
    label: rel.fromKey && rel.toKey ? `${rel.fromKey} → ${rel.toKey}` : rel.fromField,
    type: 'smoothstep',
    markerEnd: { type: 'arrowclosed' as const },
    labelBgPadding: [4, 2] as [number, number],
    labelBgBorderRadius: 4,
    labelStyle: { fontSize: 10 },
    style: { strokeWidth: 1.5 },
    // Stash the relation so edge clicks can open the inspector.
    data: { relation: rel },
  }));

  return { nodes, edges };
}
