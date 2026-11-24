import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export interface ErdField {
  name: string;
  type: string;
  isId: boolean;
  isRequired: boolean;
  isUnique: boolean;
  isList: boolean;
  kind: string; // 'scalar' | 'object' | 'enum'
  relationName?: string;
}

export interface ErdModel {
  name: string;
  dbName: string | null;
  fields: ErdField[];
}

export interface ErdRelation {
  from: string;
  to: string;
  name: string;
  fromField: string;
  // The foreign-key scalar field(s) on `from` (e.g. "companyId").
  fromKey: string | null;
  // The referenced field(s) on `to` (e.g. "id").
  toKey: string | null;
  // cardinality of the "to" side as seen from "from"
  type: 'one' | 'many';
}

export interface ErdResponse {
  models: ErdModel[];
  relations: ErdRelation[];
}

@Injectable()
export class SchemaService {
  /**
   * Derives the ERD directly from the live Prisma datamodel (DMMF), so it
   * always reflects the schema the running server was generated against.
   */
  getErd(): ErdResponse {
    const dm = Prisma.dmmf.datamodel;

    const models: ErdModel[] = dm.models.map((model) => ({
      name: model.name,
      dbName: model.dbName ?? null,
      fields: model.fields.map((f) => ({
        name: f.name,
        type: f.type,
        isId: f.isId,
        isRequired: f.isRequired,
        isUnique: f.isUnique,
        isList: f.isList,
        kind: f.kind,
        relationName: f.relationName,
      })),
    }));

    // Build a de-duplicated relation list. Each relation appears on both
    // models in DMMF; we emit one edge per owning (foreign-key) side.
    const relations: ErdRelation[] = [];
    const seen = new Set<string>();

    for (const model of dm.models) {
      for (const field of model.fields) {
        if (field.kind !== 'object' || !field.relationName) continue;

        // The owning side is the one that carries the foreign key(s).
        const isOwningSide = (field.relationFromFields?.length ?? 0) > 0;
        if (!isOwningSide) continue;

        const key = `${model.name}:${field.relationName}`;
        if (seen.has(key)) continue;
        seen.add(key);

        relations.push({
          from: model.name,
          to: field.type,
          name: field.relationName,
          fromField: field.name,
          fromKey: field.relationFromFields?.[0] ?? null,
          toKey: field.relationToFields?.[0] ?? null,
          type: field.isList ? 'many' : 'one',
        });
      }
    }

    return { models, relations };
  }
}
