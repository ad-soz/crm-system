import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bearer, createTestApp, createTestUser, deleteTestUsers, TestUser } from './helpers';

/**
 * A Contact (touchpoint such as an email or call) can spawn tasks, and a deal can
 * have its own tasks. The agreement rule is checked twice: by the API (clear
 * message) and by the database itself (for anything that goes around the API).
 */
describe('Tasks that follow up a contact (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let rep: TestUser;
  let companyId: string;
  let annaId: string;
  let benId: string;
  let dealId: string;
  let otherDealId: string;
  let annaCall: string; // contact about Anna only
  let annaDealEmail: string; // contact about Anna and the deal
  const taskIds: string[] = [];

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    rep = await createTestUser(app, prisma, 'SALES_REP');
    const http = () => request(app.getHttpServer());
    const post = async (url: string, body: object) => (await http().post(url).set(bearer(rep)).send(body).expect(201)).body;

    companyId = (await post('/api/companies', { name: 'Follow-up Co' })).id;
    annaId = (await post('/api/people', { firstName: 'Anna', lastName: 'Follow', companyId })).id;
    benId = (await post('/api/people', { firstName: 'Ben', lastName: 'Other', companyId })).id;
    dealId = (await post('/api/deals', { title: 'Follow-up Deal', amount: 1000, companyId, personId: annaId })).id;
    otherDealId = (await post('/api/deals', { title: 'Other Deal', amount: 500, companyId })).id;
    annaCall = (await post('/api/contacts', { typeId: 'type-call', subject: 'Call with Anna', personId: annaId })).id;
    annaDealEmail = (
      await post('/api/contacts', { typeId: 'type-email', subject: 'Quote email', personId: annaId, dealId })
    ).id;
  });

  afterAll(async () => {
    await prisma.task.deleteMany({ where: { assigneeId: rep.id } });
    await prisma.contact.deleteMany({ where: { userId: rep.id } });
    await prisma.deal.deleteMany({ where: { id: { in: [dealId, otherDealId] } } });
    await prisma.person.deleteMany({ where: { id: { in: [annaId, benId] } } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await deleteTestUsers(prisma, [rep]);
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const createTask = (body: object) => http().post('/api/tasks').set(bearer(rep)).send({ title: 'Follow up', ...body });

  it('spawns a task from a contact and copies its person', async () => {
    const res = await createTask({ contactId: annaCall }).expect(201);
    taskIds.push(res.body.id);
    expect(res.body.contactId).toBe(annaCall);
    expect(res.body.personId).toBe(annaId);
    expect(res.body.dealId).toBeNull();
    expect(res.body.contact.subject).toBe('Call with Anna');
  });

  it('copies both person and deal when the contact has both', async () => {
    const res = await createTask({ contactId: annaDealEmail }).expect(201);
    taskIds.push(res.body.id);
    expect(res.body.personId).toBe(annaId);
    expect(res.body.dealId).toBe(dealId);
  });

  it('lets one contact spawn many tasks', async () => {
    for (const title of ['Send brochure', 'Book a demo', 'Check budget']) {
      taskIds.push((await createTask({ title, contactId: annaCall }).expect(201)).body.id);
    }
    expect(await prisma.task.count({ where: { contactId: annaCall } })).toBe(4);
  });

  it('refuses a task about a different person than its contact', async () => {
    const res = await createTask({ contactId: annaCall, personId: benId }).expect(400);
    expect(res.body.message).toMatch(/different person/);
  });

  it('refuses a task about a different deal than its contact', async () => {
    const res = await createTask({ contactId: annaDealEmail, dealId: otherDealId }).expect(400);
    expect(res.body.message).toMatch(/different deal/);
  });

  it('refuses a contact that does not exist', async () => {
    await createTask({ contactId: 'no-such-contact' }).expect(400);
  });

  it('allows a task to add a deal when its contact has none', async () => {
    const res = await createTask({ contactId: annaCall, dealId: otherDealId }).expect(201);
    taskIds.push(res.body.id);
    expect(res.body.dealId).toBe(otherDealId);
  });

  it('keeps a task with no contact working as before', async () => {
    const res = await createTask({ personId: benId }).expect(201);
    taskIds.push(res.body.id);
    expect(res.body.contactId).toBeNull();
    expect(res.body.contact).toBeNull();
  });

  it('attaches a contact to an existing task, and refuses a clashing one', async () => {
    const plain = (await createTask({}).expect(201)).body.id;
    taskIds.push(plain);
    const attached = await http().patch(`/api/tasks/${plain}`).set(bearer(rep)).send({ contactId: annaCall }).expect(200);
    expect(attached.body.contactId).toBe(annaCall);
    expect(attached.body.personId).toBe(annaId);

    await http().patch(`/api/tasks/${plain}`).set(bearer(rep)).send({ personId: benId }).expect(400);
    // The failed change left the task as it was.
    expect((await http().get(`/api/tasks/${plain}`).set(bearer(rep)).expect(200)).body.personId).toBe(annaId);
  });

  it('detaches a task from its contact without losing the task', async () => {
    const res = await http().patch(`/api/tasks/${taskIds[0]}`).set(bearer(rep)).send({ contactId: null }).expect(200);
    expect(res.body.contactId).toBeNull();
    expect(res.body.personId).toBe(annaId);
  });

  it('shows the contact on the person and deal pages, and counts tasks on a deal', async () => {
    const person = await http().get(`/api/people/${annaId}`).set(bearer(rep)).expect(200);
    expect(person.body.tasks.some((t: any) => t.contact?.id === annaCall)).toBe(true);
    // The person page shows each task's priority and status badges, so they must come with it.
    expect(person.body.tasks.every((t: any) => t.priority?.name && t.status?.name)).toBe(true);

    const deal = await http().get(`/api/deals/${dealId}`).set(bearer(rep)).expect(200);
    expect(deal.body.tasks.some((t: any) => t.contact?.id === annaDealEmail)).toBe(true);

    const list = await http().get('/api/deals?limit=500').set(bearer(rep)).expect(200);
    const row = list.body.data.find((d: any) => d.id === dealId);
    expect(row._count.tasks).toBe(await prisma.task.count({ where: { dealId } }));
    expect(row._count.tasks).toBeGreaterThan(0);
  });

  it('keeps the tasks when their contact is deleted', async () => {
    const throwaway = (await http().post('/api/contacts').set(bearer(rep)).send({ typeId: 'type-note', subject: 'Temp', personId: annaId }).expect(201)).body.id;
    const task = (await createTask({ contactId: throwaway }).expect(201)).body.id;
    taskIds.push(task);
    await http().delete(`/api/contacts/${throwaway}`).set(bearer(rep)).expect(200);
    const after = await http().get(`/api/tasks/${task}`).set(bearer(rep)).expect(200);
    expect(after.body.contactId).toBeNull();
    expect(after.body.personId).toBe(annaId);
  });

  describe('database rules (going around the API)', () => {
    it('refuses to insert a task that contradicts its contact', async () => {
      await expect(
        prisma.task.create({
          data: { title: 'Sneaky', statusId: 'status-todo', priorityId: 'priority-medium', contactId: annaCall, personId: benId },
        }),
      ).rejects.toThrow();
      expect(await prisma.task.count({ where: { title: 'Sneaky' } })).toBe(0);
    });

    it('refuses to move a task to a person that contradicts its contact', async () => {
      const id = taskIds[1];
      await expect(prisma.task.update({ where: { id }, data: { personId: benId } })).rejects.toThrow();
      expect((await prisma.task.findUnique({ where: { id } }))!.personId).toBe(annaId);
    });

    it('refuses to re-point a contact away from the person its tasks are about', async () => {
      await expect(prisma.contact.update({ where: { id: annaCall }, data: { personId: benId } })).rejects.toThrow();
      expect((await prisma.contact.findUnique({ where: { id: annaCall } }))!.personId).toBe(annaId);
    });

    it('has the three rules installed', async () => {
      const rows = await prisma.$queryRawUnsafe<{ name: string }[]>(
        `SELECT name FROM sqlite_master WHERE type = 'trigger' AND name IN ('crm_tasks_contact_agrees_ins','crm_tasks_contact_agrees_upd','crm_contacts_keep_tasks_agreeing')`,
      );
      expect(rows.length).toBe(3);
    });
  });
});
