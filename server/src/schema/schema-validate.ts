import { SCALAR_TYPES, SchemaOp } from './schema-ops.types';
import { SchemaEditError } from './schema-errors';

// Strict validation of schema-editor requests. Everything that reaches the
// serializer must pass through here: values end up inside schema.prisma, and
// Prisma runs any program a schema's generator block names, so a value that
// can break out of its position could run arbitrary commands.

const IDENT = /^[A-Za-z][A-Za-z0-9_]{0,62}$/;
const MODEL_IDENT = /^[A-Z][A-Za-z0-9_]{0,62}$/;
export const ON_DELETE_VALUES = ['SetNull', 'Cascade', 'Restrict', 'NoAction'] as const;
const MAX_OPS = 50;
const MAX_FIELDS = 50;
const MAX_STRING_DEFAULT = 200;

type Obj = Record<string, unknown>;

function fail(message: string): never {
  throw new SchemaEditError(message);
}

function obj(value: unknown, where: string): Obj {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${where} must be an object`);
  return value as Obj;
}

function ident(value: unknown, where: string, pattern = IDENT): string {
  if (typeof value !== 'string' || !pattern.test(value)) {
    fail(`${where} must be a name using letters, numbers, and underscores, starting with a letter`);
  }
  return value;
}

function bool(value: unknown, where: string): boolean {
  if (typeof value !== 'boolean') fail(`${where} must be true or false`);
  return value;
}

function optionalBool(value: unknown, where: string): boolean | undefined {
  return value === undefined ? undefined : bool(value, where);
}

function scalarType(value: unknown, where: string) {
  if (typeof value !== 'string' || !(SCALAR_TYPES as string[]).includes(value)) {
    fail(`${where} must be one of ${SCALAR_TYPES.join(', ')}`);
  }
  return value as (typeof SCALAR_TYPES)[number];
}

/** Check a default value matches its field type. Returns the normalized value. */
function defaultFor(value: unknown, type: string, where: string): string | number | boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  switch (type) {
    case 'String':
      if (typeof value !== 'string') fail(`${where} must be text`);
      if (value.length > MAX_STRING_DEFAULT) fail(`${where} must be ${MAX_STRING_DEFAULT} characters or fewer`);
      if (/[\u0000-\u001f\u007f]/.test(value)) fail(`${where} cannot contain line breaks or control characters`);
      return value;
    case 'Int':
      if (typeof value !== 'number' || !Number.isSafeInteger(value)) fail(`${where} must be a whole number`);
      return value;
    case 'Float':
      if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${where} must be a number`);
      return value;
    case 'Boolean':
      return bool(value, where);
    case 'DateTime':
      if (value !== 'now') fail(`${where} for a date can only be "now"`);
      return value;
    default:
      fail(`${where} has an unsupported type`);
  }
}

function newField(value: unknown, where: string) {
  const f = obj(value, where);
  const type = scalarType(f.type, `${where}.type`);
  return {
    name: ident(f.name, `${where}.name`),
    type,
    required: bool(f.required, `${where}.required`),
    unique: bool(f.unique, `${where}.unique`),
    defaultValue: defaultFor(f.defaultValue, type, `${where}.defaultValue`),
  };
}

function validateOp(value: unknown, i: number): SchemaOp {
  const where = `ops[${i}]`;
  const op = obj(value, where);
  switch (op.kind) {
    case 'addField':
      return { kind: 'addField', model: ident(op.model, `${where}.model`), field: newField(op.field, `${where}.field`) };

    case 'updateField': {
      const c = obj(op.changes, `${where}.changes`);
      const changes: Extract<SchemaOp, { kind: 'updateField' }>['changes'] = {};
      if (c.name !== undefined) changes.name = ident(c.name, `${where}.changes.name`);
      if (c.type !== undefined) changes.type = scalarType(c.type, `${where}.changes.type`);
      changes.required = optionalBool(c.required, `${where}.changes.required`);
      changes.unique = optionalBool(c.unique, `${where}.changes.unique`);
      return { kind: 'updateField', model: ident(op.model, `${where}.model`), field: ident(op.field, `${where}.field`), changes };
    }

    case 'dropField':
      return { kind: 'dropField', model: ident(op.model, `${where}.model`), field: ident(op.field, `${where}.field`) };

    case 'addEntity': {
      let fields: ReturnType<typeof newField>[] | undefined;
      if (op.fields !== undefined) {
        if (!Array.isArray(op.fields) || op.fields.length > MAX_FIELDS) fail(`${where}.fields must be a list of at most ${MAX_FIELDS}`);
        fields = op.fields.map((f, j) => newField(f, `${where}.fields[${j}]`));
      }
      return { kind: 'addEntity', name: ident(op.name, `${where}.name`, MODEL_IDENT), fields };
    }

    case 'dropEntity':
      return { kind: 'dropEntity', name: ident(op.name, `${where}.name`) };

    case 'addRelation': {
      let onDelete: (typeof ON_DELETE_VALUES)[number] | undefined;
      if (op.onDelete !== undefined) {
        if (typeof op.onDelete !== 'string' || !(ON_DELETE_VALUES as readonly string[]).includes(op.onDelete)) {
          fail(`${where}.onDelete must be one of ${ON_DELETE_VALUES.join(', ')}`);
        }
        onDelete = op.onDelete as (typeof ON_DELETE_VALUES)[number];
      }
      return {
        kind: 'addRelation',
        from: ident(op.from, `${where}.from`),
        to: ident(op.to, `${where}.to`),
        fkName: ident(op.fkName, `${where}.fkName`),
        optional: bool(op.optional, `${where}.optional`),
        onDelete,
      };
    }

    case 'dropRelation':
      return { kind: 'dropRelation', from: ident(op.from, `${where}.from`), relationField: ident(op.relationField, `${where}.relationField`) };

    default:
      fail(`${where}.kind is not a supported operation`);
  }
}

/**
 * Validate an untrusted list of operations and rebuild it from scratch, so
 * only known keys with checked values continue. Unknown keys are dropped.
 */
export function validateOps(raw: unknown): SchemaOp[] {
  if (!Array.isArray(raw) || raw.length === 0) fail('ops must be a non-empty list');
  if (raw.length > MAX_OPS) fail(`At most ${MAX_OPS} operations can be applied at once`);
  return raw.map((op, i) => validateOp(op, i));
}

/**
 * Last line of defence before schema.prisma is written: the text must contain
 * exactly the fixed generator and datasource blocks plus the expected models.
 * Anything else means a value escaped its position, so refuse to write it.
 */
export function assertSafeSchema(text: string, expectedModels: string[]): void {
  const blocks = [...text.matchAll(/^\s*(\w+)\s+(\w+)\s*\{/gm)].map((m) => ({ kind: m[1], name: m[2] }));
  const generators = blocks.filter((b) => b.kind === 'generator');
  const datasources = blocks.filter((b) => b.kind === 'datasource');
  const models = blocks.filter((b) => b.kind === 'model').map((b) => b.name).sort();
  const other = blocks.filter((b) => !['generator', 'datasource', 'model'].includes(b.kind));
  const providers = text.match(/^\s*provider\s*=/gm) ?? [];

  const ok =
    generators.length === 1 &&
    generators[0].name === 'client' &&
    datasources.length === 1 &&
    other.length === 0 &&
    providers.length === 2 &&
    /^\s*provider\s*=\s*"prisma-client-js"\s*$/m.test(text) &&
    JSON.stringify(models) === JSON.stringify([...expectedModels].sort());

  if (!ok) fail('The generated schema failed a safety check and was not written');
}
