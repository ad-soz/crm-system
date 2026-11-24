import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bearer, createTestApp, createTestUser, deleteTestUsers, TestUser } from './helpers';

/**
 * "Duplicate deal" is done by the screen with the ordinary create call. These tests send exactly
 * what the screen sends, to prove a copy needs nothing special from the server and cannot get
 * round any rule, including for a deal that is already won.
 */
describe('Duplicating a deal (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ann: TestUser;
  let bob: TestUser;
  let companyId: string;
  let personId: string;
  let wonId: string;
  const created: string[] = [];

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    ann = await createTestUser(app, prisma, 'SALES_REP');
    bob = await createTestUser(app, prisma, 'SALES_REP');
    await prisma.user.update({ where: { id: bob.id }, data: { firstName: 'Bob', lastName: 'Copier' } });
    const post = async (url: string, body: object) => (await http().post(url).set(bearer(ann)).send(body).expect(201)).body;
    companyId = (await post('/api/companies', { name: 'Copy Co' })).id;
    personId = (await post('/api/people', { firstName: 'Cory', lastName: 'Pee', companyId })).id;
    wonId = (await post('/api/deals', { title: 'Original', amount: 12500, companyId, personId, expectedCloseDate: '2026-12-15' })).id;
    await http().patch(`/api/deals/${wonId}`).set(bearer(ann)).send({ stageId: 'stage-won', stageComment: 'Signed' }).expect(200);
  });

  afterAll(async () => {
    await prisma.deal.deleteMany({ where: { id: { in: [wonId, ...created] } } });
    await prisma.person.deleteMany({ where: { id: personId } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await deleteTestUsers(prisma, [ann, bob]);
    await app.close();
  });

  // What the Duplicate screen sends: the original's details, and no stage.
  const copyBody = (extra: object = {}) => ({ title: 'Original (copy)', amount: 12500, companyId, personId, expectedCloseDate: '2026-12-15', ...extra });
  const copy = async (who: TestUser, extra: object = {}) => {
    const res = await http().post('/api/deals').set(bearer(who)).send(copyBody(extra)).expect(201);
    created.push(res.body.id);
    return res.body;
  };

  it('copies a won deal as a new deal at the default stage, with no reason for a move needed', async () => {
    const original = (await http().get(`/api/deals/${wonId}`).set(bearer(ann)).expect(200)).body;
    expect(original.stageId).toBe('stage-won');
    const made = await copy(ann);
    expect(made).toMatchObject({ title: 'Original (copy)', amount: 12500, companyId, personId, stageId: 'stage-lead' });
    expect(made.expectedCloseDate.slice(0, 10)).toBe('2026-12-15');
    expect(made.id).not.toBe(wonId);
  });

  it('leaves the original alone', async () => {
    await copy(ann);
    const original = (await http().get(`/api/deals/${wonId}`).set(bearer(ann)).expect(200)).body;
    expect(original).toMatchObject({ title: 'Original', stageId: 'stage-won', amount: 12500 });
  });

  it('does not copy contacts, tasks or stage history', async () => {
    await http().post('/api/contacts').set(bearer(ann)).send({ typeId: 'type-call', subject: 'On the original', dealId: wonId }).expect(201);
    await http().post('/api/tasks').set(bearer(ann)).send({ title: 'On the original', dealId: wonId }).expect(201);
    const made = await copy(ann);
    const fresh = (await http().get(`/api/deals/${made.id}`).set(bearer(ann)).expect(200)).body;
    expect(fresh.contacts).toHaveLength(0);
    expect(fresh.tasks).toHaveLength(0);
    expect((await http().get(`/api/deals/${made.id}/history`).set(bearer(ann)).expect(200)).body).toHaveLength(0);
    await prisma.task.deleteMany({ where: { dealId: wonId } });
    await prisma.contact.deleteMany({ where: { dealId: wonId } });
  });

  it('is owned by whoever makes the copy, not by the original\'s owner', async () => {
    const made = await copy(bob);
    expect(made.ownerId).toBe(bob.id);
    expect((await prisma.deal.findUnique({ where: { id: wonId } }))!.ownerId).toBe(ann.id);
  });

  it('can be copied again and again: each copy is its own deal', async () => {
    const a = await copy(ann, { title: 'Copy 1' });
    const b = await copy(ann, { title: 'Copy 2' });
    expect(new Set([wonId, a.id, b.id]).size).toBe(3);
  });

  it('records the copy as a new deal in the audit log, by whoever made it', async () => {
    const made = await copy(bob, { title: 'Audited copy' });
    const rows = await prisma.auditLog.findMany({ where: { entity: 'deals', recordId: made.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: 'create', actorId: bob.id, actorName: 'Bob Copier' });
    expect(JSON.parse(rows[0].newValue!)).toMatchObject({ title: 'Audited copy', amount: '12500' });
  });

  it('cannot be used to skip the rules: a copy of a company that no longer exists is refused', async () => {
    await http().post('/api/deals').set(bearer(ann)).send(copyBody({ companyId: 'gone' })).expect(400);
  });

  it('needs the right to create deals', async () => {
    const admin = await createTestUser(app, prisma, 'ADMIN');
    const profile = await http().post('/api/role-profiles').set(bearer(admin)).send({ name: `View deals ${Date.now()}`, permissions: ['deals.view'] }).expect(201);
    const viewer = await createTestUser(app, prisma, profile.body.id);
    await http().post('/api/deals').set(bearer(viewer)).send(copyBody()).expect(403);
    await deleteTestUsers(prisma, [viewer, admin]);
    await prisma.roleProfile.deleteMany({ where: { id: profile.body.id } });
  });
});
