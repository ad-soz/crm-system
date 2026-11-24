import { Prisma } from '@prisma/client';
import {
  SchemaOp,
  AddFieldOp,
  UpdateFieldOp,
  DropFieldOp,
  AddEntityOp,
  DropEntityOp,
  AddRelationOp,
  DropRelationOp,
  SCALAR_TYPES,
} from './schema-ops.types';
import { SchemaEditError } from './schema-errors';
import { validateOps } from './schema-validate';

// ---- Structured, editable representation of the datamodel ----

export interface MField {
  name: string;
  type: string;
  isId: boolean;
  isRequired: boolean;
  isUnique: boolean;
  isList: boolean;
  kind: 'scalar' | 'object' | 'enum';
  default?: string; // raw default expression, e.g. uuid(), now(), "LEAD"
  dbName?: string; // @map target
  // relation metadata (object fields only)
  relationName?: string;
  relationFromFields?: string[];
  relationToFields?: string[];
  relationOnDelete?: string;
  isUpdatedAt?: boolean;
}

export interface MModel {
  name: string;
  dbName?: string;
  fields: MField[];
}

export interface SchemaModel {
  models: MModel[];
}

export { SchemaEditError };

const RESERVED = new Set(['id', 'createdAt', 'updatedAt']);
const IDENT = /^[A-Za-z][A-Za-z0-9_]*$/;

/** Build the editable model from the live Prisma DMMF. */
export function buildModelFromDmmf(): SchemaModel {
  const dm = Prisma.dmmf.datamodel;
  return {
    models: dm.models.map((m) => ({
      name: m.name,
      dbName: m.dbName ?? undefined,
      fields: m.fields.map((f) => ({
        name: f.name,
        type: f.type,
        isId: f.isId,
        isRequired: f.isRequired,
        isUnique: f.isUnique,
        isList: f.isList,
        kind: f.kind as MField['kind'],
        default: serializeDefault(f.default, f.type),
        dbName: f.dbName ?? undefined,
        relationName: f.relationName,
        relationFromFields: f.relationFromFields ? [...f.relationFromFields] : undefined,
        relationToFields: f.relationToFields ? [...f.relationToFields] : undefined,
        relationOnDelete: (f as any).relationOnDelete,
        isUpdatedAt: (f as any).isUpdatedAt === true,
      } as MField)),
    })),
  };
}

// Maps DMMF function-default names (which may include a version like "uuid(4)")
// to the schema expression Prisma expects.
const FUNCTION_DEFAULTS: Record<string, string> = {
  uuid: 'uuid()',
  cuid: 'cuid()',
  now: 'now()',
  autoincrement: 'autoincrement()',
};

function serializeDefault(def: unknown, type: string): string | undefined {
  if (def === undefined || def === null) return undefined;
  if (typeof def === 'object' && def !== null && 'name' in (def as any)) {
    const rawName = String((def as any).name);
    // Strip any version/args suffix, e.g. "uuid(4)" -> "uuid".
    const base = rawName.replace(/\(.*\)$/, '');
    return FUNCTION_DEFAULTS[base] ?? `${base}()`;
  }
  if (typeof def === 'string') return type === 'String' ? `"${def}"` : def;
  if (typeof def === 'boolean' || typeof def === 'number') return String(def);
  return undefined;
}

// ---- Apply operations ----

export function applyOps(model: SchemaModel, rawOps: unknown): SchemaModel {
  // Untrusted input: validate and rebuild every operation before using it.
  const ops = validateOps(rawOps);
  // Deep clone so the original (DMMF-derived) model is untouched.
  const next: SchemaModel = JSON.parse(JSON.stringify(model));
  for (const op of ops) {
    switch (op.kind) {
      case 'addField':
        applyAddField(next, op);
        break;
      case 'updateField':
        applyUpdateField(next, op);
        break;
      case 'dropField':
        applyDropField(next, op);
        break;
      case 'addEntity':
        applyAddEntity(next, op);
        break;
      case 'dropEntity':
        applyDropEntity(next, op);
        break;
      case 'addRelation':
        applyAddRelation(next, op);
        break;
      case 'dropRelation':
        applyDropRelation(next, op);
        break;
      default:
        throw new SchemaEditError(`Unknown operation: ${(op as any).kind}`);
    }
  }
  return next;
}

function findModel(model: SchemaModel, name: string): MModel {
  const m = model.models.find((x) => x.name === name);
  if (!m) throw new SchemaEditError(`Model "${name}" not found`);
  return m;
}

function assertIdent(name: string, what: string) {
  if (!IDENT.test(name)) {
    throw new SchemaEditError(`Invalid ${what} "${name}": must match ${IDENT}`);
  }
}

function applyAddField(model: SchemaModel, op: AddFieldOp) {
  const m = findModel(model, op.model);
  assertIdent(op.field.name, 'field name');
  if (RESERVED.has(op.field.name)) {
    throw new SchemaEditError(`"${op.field.name}" is a reserved field name`);
  }
  if (m.fields.some((f) => f.name === op.field.name)) {
    throw new SchemaEditError(`Field "${op.field.name}" already exists on ${op.model}`);
  }
  if (!SCALAR_TYPES.includes(op.field.type)) {
    throw new SchemaEditError(`Invalid type "${op.field.type}"`);
  }
  if (op.field.required && op.field.defaultValue == null) {
    // Adding a required column with no default to a table that may hold rows
    // will fail migration; require a default for safety.
    throw new SchemaEditError(
      `A required field needs a default value (existing rows have no value otherwise)`,
    );
  }
  m.fields.push({
    name: op.field.name,
    type: op.field.type,
    isId: false,
    isRequired: op.field.required,
    isUnique: op.field.unique,
    isList: false,
    kind: 'scalar',
    default: formatDefault(op.field.defaultValue, op.field.type),
  });
}

function applyUpdateField(model: SchemaModel, op: UpdateFieldOp) {
  const m = findModel(model, op.model);
  const f = m.fields.find((x) => x.name === op.field);
  if (!f) throw new SchemaEditError(`Field "${op.field}" not found on ${op.model}`);
  if (f.isId) throw new SchemaEditError(`The primary key field cannot be edited`);
  if (f.kind === 'object') throw new SchemaEditError(`Use relation operations to edit relations`);
  if (RESERVED.has(f.name) && op.changes.name && op.changes.name !== f.name) {
    throw new SchemaEditError(`"${f.name}" cannot be renamed`);
  }

  if (op.changes.name !== undefined && op.changes.name !== f.name) {
    assertIdent(op.changes.name, 'field name');
    if (m.fields.some((x) => x.name === op.changes.name)) {
      throw new SchemaEditError(`Field "${op.changes.name}" already exists on ${op.model}`);
    }
    f.name = op.changes.name;
  }
  if (op.changes.type !== undefined) {
    if (!SCALAR_TYPES.includes(op.changes.type)) {
      throw new SchemaEditError(`Invalid type "${op.changes.type}"`);
    }
    f.type = op.changes.type;
  }
  if (op.changes.required !== undefined) f.isRequired = op.changes.required;
  if (op.changes.unique !== undefined) f.isUnique = op.changes.unique;
}

function applyDropField(model: SchemaModel, op: DropFieldOp) {
  const m = findModel(model, op.model);
  const f = m.fields.find((x) => x.name === op.field);
  if (!f) throw new SchemaEditError(`Field "${op.field}" not found on ${op.model}`);
  if (f.isId) throw new SchemaEditError(`The primary key field cannot be dropped`);
  if (RESERVED.has(f.name)) throw new SchemaEditError(`"${f.name}" cannot be dropped`);
  if (f.kind === 'object') throw new SchemaEditError(`Use dropRelation to remove a relation`);
  // If this scalar is a FK used by a relation field, block it.
  const usedByRelation = m.fields.some(
    (x) => x.kind === 'object' && x.relationFromFields?.includes(f.name),
  );
  if (usedByRelation) {
    throw new SchemaEditError(`"${f.name}" backs a relation; drop the relation instead`);
  }
  m.fields = m.fields.filter((x) => x.name !== op.field);
}

function applyAddEntity(model: SchemaModel, op: AddEntityOp) {
  assertIdent(op.name, 'model name');
  if (model.models.some((m) => m.name === op.name)) {
    throw new SchemaEditError(`Model "${op.name}" already exists`);
  }
  const fields: MField[] = [
    { name: 'id', type: 'String', isId: true, isRequired: true, isUnique: false, isList: false, kind: 'scalar', default: 'uuid()' },
  ];
  for (const extra of op.fields ?? []) {
    assertIdent(extra.name, 'field name');
    if (fields.some((f) => f.name === extra.name)) {
      throw new SchemaEditError(`Duplicate field "${extra.name}"`);
    }
    if (extra.required && extra.defaultValue == null) {
      throw new SchemaEditError(`Field "${extra.name}" is required and needs a default`);
    }
    fields.push({
      name: extra.name,
      type: extra.type,
      isId: false,
      isRequired: extra.required,
      isUnique: extra.unique,
      isList: false,
      kind: 'scalar',
      default: formatDefault(extra.defaultValue, extra.type),
    });
  }
  fields.push(
    { name: 'createdAt', type: 'DateTime', isId: false, isRequired: true, isUnique: false, isList: false, kind: 'scalar', default: 'now()' },
    { name: 'updatedAt', type: 'DateTime', isId: false, isRequired: true, isUnique: false, isList: false, kind: 'scalar', isUpdatedAt: true },
  );

  model.models.push({ name: op.name, dbName: undefined, fields });
}

function applyDropEntity(model: SchemaModel, op: DropEntityOp) {
  const m = model.models.find((x) => x.name === op.name);
  if (!m) throw new SchemaEditError(`Model "${op.name}" not found`);
  // Block if other models have relations pointing to this one.
  const referencedBy: string[] = [];
  for (const other of model.models) {
    if (other.name === op.name) continue;
    for (const f of other.fields) {
      if (f.kind === 'object' && f.type === op.name) {
        referencedBy.push(other.name);
      }
    }
  }
  if (referencedBy.length) {
    throw new SchemaEditError(
      `Cannot drop "${op.name}": referenced by ${[...new Set(referencedBy)].join(', ')}. Remove those relations first.`,
    );
  }
  model.models = model.models.filter((x) => x.name !== op.name);
}

function applyAddRelation(model: SchemaModel, op: AddRelationOp) {
  const from = findModel(model, op.from);
  const to = findModel(model, op.to);
  assertIdent(op.fkName, 'foreign key name');
  if (from.fields.some((f) => f.name === op.fkName)) {
    throw new SchemaEditError(`Field "${op.fkName}" already exists on ${op.from}`);
  }
  // Referenced PK on the target.
  const toPk = to.fields.find((f) => f.isId);
  if (!toPk) throw new SchemaEditError(`Target "${op.to}" has no primary key`);

  // A readable relation field name derived from the target model.
  let relFieldName = lowerFirst(op.to);
  if (from.fields.some((f) => f.name === relFieldName)) {
    relFieldName = `${relFieldName}Rel`;
  }

  // Add FK scalar.
  from.fields.push({
    name: op.fkName,
    type: toPk.type,
    isId: false,
    isRequired: !op.optional,
    isUnique: false,
    isList: false,
    kind: 'scalar',
  });

  // Add the object relation field on the owning side.
  from.fields.push({
    name: relFieldName,
    type: op.to,
    isId: false,
    isRequired: !op.optional,
    isUnique: false,
    isList: false,
    kind: 'object',
    relationFromFields: [op.fkName],
    relationToFields: [toPk.name],
    relationOnDelete: op.onDelete ?? (op.optional ? 'SetNull' : 'Restrict'),
  });

  // Add the back-relation (list) on the target side.
  let backName = `${lowerFirst(op.from)}s`;
  if (to.fields.some((f) => f.name === backName)) backName = `${lowerFirst(op.from)}Items`;
  to.fields.push({
    name: backName,
    type: op.from,
    isId: false,
    isRequired: false,
    isUnique: false,
    isList: true,
    kind: 'object',
  });
}

function applyDropRelation(model: SchemaModel, op: DropRelationOp) {
  const from = findModel(model, op.from);
  const relField = from.fields.find((f) => f.name === op.relationField && f.kind === 'object');
  if (!relField) throw new SchemaEditError(`Relation "${op.relationField}" not found on ${op.from}`);
  if (relField.isList) throw new SchemaEditError(`Drop a relation from its owning (FK) side`);

  const targetModel = relField.type;
  const fkNames = relField.relationFromFields ?? [];
  const relationName = relField.relationName;

  // Remove the object field and its backing FK scalar(s) from the owning model.
  from.fields = from.fields.filter(
    (f) => f.name !== op.relationField && !fkNames.includes(f.name),
  );

  // Remove the matching back-relation on the target model.
  const to = model.models.find((m) => m.name === targetModel);
  if (to) {
    to.fields = to.fields.filter((f) => {
      if (f.kind !== 'object' || f.type !== from.name) return true;
      // Match by relation name when present, else by target type + list.
      if (relationName && f.relationName) return f.relationName !== relationName;
      return !f.isList;
    });
  }
}

// Values arrive already checked by validateOps; this only formats them. The
// checks are repeated defensively because the output is written into a file
// that Prisma treats as configuration.
function formatDefault(value: unknown, type: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  switch (type) {
    case 'String': {
      const text = String(value);
      if (/[\u0000-\u001f\u007f]/.test(text)) throw new SchemaEditError('Default value cannot contain line breaks');
      // Escape backslashes first, then quotes, so a value can't close the string.
      return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    }
    case 'Int':
      if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new SchemaEditError('Default must be a whole number');
      return String(value);
    case 'Float':
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new SchemaEditError('Default must be a number');
      return String(value);
    case 'Boolean':
      if (typeof value !== 'boolean') throw new SchemaEditError('Default must be true or false');
      return value ? 'true' : 'false';
    case 'DateTime':
      if (value !== 'now') throw new SchemaEditError('A date default can only be "now"');
      return 'now()';
    default:
      throw new SchemaEditError(`Unsupported type "${type}"`);
  }
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}
