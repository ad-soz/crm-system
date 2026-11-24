import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bearer, createTestApp, createTestUser, deleteTestUsers, TestUser } from './helpers';

describe('Full CRM flow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let rep: TestUser;
  let companyId: string;
  let personId: string;
  let dealId: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    rep = await createTestUser(app, prisma, 'SALES_REP');
  });

  afterAll(async () => {
    // Clean up everything this test created.
    await prisma.contact.deleteMany({ where: { userId: rep.id } });
    await prisma.task.deleteMany({ where: { assigneeId: rep.id } });
    if (dealId) await prisma.deal.deleteMany({ where: { id: dealId } });
    if (personId) await prisma.person.deleteMany({ where: { id: personId } });
    if (companyId) await prisma.company.deleteMany({ where: { id: companyId } });
    await deleteTestUsers(prisma, [rep]);
    await app.close();
  });

  const auth = () => bearer(rep);

  it('creates a company with reference-list industries', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/companies')
      .set(auth())
      .send({ name: 'E2E Test Co', industryIds: ['ind-technology'] })
      .expect(201);
    companyId = res.body.id;
    expect(res.body.name).toBe('E2E Test Co');
    // The response flattens the join rows into plain industry values.
    expect(res.body.industries.map((i: any) => i.id)).toEqual(['ind-technology']);
  });

  it('creates a person linked to the company', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/people')
      .set(auth())
      .send({ firstName: 'Test', lastName: 'Person', email: 'tp@e2e.com', companyId })
      .expect(201);
    personId = res.body.id;
    expect(res.body.companyId).toBe(companyId);
  });

  it('suggests job titles from existing people', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/people/meta/titles?q=man')
      .set(auth())
      .expect(200);
    // Seeded people include titles like "Procurement Manager"/"Product Manager".
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.every((t: string) => /man/i.test(t))).toBe(true);
  });

  it('creates a deal, defaulting the stage from the list', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/deals')
      .set(auth())
      .send({ title: 'E2E Deal', amount: 5000, companyId, personId })
      .expect(201);
    dealId = res.body.id;
    expect(res.body.title).toBe('E2E Deal');
    // No stage sent, so the default (Lead) is applied.
    expect(res.body.stage.id).toBe('stage-lead');
  });

  it('moves the deal to another stage by id', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/deals/${dealId}`)
      .set(auth())
      .send({ stageId: 'stage-qualified', stageComment: 'Discovery call went well' })
      .expect(200);
    expect(res.body.stage.id).toBe('stage-qualified');
  });

  it('rejects an unknown stage id', async () => {
    await request(app.getHttpServer())
      .patch(`/api/deals/${dealId}`)
      .set(auth())
      .send({ stageId: 'stage-does-not-exist', stageComment: 'Trying a stage that is not there' })
      .expect(400);
  });

  it('returns a pipeline summary covering every stage', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/deals/pipeline')
      .set(auth())
      .expect(200);
    // Six seeded stages, each entry carrying its stage value.
    expect(res.body.length).toBe(6);
    expect(res.body.every((row: any) => typeof row.stage.name === 'string')).toBe(true);
  });

  it('logs a contact for the person', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/contacts')
      .set(auth())
      .send({ typeId: 'type-call', subject: 'E2E call', personId })
      .expect(201);
    expect(res.body.type.id).toBe('type-call');
  });

  it('filters contacts by type id', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/contacts?typeId=type-call')
      .set(auth())
      .expect(200);
    expect(res.body.data.every((a: any) => a.typeId === 'type-call')).toBe(true);
  });

  it('creates a task, defaulting status and priority', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/tasks')
      .set(auth())
      .send({ title: 'E2E follow up', priorityId: 'priority-high', personId })
      .expect(201);
    // Status defaults to the list default (To Do); priority is the one sent.
    expect(res.body.status.id).toBe('status-todo');
    expect(res.body.priority.id).toBe('priority-high');
  });

  it('searches across entities', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/search?q=E2E')
      .set(auth())
      .expect(200);
    expect(res.body.companies.some((c: any) => c.label === 'E2E Test Co')).toBe(true);
    expect(res.body.deals.some((d: any) => d.label === 'E2E Deal')).toBe(true);
  });

  it('forecasts weighted by stage, and it matches a hand calculation from the same data', async () => {
    const [dash, deals, stages] = await Promise.all([
      request(app.getHttpServer()).get('/api/dashboard').set(auth()).expect(200),
      request(app.getHttpServer()).get('/api/deals?limit=500').set(auth()).expect(200),
      request(app.getHttpServer()).get('/api/reference/deal-stages').set(auth()).expect(200),
    ]);

    // Independent calculation: sum of amount x win chance over deals in OPEN stages.
    const stageById = new Map<string, any>(stages.body.values.map((s: any) => [s.id, s]));
    const open = deals.body.data.filter((d: any) => stageById.get(d.stageId)?.outcome === 'OPEN');
    const expectedTotal = open.reduce((sum: number, d: any) => sum + d.amount, 0);
    const expectedWeighted = open.reduce((sum: number, d: any) => sum + (d.amount * stageById.get(d.stageId).winChance) / 100, 0);

    const f = dash.body.forecast;
    expect(f.count).toBe(open.length);
    expect(f.total).toBeCloseTo(expectedTotal, 2);
    expect(f.weighted).toBeCloseTo(expectedWeighted, 2);
    // The rows add up to the headline figures, so nothing is hidden or double counted.
    expect(f.rows.reduce((n: number, r: any) => n + r.count, 0)).toBe(f.count);
    expect(f.rows.reduce((n: number, r: any) => n + r.weighted, 0)).toBeCloseTo(f.weighted, 2);
    // Won and lost deals are not in the forecast.
    expect(f.weighted).toBeLessThan(f.total);
  });

  it('fetches dashboard metrics', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/dashboard')
      .set(auth())
      .expect(200);
    expect(res.body.totalPeople).toBeGreaterThanOrEqual(1);
    // One entry per seeded stage.
    expect(res.body.dealsByStage.length).toBe(6);
  });

  it('exports people to CSV', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/export/people')
      .set(auth())
      .expect(200);
    expect(res.text).toContain('firstName,lastName,email,phone,title,companyName');
    expect(res.text).toContain('Test,Person');
  });

  it('imports people from CSV with error reporting', async () => {
    const csv = 'firstName,lastName,email,companyName\nImported,User,iu@e2e.com,E2E Test Co\n,BadRow,bad@e2e.com,E2E Test Co';
    const res = await request(app.getHttpServer())
      .post('/api/import/people')
      .set(auth())
      .attach('file', Buffer.from(csv), 'people.csv')
      .expect(201);
    expect(res.body.total).toBe(2);
    expect(res.body.imported).toBe(1);
    expect(res.body.errors.length).toBe(1);

    // Clean up imported person
    await prisma.person.deleteMany({ where: { email: 'iu@e2e.com' } });
  });

  it('refuses to delete a company with related records', async () => {
    await request(app.getHttpServer())
      .delete(`/api/companies/${companyId}`)
      .set(auth())
      .expect(400);
  });
});
