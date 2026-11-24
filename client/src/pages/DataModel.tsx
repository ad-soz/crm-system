import { useCallback, useMemo, useState } from 'react';
import { KeyRound, Link2, Plus, Lock } from 'lucide-react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type NodeTypes,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useErd, useSchemaCapabilities } from '@/hooks/queries';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { buildGraph } from '@/lib/erd-graph';
import { EntityNode } from '@/components/EntityNode';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Drawer } from '@/components/ui/drawer';
import { LoadingState, ErrorState, PageHeader } from '@/components/states';
import { EntityInspector } from '@/components/schema/EntityInspector';
import { RelationInspector } from '@/components/schema/RelationInspector';
import { CreatePanel } from '@/components/schema/CreatePanel';
import type { ErdModel, ErdRelation, ErdResponse } from '@/types';
import { useQueryClient } from '@tanstack/react-query';

const nodeTypes: NodeTypes = { entity: EntityNode };

type Selection =
  | { type: 'entity'; model: ErdModel }
  | { type: 'relation'; relation: ErdRelation }
  | { type: 'create' }
  | null;

function ErdGraph({
  erd,
  onSelectEntity,
  onSelectRelation,
}: {
  erd: ErdResponse;
  onSelectEntity: (name: string) => void;
  onSelectRelation: (rel: ErdRelation) => void;
}) {
  const { isDark } = useTheme();
  const initial = useMemo(() => buildGraph(erd), [erd]);
  const [nodes, , onNodesChange] = useNodesState(initial.nodes);
  const [edges, , onEdgesChange] = useEdgesState(initial.edges);

  const onNodeClick = useCallback((_: unknown, node: Node) => onSelectEntity(node.id), [onSelectEntity]);
  const onEdgeClick = useCallback(
    (_: unknown, edge: Edge) => {
      const rel = (edge.data as { relation?: ErdRelation } | undefined)?.relation;
      if (rel) onSelectRelation(rel);
    },
    [onSelectRelation],
  );

  return (
    <Card className="h-[72vh] w-full overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        colorMode={isDark ? 'dark' : 'light'}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        nodesConnectable={false}
        elementsSelectable
      >
        <Background gap={16} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable nodeColor="hsl(var(--primary))" />
      </ReactFlow>
    </Card>
  );
}

export default function DataModel() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data, isLoading, isError } = useErd();
  const { data: caps } = useSchemaCapabilities();
  const [tab, setTab] = useState('diagram');
  const [selection, setSelection] = useState<Selection>(null);

  const canEdit = !!user?.permissions?.includes('datamodel.edit') && caps?.editingEnabled === true;

  const closeDrawer = () => setSelection(null);
  const refetchErd = () => qc.invalidateQueries({ queryKey: ['erd'] });

  if (isLoading) return <LoadingState />;
  if (isError || !data) return <ErrorState message="Failed to load the data model" />;

  const selectedModel =
    selection?.type === 'entity' ? data.models.find((m) => m.name === selection.model.name) : undefined;

  return (
    <div>
      <PageHeader
        title="Data Model"
        description="Entity relationship diagram derived from the live database schema"
        action={
          <div className="flex items-center gap-2">
            {canEdit ? (
              <Badge variant="success">Editing enabled</Badge>
            ) : (
              <Badge variant="secondary" className="gap-1">
                <Lock className="h-3 w-3" /> Read-only
              </Badge>
            )}
            {canEdit && (
              <Button size="sm" onClick={() => setSelection({ type: 'create' })}>
                <Plus className="h-4 w-4" /> New
              </Button>
            )}
          </div>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="diagram">Diagram</TabsTrigger>
          <TabsTrigger value="tables">Field Details</TabsTrigger>
        </TabsList>

        <TabsContent value="diagram">
          <ErdGraph
            erd={data}
            onSelectEntity={(name) => {
              const m = data.models.find((x) => x.name === name);
              if (m) setSelection({ type: 'entity', model: m });
            }}
            onSelectRelation={(rel) => setSelection({ type: 'relation', relation: rel })}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Drag entities to rearrange · click an entity or relationship to inspect
            {canEdit ? ' and edit' : ''} it · scroll to zoom, drag the background to pan.
          </p>
        </TabsContent>

        <TabsContent value="tables">
          <div className="grid gap-6 lg:grid-cols-2">
            {data.models.map((model) => (
              <Card key={model.name}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      {model.name}
                      {model.dbName && (
                        <span className="text-xs font-normal text-muted-foreground">({model.dbName})</span>
                      )}
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => setSelection({ type: 'entity', model })}>
                      Inspect
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table flat>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Field</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Attributes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {model.fields.map((f) => (
                        <TableRow key={f.name}>
                          <TableCell className="font-medium">
                            <span className="flex items-center gap-1.5">
                              {f.isId && <KeyRound className="h-3 w-3 text-warning" />}
                              {f.kind === 'object' && <Link2 className="h-3 w-3 text-info" />}
                              {f.name}
                            </span>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {f.type}
                            {f.isList ? '[]' : ''}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {f.isId && <Badge variant="warning">PK</Badge>}
                              {f.isUnique && !f.isId && <Badge variant="info">unique</Badge>}
                              {f.kind === 'object' && <Badge variant="secondary">relation</Badge>}
                              {f.kind !== 'object' && (
                                <Badge variant={f.isRequired ? 'default' : 'outline'}>
                                  {f.isRequired ? 'required' : 'optional'}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <Drawer
        open={selection !== null}
        onOpenChange={(o) => !o && closeDrawer()}
        title={
          selection?.type === 'entity'
            ? selection.model.name
            : selection?.type === 'relation'
              ? 'Relationship'
              : selection?.type === 'create'
                ? 'Create'
                : ''
        }
        description={
          selection?.type === 'entity'
            ? 'Inspect and edit this entity'
            : selection?.type === 'relation'
              ? `${selection.relation.from} → ${selection.relation.to}`
              : selection?.type === 'create'
                ? 'Add a new entity or relation'
                : undefined
        }
      >
        {selection?.type === 'entity' && selectedModel && (
          <EntityInspector model={selectedModel} erd={data} canEdit={!!canEdit} onApplied={refetchErd} />
        )}
        {selection?.type === 'relation' && (
          <RelationInspector relation={selection.relation} canEdit={!!canEdit} onApplied={refetchErd} />
        )}
        {selection?.type === 'create' && <CreatePanel erd={data} onApplied={refetchErd} />}
      </Drawer>
    </div>
  );
}
