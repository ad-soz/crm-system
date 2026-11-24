import { MField, MModel, SchemaModel } from './schema-model';
import { SchemaEditError } from './schema-errors';
import { ON_DELETE_VALUES } from './schema-validate';

const HEADER = `generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

// Note: SQLite does not support Prisma enums, so enum-like fields are stored as
// strings and validated at the application level via class-validator (@IsIn).
// This file is managed by the in-app schema editor; manual formatting may be
// rewritten on the next edit.
`;

export function serializeSchema(model: SchemaModel): string {
  const blocks = model.models.map(serializeModel);
  return `${HEADER}\n${blocks.join('\n\n')}\n`;
}

function serializeModel(m: MModel): string {
  const lines = m.fields.map((f) => `  ${serializeField(f)}`);
  if (m.dbName) {
    lines.push('');
    lines.push(`  @@map("${m.dbName}")`);
  }
  return `model ${m.name} {\n${lines.join('\n')}\n}`;
}

function serializeField(f: MField): string {
  const typeStr = `${f.type}${f.isList ? '[]' : f.isRequired ? '' : '?'}`;
  const attrs: string[] = [];

  if (f.isId) attrs.push('@id');
  if (f.isUnique && !f.isId) attrs.push('@unique');
  if (f.default) attrs.push(`@default(${f.default})`);
  if (f.isUpdatedAt) attrs.push('@updatedAt');
  if (f.dbName) attrs.push(`@map("${f.dbName}")`);

  if (f.kind === 'object') {
    const parts: string[] = [];
    if (f.relationName) parts.push(`"${f.relationName}"`);
    if (f.relationFromFields?.length) {
      parts.push(`fields: [${f.relationFromFields.join(', ')}]`);
      parts.push(`references: [${(f.relationToFields ?? ['id']).join(', ')}]`);
    }
    if (f.relationOnDelete) {
      // Written without quotes, so only exact known values are allowed.
      if (!(ON_DELETE_VALUES as readonly string[]).includes(f.relationOnDelete)) {
        throw new SchemaEditError(`Unsupported onDelete value on ${f.name}`);
      }
      parts.push(`onDelete: ${f.relationOnDelete}`);
    }
    if (parts.length) attrs.push(`@relation(${parts.join(', ')})`);
  }

  const attrStr = attrs.length ? ` ${attrs.join(' ')}` : '';
  return `${f.name} ${typeStr}${attrStr}`;
}
