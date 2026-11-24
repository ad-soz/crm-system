// Operation payloads for schema editing. Each operation is validated and
// applied to the structured schema model, which is then re-serialized.

export type ScalarType = 'String' | 'Int' | 'Float' | 'Boolean' | 'DateTime';
export const SCALAR_TYPES: ScalarType[] = ['String', 'Int', 'Float', 'Boolean', 'DateTime'];

export interface AddFieldOp {
  kind: 'addField';
  model: string;
  field: {
    name: string;
    type: ScalarType;
    required: boolean;
    unique: boolean;
    defaultValue?: string | number | boolean | null;
  };
}

export interface UpdateFieldOp {
  kind: 'updateField';
  model: string;
  field: string;
  changes: {
    name?: string;
    type?: ScalarType;
    required?: boolean;
    unique?: boolean;
  };
}

export interface DropFieldOp {
  kind: 'dropField';
  model: string;
  field: string;
}

export interface AddEntityOp {
  kind: 'addEntity';
  name: string;
  // Extra scalar fields beyond the auto-added id/createdAt/updatedAt.
  fields?: AddFieldOp['field'][];
}

export interface DropEntityOp {
  kind: 'dropEntity';
  name: string;
}

export interface AddRelationOp {
  kind: 'addRelation';
  // The model that will own the foreign key (the "many" side).
  from: string;
  // The referenced model (the "one" side).
  to: string;
  // Name of the FK scalar field to create on `from`, e.g. "companyId".
  fkName: string;
  // Whether the relationship is optional (FK nullable).
  optional: boolean;
  onDelete?: 'SetNull' | 'Cascade' | 'Restrict' | 'NoAction';
}

export interface DropRelationOp {
  kind: 'dropRelation';
  // The FK-owning model and the relation field name on it.
  from: string;
  relationField: string;
}

export type SchemaOp =
  | AddFieldOp
  | UpdateFieldOp
  | DropFieldOp
  | AddEntityOp
  | DropEntityOp
  | AddRelationOp
  | DropRelationOp;

export interface PreviewResult {
  sql: string;
  destructive: boolean;
  warnings: string[];
}

export interface ApplyResult {
  success: boolean;
  migrationName?: string;
  error?: string;
}
