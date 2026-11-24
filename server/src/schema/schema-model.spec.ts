import { buildModelFromDmmf, applyOps, SchemaEditError } from './schema-model';
import { serializeSchema } from './schema-serializer';
import { assertSafeSchema } from './schema-validate';

describe('schema model operations', () => {
  it('builds an editable model from DMMF with every entity', () => {
    const model = buildModelFromDmmf();
    expect(model.models.map((m) => m.name).sort()).toEqual([
      'AppSetting',
      'AuditActor',
      'AuditLog',
      'Company',
      'CompanyIndustry',
      'Contact',
      'ContactType',
      'Deal',
      'DealStage',
      'DealStageChange',
      'Industry',
      'Person',
      'ReferenceFieldSetting',
      'RoleProfile',
      'Task',
      'TaskPriority',
      'TaskStatus',
      'User',
    ]);
  });

  describe('addField', () => {
    it('adds a scalar field', () => {
      const model = buildModelFromDmmf();
      const next = applyOps(model, [
        {
          kind: 'addField',
          model: 'Company',
          field: { name: 'taxId', type: 'String', required: false, unique: true },
        },
      ]);
      const company = next.models.find((m) => m.name === 'Company')!;
      const field = company.fields.find((f) => f.name === 'taxId')!;
      expect(field.type).toBe('String');
      expect(field.isUnique).toBe(true);
      expect(field.isRequired).toBe(false);
    });

    it('rejects a required field without a default', () => {
      const model = buildModelFromDmmf();
      expect(() =>
        applyOps(model, [
          {
            kind: 'addField',
            model: 'Company',
            field: { name: 'mandatory', type: 'String', required: true, unique: false },
          },
        ]),
      ).toThrow(SchemaEditError);
    });

    it('rejects a duplicate field name', () => {
      const model = buildModelFromDmmf();
      expect(() =>
        applyOps(model, [
          {
            kind: 'addField',
            model: 'Company',
            field: { name: 'name', type: 'String', required: false, unique: false },
          },
        ]),
      ).toThrow(/already exists/);
    });
  });

  describe('updateField', () => {
    it('renames a field', () => {
      const model = buildModelFromDmmf();
      const next = applyOps(model, [
        { kind: 'updateField', model: 'Company', field: 'website', changes: { name: 'url' } },
      ]);
      const company = next.models.find((m) => m.name === 'Company')!;
      expect(company.fields.some((f) => f.name === 'url')).toBe(true);
      expect(company.fields.some((f) => f.name === 'website')).toBe(false);
    });

    it('refuses to edit the primary key', () => {
      const model = buildModelFromDmmf();
      expect(() =>
        applyOps(model, [
          { kind: 'updateField', model: 'Company', field: 'id', changes: { type: 'Int' } },
        ]),
      ).toThrow(/primary key/);
    });
  });

  describe('dropField', () => {
    it('drops a plain scalar field', () => {
      const model = buildModelFromDmmf();
      const next = applyOps(model, [{ kind: 'dropField', model: 'Company', field: 'phone' }]);
      const company = next.models.find((m) => m.name === 'Company')!;
      expect(company.fields.some((f) => f.name === 'phone')).toBe(false);
    });

    it('refuses to drop a FK-backing scalar', () => {
      const model = buildModelFromDmmf();
      expect(() =>
        applyOps(model, [{ kind: 'dropField', model: 'Person', field: 'companyId' }]),
      ).toThrow(/relation/);
    });
  });

  describe('entities', () => {
    it('adds an entity with id/createdAt/updatedAt scaffolding', () => {
      const model = buildModelFromDmmf();
      const next = applyOps(model, [
        {
          kind: 'addEntity',
          name: 'Note',
          fields: [{ name: 'body', type: 'String', required: false, unique: false }],
        },
      ]);
      const note = next.models.find((m) => m.name === 'Note')!;
      expect(note).toBeDefined();
      expect(note.fields.find((f) => f.name === 'id')?.isId).toBe(true);
      expect(note.fields.some((f) => f.name === 'createdAt')).toBe(true);
      expect(note.fields.some((f) => f.name === 'updatedAt')).toBe(true);
      expect(note.fields.some((f) => f.name === 'body')).toBe(true);
    });

    it('refuses to drop an entity referenced by others', () => {
      const model = buildModelFromDmmf();
      expect(() => applyOps(model, [{ kind: 'dropEntity', name: 'Company' }])).toThrow(
        /referenced by/,
      );
    });

    it('drops an unreferenced entity', () => {
      const model = buildModelFromDmmf();
      // Add a standalone entity (nothing references it), then drop it.
      const next = applyOps(model, [
        { kind: 'addEntity', name: 'Standalone' },
        { kind: 'dropEntity', name: 'Standalone' },
      ]);
      expect(next.models.some((m) => m.name === 'Standalone')).toBe(false);
    });
  });

  describe('relations', () => {
    it('adds a relation with FK, object field, and back-relation', () => {
      const model = buildModelFromDmmf();
      const next = applyOps(model, [
        {
          kind: 'addRelation',
          from: 'Company',
          to: 'User',
          fkName: 'accountManagerId',
          optional: true,
        },
      ]);
      const company = next.models.find((m) => m.name === 'Company')!;
      expect(company.fields.some((f) => f.name === 'accountManagerId' && f.kind === 'scalar')).toBe(true);
      expect(
        company.fields.some((f) => f.kind === 'object' && f.relationFromFields?.includes('accountManagerId')),
      ).toBe(true);
      // Back-relation list added on User.
      const user = next.models.find((m) => m.name === 'User')!;
      expect(user.fields.some((f) => f.type === 'Company' && f.isList)).toBe(true);
    });

    it('drops a relation and its backing FK', () => {
      const model = buildModelFromDmmf();
      const next = applyOps(model, [
        { kind: 'dropRelation', from: 'Person', relationField: 'company' },
      ]);
      const person = next.models.find((m) => m.name === 'Person')!;
      expect(person.fields.some((f) => f.name === 'company')).toBe(false);
      expect(person.fields.some((f) => f.name === 'companyId')).toBe(false);
    });
  });
});

describe('schema serializer', () => {
  it('produces a valid-looking schema with header and all models', () => {
    const model = buildModelFromDmmf();
    const text = serializeSchema(model);
    expect(text).toContain('generator client');
    expect(text).toContain('datasource db');
    for (const name of ['User', 'Company', 'Person', 'Deal', 'Contact', 'Task']) {
      expect(text).toContain(`model ${name} {`);
    }
    // id with uuid default preserved
    expect(text).toMatch(/id\s+String\s+@id\s+@default\(uuid\(\)\)/);
    // optional field keeps the ? marker
    expect(text).toMatch(/website\s+String\?/);
    // relation attribute present (relation name may precede the fields arg)
    expect(text).toMatch(/@relation\([^)]*fields: \[companyId\], references: \[id\]/);
  });

  it('serializes an added field after an operation', () => {
    const model = buildModelFromDmmf();
    const next = applyOps(model, [
      {
        kind: 'addField',
        model: 'Company',
        field: { name: 'rating', type: 'Int', required: false, unique: false },
      },
    ]);
    expect(serializeSchema(next)).toMatch(/rating\s+Int\?/);
  });
});

describe('schema editor input safety', () => {
  const generatorBlocks = (text: string) => (text.match(/^generator\s+\w+\s*\{/gm) ?? []).length;
  const addField = (field: Record<string, unknown>) => [
    { kind: 'addField', model: 'Company', field: { name: 'probe', type: 'String', required: false, unique: false, ...field } },
  ];

  it('rejects an onDelete value that is not on the allowlist', () => {
    expect(() =>
      applyOps(buildModelFromDmmf(), [
        {
          kind: 'addRelation',
          from: 'Company',
          to: 'User',
          fkName: 'probeId',
          optional: true,
          onDelete: 'SetNull)\n}\ngenerator pwn {\n  provider = "calc.exe"\n}\nmodel Z {\n  id String @id @default(uuid()',
        },
      ]),
    ).toThrow(/onDelete must be one of/);
  });

  it('rejects line breaks in a text default', () => {
    expect(() => applyOps(buildModelFromDmmf(), addField({ defaultValue: 'a\n}\ngenerator pwn {' }))).toThrow(
      /line breaks/,
    );
  });

  it('escapes quotes and backslashes so a text default cannot close its string', () => {
    const next = applyOps(buildModelFromDmmf(), addField({ defaultValue: 'x\\") @map("y' }));
    const text = serializeSchema(next);
    expect(text).toContain('probe String? @default("x\\\\\\") @map(\\"y")');
    expect(generatorBlocks(text)).toBe(1);
  });

  it('requires number and boolean defaults to have the right type', () => {
    expect(() =>
      applyOps(buildModelFromDmmf(), addField({ type: 'Int', defaultValue: '1)\n}\ngenerator pwn {' })),
    ).toThrow(/whole number/);
    expect(() => applyOps(buildModelFromDmmf(), addField({ type: 'Float', defaultValue: 'NaN' }))).toThrow(/number/);
    expect(() => applyOps(buildModelFromDmmf(), addField({ type: 'Boolean', defaultValue: 'true' }))).toThrow(
      /true or false/,
    );
    expect(() => applyOps(buildModelFromDmmf(), addField({ type: 'DateTime', defaultValue: '2020' }))).toThrow(/now/);
  });

  it('rejects names that are not plain identifiers', () => {
    expect(() =>
      applyOps(buildModelFromDmmf(), [{ kind: 'dropRelation', from: 'Person', relationField: 'company)\n' }]),
    ).toThrow(/must be a name/);
    expect(() => applyOps(buildModelFromDmmf(), [{ kind: 'addEntity', name: 'lowercase' }])).toThrow(/must be a name/);
    expect(() => applyOps(buildModelFromDmmf(), [{ kind: 'dropEntity', name: 'User {' }])).toThrow(/must be a name/);
  });

  it('rejects unknown operations, empty input, and oversized batches', () => {
    expect(() => applyOps(buildModelFromDmmf(), [{ kind: 'runCommand' }])).toThrow(/not a supported operation/);
    expect(() => applyOps(buildModelFromDmmf(), [])).toThrow(/non-empty/);
    expect(() => applyOps(buildModelFromDmmf(), 'not a list')).toThrow(/non-empty/);
    const many = Array.from({ length: 51 }, () => ({ kind: 'dropField', model: 'Company', field: 'phone' }));
    expect(() => applyOps(buildModelFromDmmf(), many)).toThrow(/At most 50/);
  });
});

describe('assertSafeSchema', () => {
  it('accepts the normal schema', () => {
    const model = buildModelFromDmmf();
    expect(() => assertSafeSchema(serializeSchema(model), model.models.map((m) => m.name))).not.toThrow();
  });

  it('rejects an extra generator block', () => {
    const model = buildModelFromDmmf();
    const text = `${serializeSchema(model)}\ngenerator pwn {\n  provider = "calc.exe"\n}\n`;
    expect(() => assertSafeSchema(text, model.models.map((m) => m.name))).toThrow(/safety check/);
  });

  it('rejects an unexpected model', () => {
    const model = buildModelFromDmmf();
    const text = `${serializeSchema(model)}\nmodel Sneaky {\n  id String @id\n}\n`;
    expect(() => assertSafeSchema(text, model.models.map((m) => m.name))).toThrow(/safety check/);
  });
});
