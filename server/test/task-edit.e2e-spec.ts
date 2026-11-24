import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bearer, createTestApp, createTestUser, deleteTestUsers, TestUser } from './helpers';

/**
 * Editing and deleting a task. The bodies below are exactly what the Edit form
 * sends: it can empty a field by sending null.
 */
describe('Editing and deleting tasks (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: TestUser;
  let rep: TestUser;
  let viewer: TestUser;
  let editor: TestUser;
  const profileIds: string[] = [];
  let companyId: string;
  let annaId: string;
  let benId: string;
  let dealId: string;
  let contactId: string;

  const http = () => request(app.getHttpServer());

  async function makeUser(name: string, permissions: string[]) {
    const res = await http()
      .post('/api/role-profiles')
      .set(bearer(admin))
      .send({ name: `${name} ${Date.now()}`, permissions })
      .expect(201);
    profileIds.push(res.body.id);
    return createTestUser(app, prisma, res.body.id);
  }

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    admin = await createTestUser(app, prisma, 'ADMIN');
    rep = await createTestUser(app, prisma, 'SALES_REP');
    viewer = await makeUser('Task viewer', ['tasks.view']);
    editor = await makeUser('Task editor', ['tasks.view', 'tasks.edit']);

    const post = async (url: string, body: object) => (await http().post(url).set(bearer(rep)).send(body).expect(201)).body;
    companyId = (await post('/api/companies', { name: 'Edit Co' })).id;
    annaId = (await post('/api/people', { firstName: 'Anna', lastName: 'Edit', companyId })).id;
    benId = (await post('/api/people', { firstName: 'Ben', lastName: 'Edit', companyId })).id;
    dealId = (await post('/api/deals', { title: 'Edit Deal', amount: 100, companyId })).id;
    contactId = (await post('/api/contacts', { typeId: 'type-call', subject: 'Edit call', personId: annaId })).id;
  });

  afterAll(async () => {
    await prisma.task.deleteMany({ where: { OR: [{ assigneeId: rep.id }, { assigneeId: admin.id }] } });
    await prisma.contact.deleteMany({ where: { userId: rep.id } });
    await prisma.deal.deleteMany({ where: { id: dealId } });
    await prisma.person.deleteMany({ where: { id: { in: [annaId, benId] } } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await deleteTestUsers(prisma, [admin, rep, viewer, editor]);
    await prisma.roleProfile.deleteMany({ where: { id: { in: profileIds } } });
    await app.close();
  });

  const newTask = async (body: object = {}) =>
    (await http().post('/api/tasks').set(bearer(rep)).send({ title: 'Original', description: 'Some notes', dueDate: '2026-12-01', ...body }).expect(201)).body;
  const edit = (id: string, body: object, who: TestUser = rep) => http().patch(`/api/tasks/${id}`).set(bearer(who)).send(body);

  it('changes every field', async () => {
    const t = await newTask();
    const res = await edit(t.id, {
      title: 'Renamed',
      description: 'New notes',
      dueDate: '2027-01-15',
      priorityId: 'priority-high',
      statusId: 'status-done',
      assigneeId: admin.id,
      personId: benId,
      dealId,
    }).expect(200);
    expect(res.body).toMatchObject({ title: 'Renamed', description: 'New notes', priorityId: 'priority-high', statusId: 'status-done', assigneeId: admin.id, personId: benId, dealId });
    expect(res.body.dueDate.slice(0, 10)).toBe('2027-01-15');
  });

  it('empties the due date, description, person, deal and contact when sent null or empty', async () => {
    const t = await newTask({ contactId, dealId });
    expect(t.personId).toBe(annaId);
    const res = await edit(t.id, { title: 'Original', description: '', dueDate: null, personId: null, dealId: null, contactId: null }).expect(200);
    expect(res.body).toMatchObject({ description: '', dueDate: null, personId: null, dealId: null, contactId: null });
    // The task itself, and its contact, are still there.
    expect(await prisma.task.count({ where: { id: t.id } })).toBe(1);
    expect(await prisma.contact.count({ where: { id: contactId } })).toBe(1);
  });

  it('leaves status, priority and assignee alone when they are not sent', async () => {
    const t = await newTask({ priorityId: 'priority-high' });
    const res = await edit(t.id, { title: 'Only the title changed' }).expect(200);
    expect(res.body).toMatchObject({ title: 'Only the title changed', priorityId: 'priority-high', statusId: t.statusId, assigneeId: rep.id });
  });

  it('refuses a person that contradicts the contact the task keeps, and changes nothing', async () => {
    const t = await newTask({ contactId });
    const res = await edit(t.id, { title: 'Should not save', personId: benId, contactId }).expect(400);
    expect(res.body.message).toMatch(/different person/);
    const after = (await http().get(`/api/tasks/${t.id}`).set(bearer(rep)).expect(200)).body;
    expect(after).toMatchObject({ title: 'Original', personId: annaId, contactId });
  });

  it('allows the person to change once the contact link is removed in the same save', async () => {
    const t = await newTask({ contactId });
    const res = await edit(t.id, { personId: benId, contactId: null }).expect(200);
    expect(res.body).toMatchObject({ personId: benId, contactId: null });
  });

  it('refuses an empty title, an unknown person and an unknown status', async () => {
    const t = await newTask();
    await edit(t.id, { title: '' }).expect(400);
    await edit(t.id, { personId: 'no-such-person' }).expect(400);
    await edit(t.id, { statusId: 'no-such-status' }).expect(400);
    expect((await http().get(`/api/tasks/${t.id}`).set(bearer(rep)).expect(200)).body.title).toBe('Original');
  });

  it('returns 404 for a task that is not there', async () => {
    await edit('no-such-task', { title: 'x' }).expect(404);
    await http().delete('/api/tasks/no-such-task').set(bearer(rep)).expect(404);
  });

  it('deletes a task, and only that task', async () => {
    const keep = await newTask({ title: 'Keep me' });
    const gone = await newTask({ title: 'Delete me', contactId, dealId });
    await http().delete(`/api/tasks/${gone.id}`).set(bearer(rep)).expect(200);
    await http().get(`/api/tasks/${gone.id}`).set(bearer(rep)).expect(404);
    await http().get(`/api/tasks/${keep.id}`).set(bearer(rep)).expect(200);
    // Its contact and deal are untouched.
    expect(await prisma.contact.count({ where: { id: contactId } })).toBe(1);
    expect(await prisma.deal.count({ where: { id: dealId } })).toBe(1);
  });

  describe('permissions', () => {
    it('a view-only role can read but not edit or delete', async () => {
      const t = await newTask();
      await http().get(`/api/tasks/${t.id}`).set(bearer(viewer)).expect(200);
      await edit(t.id, { title: 'Nope' }, viewer).expect(403);
      await http().delete(`/api/tasks/${t.id}`).set(bearer(viewer)).expect(403);
      expect((await prisma.task.findUnique({ where: { id: t.id } }))!.title).toBe('Original');
    });

    it('an edit-only role can edit but not delete', async () => {
      const t = await newTask();
      await edit(t.id, { title: 'Edited by editor' }, editor).expect(200);
      await http().delete(`/api/tasks/${t.id}`).set(bearer(editor)).expect(403);
      expect(await prisma.task.count({ where: { id: t.id } })).toBe(1);
    });
  });
});
