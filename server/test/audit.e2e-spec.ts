import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bearer, createTestApp, createTestUser, deleteTestUsers, TestUser } from './helpers';

/**
 * The audit log: who changed which record, which field, from what to what, and when.
 * The history is written by database triggers; the API only reads it.
 */
describe('Audit log (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: TestUser;
  let ann: TestUser;
  let bob: TestUser;
  const made: { companies: string[]; people: string[]; deals: string[] } = { companies: [], people: [], deals: [] };

  const http = () => request(app.getHttpServer());
  const audit = async (query: string, who: TestUser = admin) => (await http().get(`/api/audit?${query}`).set(bearer(who)).expect(200)).body;
  const post = async (who: TestUser, url: string, body: object) => (await http().post(url).set(bearer(who)).send(body).expect(201)).body;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    admin = await createTestUser(app, prisma, 'ADMIN');
    ann = await createTestUser(app, prisma, 'SALES_REP');
    bob = await createTestUser(app, prisma, 'SALES_REP');
    await prisma.user.update({ where: { id: ann.id }, data: { firstName: 'Ann', lastName: 'Auditor' } });
    await prisma.user.update({ where: { id: bob.id }, data: { firstName: 'Bob', lastName: 'Builder' } });
  });

  afterAll(async () => {
    await prisma.task.deleteMany({ where: { assigneeId: { in: [ann.id, bob.id] } } });
    await prisma.contact.deleteMany({ where: { userId: { in: [ann.id, bob.id] } } });
    await prisma.deal.deleteMany({ where: { id: { in: made.deals } } });
    await prisma.person.deleteMany({ where: { id: { in: made.people } } });
    await prisma.company.deleteMany({ where: { id: { in: made.companies } } });
    await deleteTestUsers(prisma, [admin, ann, bob]);
    await app.close();
  });

  it('records who created a record, and every value it started with', async () => {
    const company = await post(ann, '/api/companies', { name: 'Audit Co', phone: '111' });
    made.companies.push(company.id);
    const { data } = await audit(`entity=companies&recordId=${company.id}`);
    const create = data.find((e: any) => e.action === 'create');
    expect(create).toMatchObject({ entityLabel: 'Company', recordLabel: 'Audit Co', actor: { id: ann.id, name: 'Ann Auditor' } });
    expect(create.values).toEqual(expect.arrayContaining([{ field: 'Name', value: 'Audit Co' }, { field: 'Phone', value: '111' }]));
  });

  it('traces a field over time: each change, old to new, by whoever made it', async () => {
    const company = await post(ann, '/api/companies', { name: 'Trace Co', phone: '100' });
    made.companies.push(company.id);
    await http().patch(`/api/companies/${company.id}`).set(bearer(ann)).send({ phone: '200' }).expect(200);
    await http().patch(`/api/companies/${company.id}`).set(bearer(bob)).send({ phone: '300', name: 'Trace Co Ltd' }).expect(200);

    const { data } = await audit(`entity=companies&recordId=${company.id}`);
    const phone = data.filter((e: any) => e.field === 'phone').reverse(); // oldest first
    expect(phone.map((e: any) => [e.oldValue, e.newValue, e.actor.name])).toEqual([
      ['100', '200', 'Ann Auditor'],
      ['200', '300', 'Bob Builder'],
    ]);
    const name = data.find((e: any) => e.field === 'name');
    expect(name).toMatchObject({ fieldLabel: 'Name', oldValue: 'Trace Co', newValue: 'Trace Co Ltd', actor: { name: 'Bob Builder' } });
    // Times only ever go forward.
    const times = data.map((e: any) => e.at).reverse();
    expect([...times].sort()).toEqual(times);
  });

  it('records nothing for a save that changes nothing, or for reading', async () => {
    const company = await post(ann, '/api/companies', { name: 'Still Co', phone: '1' });
    made.companies.push(company.id);
    const before = (await audit(`recordId=${company.id}`)).total;
    await http().patch(`/api/companies/${company.id}`).set(bearer(ann)).send({ phone: '1' }).expect(200);
    await http().get(`/api/companies/${company.id}`).set(bearer(ann)).expect(200);
    expect((await audit(`recordId=${company.id}`)).total).toBe(before);
  });

  it('shows names instead of ids for values that point at other records', async () => {
    const company = await post(ann, '/api/companies', { name: 'Pointer Co' });
    made.companies.push(company.id);
    const deal = await post(ann, '/api/deals', { title: 'Pointer Deal', amount: 100, companyId: company.id });
    made.deals.push(deal.id);
    await http().patch(`/api/deals/${deal.id}`).set(bearer(ann)).send({ stageId: 'stage-qualified', stageComment: 'Spoke to them' }).expect(200);

    const { data } = await audit(`entity=deals&recordId=${deal.id}`);
    const stage = data.find((e: any) => e.field === 'stage_id');
    expect(stage).toMatchObject({ fieldLabel: 'Stage', oldValue: 'Lead', newValue: 'Qualified', actor: { name: 'Ann Auditor' } });
    const create = data.find((e: any) => e.action === 'create');
    expect(create.values).toEqual(expect.arrayContaining([{ field: 'Company', value: 'Pointer Co' }, { field: 'Stage', value: 'Lead' }]));
  });

  it('keeps what a deleted record looked like, and still names it', async () => {
    const person = await post(ann, '/api/people', { firstName: 'Gone', lastName: 'Forever' });
    await http().delete(`/api/people/${person.id}`).set(bearer(bob)).expect(200);
    const { data } = await audit(`entity=people&recordId=${person.id}`);
    const del = data.find((e: any) => e.action === 'delete');
    expect(del).toMatchObject({ actor: { name: 'Bob Builder' }, recordLabel: 'Gone Forever (deleted)' });
    expect(del.values).toEqual(expect.arrayContaining([{ field: 'First name', value: 'Gone' }]));
    expect(data.some((e: any) => e.action === 'create' && e.actor.name === 'Ann Auditor')).toBe(true);
  });

  it('also records side effects, such as a task losing its person when the person is deleted', async () => {
    const person = await post(ann, '/api/people', { firstName: 'Side', lastName: 'Effect' });
    const task = await post(ann, '/api/tasks', { title: 'Orphan soon', personId: person.id });
    await http().delete(`/api/people/${person.id}`).set(bearer(bob)).expect(200);
    const { data } = await audit(`entity=tasks&recordId=${task.id}`);
    const cleared = data.find((e: any) => e.field === 'person_id');
    expect(cleared).toMatchObject({ newValue: null, actor: { name: 'Bob Builder' } });
    expect(cleared.oldValue).toContain('Side Effect');
  });

  it('records a company industry being added and removed as a change to the company', async () => {
    const company = await post(ann, '/api/companies', { name: 'Industry Co', industryIds: ['ind-technology'] });
    made.companies.push(company.id);
    await http().patch(`/api/companies/${company.id}`).set(bearer(bob)).send({ industryIds: [] }).expect(200);
    const { data } = await audit(`entity=companies&recordId=${company.id}`);
    const industry = data.filter((e: any) => e.field === 'industry').reverse();
    expect(industry.map((e: any) => [e.oldValue, e.newValue, e.actor.name])).toEqual([
      [null, 'Technology', 'Ann Auditor'],
      ['Technology', null, 'Bob Builder'],
    ]);
  });

  it('never credits one person with another person\'s changes, even when requests overlap', async () => {
    const results = await Promise.all(
      Array.from({ length: 24 }, (_, i) => {
        const who = i % 2 === 0 ? ann : bob;
        return http()
          .post('/api/people')
          .set(bearer(who))
          .send({ firstName: `Race${i}`, lastName: 'Overlap' })
          .expect(201)
          .then((r) => ({ id: r.body.id, who }));
      }),
    );
    made.people.push(...results.map((r) => r.id));
    for (const r of results) {
      const { data } = await audit(`entity=people&recordId=${r.id}`);
      expect(data.find((e: any) => e.action === 'create').actor.id).toBe(r.who.id);
    }
  });

  it('never records a password, only that it changed', async () => {
    const invited = await post(admin, '/api/users', { email: `aud-${Date.now()}@test.local`, firstName: 'New', lastName: 'Hire', roleProfileId: 'sales-rep' });
    const rows = await prisma.auditLog.findMany({ where: { entity: 'users', recordId: invited.user?.id ?? invited.id } });
    expect(rows.length).toBeGreaterThan(0);
    const text = JSON.stringify(rows);
    expect(text).not.toMatch(/\$2[aby]\$/); // a bcrypt hash
    expect(text.toLowerCase()).not.toContain('passwordhash');
    await prisma.user.delete({ where: { id: invited.user?.id ?? invited.id } });
  });

  it('records sign-ins and failed sign-ins, without the password', async () => {
    const guess = 'a-wrong-password-9876';
    await http().post('/api/auth/login').send({ email: ann.email, password: guess }).expect(401);
    await http().post('/api/auth/login').send({ email: ann.email, password: ann.password }).expect(201);
    const failed = await audit('action=sign_in_failed&entity=session');
    expect(failed.data[0].newValue).toContain(ann.email);
    expect(JSON.stringify(failed)).not.toContain(guess);
    const ok = await audit(`action=sign_in&entity=session&actorId=${ann.id}`);
    expect(ok.total).toBeGreaterThanOrEqual(2); // the test sign-in and this one
    expect(ok.data[0].actor.name).toBe('Ann Auditor');
  });

  it('records an export', async () => {
    await http().get('/api/export/people').set(bearer(ann)).expect(200);
    const { data } = await audit(`action=export&actorId=${ann.id}`);
    expect(data[0]).toMatchObject({ entity: 'people', actor: { name: 'Ann Auditor' } });
  });

  it('cannot be edited or deleted, by anyone, even directly in the database', async () => {
    const row = await prisma.auditLog.findFirst();
    expect(row).not.toBeNull();
    await expect(prisma.auditLog.update({ where: { id: row!.id }, data: { newValue: 'tampered' } })).rejects.toThrow();
    await expect(prisma.auditLog.delete({ where: { id: row!.id } })).rejects.toThrow();
    await expect(prisma.$executeRawUnsafe(`DELETE FROM audit_log`)).rejects.toThrow();
    expect((await prisma.auditLog.findUnique({ where: { id: row!.id } }))!.newValue).toBe(row!.newValue);
  });

  it('is only for people allowed to see it', async () => {
    await http().get('/api/audit').set(bearer(ann)).expect(403);
    await http().get('/api/audit/entities').set(bearer(ann)).expect(403);
    await http().get('/api/audit').expect(401);
    await http().get('/api/audit').set(bearer(admin)).expect(200);
  });

  it('filters by who, what kind of record, action and time, and pages', async () => {
    const byAnn = await audit(`actorId=${ann.id}&action=create&entity=companies`);
    expect(byAnn.total).toBeGreaterThan(0);
    expect(byAnn.data.every((e: any) => e.actor.id === ann.id && e.action === 'create' && e.entity === 'companies')).toBe(true);

    const future = await audit(`from=${encodeURIComponent(new Date(Date.now() + 86400000).toISOString())}`);
    expect(future.total).toBe(0);

    const page1 = await audit('limit=5&page=1');
    const page2 = await audit('limit=5&page=2');
    expect(page1.data).toHaveLength(5);
    expect(page1.data[0].id).toBeGreaterThan(page2.data[0].id); // newest first
    expect(page1.data.map((e: any) => e.id)).not.toEqual(expect.arrayContaining(page2.data.map((e: any) => e.id)));
    expect(page1.since).toEqual(expect.any(String));

    const actors = (await http().get('/api/audit/actors').set(bearer(admin)).expect(200)).body;
    expect(actors).toEqual(expect.arrayContaining([{ id: ann.id, name: 'Ann Auditor' }, { id: bob.id, name: 'Bob Builder' }]));

    const system = await audit('actorId=system&limit=5');
    expect(system.data.every((e: any) => e.actor === null)).toBe(true);

    const entities = (await http().get('/api/audit/entities').set(bearer(admin)).expect(200)).body;
    expect(entities).toEqual(expect.arrayContaining([{ value: 'companies', label: 'Company' }]));
  });

  it('covers every table that holds data, now and as tables are added', async () => {
    const tables = (await prisma.$queryRawUnsafe<{ name: string }[]>(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)).map((t) => t.name);
    const triggers = new Set((await prisma.$queryRawUnsafe<{ name: string }[]>(`SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'crm_aud_%'`)).map((t) => t.name));
    const skipped = ['_prisma_migrations', 'audit_log', 'audit_actor', 'deal_stage_changes'];
    const unaudited = tables.filter((t) => !skipped.includes(t) && !triggers.has(`crm_aud_${t}_ins`));
    expect(unaudited).toEqual([]);
  });
});
