import { SchemaService } from './schema.service';

describe('SchemaService', () => {
  let service: SchemaService;

  beforeEach(() => {
    service = new SchemaService();
  });

  it('returns every model', () => {
    const erd = service.getErd();
    const names = erd.models.map((m) => m.name).sort();
    expect(names).toEqual([
      'AppSetting', 'AuditActor', 'AuditLog', 'Company', 'CompanyIndustry', 'Contact', 'ContactType', 'Deal', 'DealStage',
      'DealStageChange', 'Industry', 'Person', 'ReferenceFieldSetting', 'RoleProfile', 'Task', 'TaskPriority', 'TaskStatus', 'User',
    ]);
  });

  it('includes field metadata for a model', () => {
    const erd = service.getErd();
    const person = erd.models.find((m) => m.name === 'Person')!;
    const firstName = person.fields.find((f) => f.name === 'firstName')!;
    expect(firstName.type).toBe('String');
    expect(firstName.isRequired).toBe(true);
    const id = person.fields.find((f) => f.name === 'id')!;
    expect(id.isId).toBe(true);
  });

  it('derives relations from owning (foreign-key) sides only', () => {
    const erd = service.getErd();
    // Person owns the relation to Company (companyId FK)
    const personToCompany = erd.relations.find(
      (r) => r.from === 'Person' && r.to === 'Company',
    );
    expect(personToCompany).toBeDefined();
    expect(personToCompany!.type).toBe('one');

    // Each relation edge should be emitted once (no duplicate from the inverse side)
    const keys = erd.relations.map((r) => `${r.from}:${r.name}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('exposes the FK field and referenced PK field for each relation', () => {
    const erd = service.getErd();
    const personToCompany = erd.relations.find(
      (r) => r.from === 'Person' && r.to === 'Company',
    )!;
    expect(personToCompany.fromKey).toBe('companyId');
    expect(personToCompany.toKey).toBe('id');

    const dealToPerson = erd.relations.find(
      (r) => r.from === 'Deal' && r.to === 'Person',
    )!;
    expect(dealToPerson.fromKey).toBe('personId');
    expect(dealToPerson.toKey).toBe('id');
  });

  it('maps the Deal -> Company and Deal -> Person relations', () => {
    const erd = service.getErd();
    const fromDeal = erd.relations.filter((r) => r.from === 'Deal').map((r) => r.to);
    expect(fromDeal).toContain('Company');
    expect(fromDeal).toContain('Person');
    expect(fromDeal).toContain('User');
  });
});
