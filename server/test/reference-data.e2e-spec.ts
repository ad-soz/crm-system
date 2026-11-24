import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bearer, createTestApp, createTestUser, deleteTestUsers, TestUser } from './helpers';

/**
 * Reference lists are readable by anyone signed in (forms need them) but only
 * editable with the reference.manage permission, which only the Administrator
 * profile carries. These tests exercise both sides end to end.
 */
describe('Reference data (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: TestUser;
  let rep: TestUser;
  const createdValueIds: string[] = [];

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    admin = await createTestUser(app, prisma, 'ADMIN');
    rep = await createTestUser(app, prisma, 'SALES_REP');
  });

  afterAll(async () => {
    // Remove any throwaway values this test added, newest first.
    for (const id of createdValueIds.reverse()) {
      await prisma.taskPriority.deleteMany({ where: { id } }).catch(() => undefined);
    }
    await deleteTestUsers(prisma, [admin, rep]);
    await app.close();
  });

  it('lets any signed-in user read the catalog', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/reference/catalog')
      .set(bearer(rep))
      .expect(200);
    expect(res.body.lists.map((l: any) => l.key)).toContain('deal-stages');
    const industries = res.body.lists.find((l: any) => l.key === 'industries');
    expect(industries.multiField).toBe('company.industry');
  });

  it('lets any signed-in user read a single list with usage counts', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/reference/deal-stages')
      .set(bearer(rep))
      .expect(200);
    expect(res.body.values.length).toBe(6);
    // Each value reports whether it is currently referenced by a record.
    expect(res.body.values.every((v: any) => typeof v.inUse === 'boolean')).toBe(true);
  });

  it('refuses list changes without the reference.manage permission', async () => {
    await request(app.getHttpServer())
      .post('/api/reference/task-priorities')
      .set(bearer(rep))
      .send({ name: 'Blocker' })
      .expect(403);
  });

  it('lets an administrator add, rename, and retire a value', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/reference/task-priorities')
      .set(bearer(admin))
      .send({ name: 'Blocker', colour: 'destructive' })
      .expect(201);
    const id = created.body.id;
    createdValueIds.push(id);
    expect(created.body.name).toBe('Blocker');

    const renamed = await request(app.getHttpServer())
      .patch(`/api/reference/task-priorities/${id}`)
      .set(bearer(admin))
      .send({ name: 'Critical' })
      .expect(200);
    expect(renamed.body.name).toBe('Critical');

    // Retiring (isActive=false) is allowed because nothing uses it yet.
    await request(app.getHttpServer())
      .patch(`/api/reference/task-priorities/${id}`)
      .set(bearer(admin))
      .send({ isActive: false })
      .expect(200);

    // And it can be deleted since it has no records.
    await request(app.getHttpServer())
      .delete(`/api/reference/task-priorities/${id}`)
      .set(bearer(admin))
      .expect(200);
  });

  it('has a win chance on every stage, and changing it changes the forecast straight away', async () => {
    const stages = await request(app.getHttpServer()).get('/api/reference/deal-stages').set(bearer(rep)).expect(200);
    const byId = new Map<string, any>(stages.body.values.map((s: any) => [s.id, s]));
    expect(byId.get('stage-lead').winChance).toBe(10);
    expect(byId.get('stage-negotiation').winChance).toBe(75);
    expect(byId.get('stage-won').winChance).toBe(100);
    expect(byId.get('stage-lost').winChance).toBe(0);

    const before = (await request(app.getHttpServer()).get('/api/dashboard').set(bearer(rep)).expect(200)).body.forecast;

    // Doubling Negotiation's chance (75 -> 100) must raise the forecast by exactly 25% of its deals.
    const deals = (await request(app.getHttpServer()).get('/api/deals?limit=500').set(bearer(rep)).expect(200)).body.data;
    const negotiationValue = deals.filter((d: any) => d.stageId === 'stage-negotiation').reduce((n: number, d: any) => n + d.amount, 0);

    await request(app.getHttpServer())
      .patch('/api/reference/deal-stages/stage-negotiation')
      .set(bearer(admin))
      .send({ winChance: 100 })
      .expect(200);
    const after = (await request(app.getHttpServer()).get('/api/dashboard').set(bearer(rep)).expect(200)).body.forecast;
    expect(after.weighted - before.weighted).toBeCloseTo(negotiationValue * 0.25, 2);
    expect(after.total).toBe(before.total);

    await request(app.getHttpServer())
      .patch('/api/reference/deal-stages/stage-negotiation')
      .set(bearer(admin))
      .send({ winChance: 75 })
      .expect(200);
  });

  it('refuses a win chance outside 0 to 100, and from people without permission', async () => {
    for (const winChance of [101, -1, 12.5, 'lots']) {
      await request(app.getHttpServer())
        .patch('/api/reference/deal-stages/stage-lead')
        .set(bearer(admin))
        .send({ winChance })
        .expect(400);
    }
    await request(app.getHttpServer())
      .patch('/api/reference/deal-stages/stage-lead')
      .set(bearer(rep))
      .send({ winChance: 50 })
      .expect(403);
  });

  it('keeps Won at 100% and Lost at 0%, whatever is typed', async () => {
    await request(app.getHttpServer())
      .patch('/api/reference/deal-stages/stage-won')
      .set(bearer(admin))
      .send({ winChance: 30 })
      .expect(200);
    await request(app.getHttpServer())
      .patch('/api/reference/deal-stages/stage-lost')
      .set(bearer(admin))
      .send({ winChance: 60 })
      .expect(200);
    const stages = await request(app.getHttpServer()).get('/api/reference/deal-stages').set(bearer(rep)).expect(200);
    const byId = new Map<string, any>(stages.body.values.map((s: any) => [s.id, s]));
    expect(byId.get('stage-won').winChance).toBe(100);
    expect(byId.get('stage-lost').winChance).toBe(0);
  });

  it('refuses to delete a value that is in use (retire instead)', async () => {
    // priority-high is referenced by a seeded task.
    const res = await request(app.getHttpServer())
      .delete('/api/reference/task-priorities/priority-high')
      .set(bearer(admin))
      .expect(400);
    expect(res.body.message).toMatch(/in use/i);
  });

  it('validates a reorder covers every value exactly once', async () => {
    await request(app.getHttpServer())
      .patch('/api/reference/task-priorities/order')
      .set(bearer(admin))
      .send({ ids: ['priority-high'] })
      .expect(400);
  });

  it('toggles single-vs-multiple for a list that supports it', async () => {
    const res = await request(app.getHttpServer())
      .put('/api/reference/industries/multiple')
      .set(bearer(admin))
      .send({ allowMultiple: true })
      .expect(200);
    expect(res.body).toMatchObject({ fieldKey: 'company.industry', allowMultiple: true });
  });

  it('refuses the multiple toggle for a list that does not support it', async () => {
    await request(app.getHttpServer())
      .put('/api/reference/deal-stages/multiple')
      .set(bearer(admin))
      .send({ allowMultiple: true })
      .expect(400);
  });
});
