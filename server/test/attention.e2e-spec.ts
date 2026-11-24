import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bearer, createTestApp, createTestUser, deleteTestUsers, TestUser } from './helpers';

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
// A date picked in the app is stored as midnight UTC of that calendar date.
const dateOnly = (offsetDays: number) => {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate() + offsetDays));
};

describe('Dashboard: needs attention (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let rep: TestUser;
  let other: TestUser;
  const ids: Record<string, string> = {};

  const dashboard = async (user: TestUser) =>
    (await request(app.getHttpServer()).get('/api/dashboard').set(bearer(user)).expect(200)).body;
  const ofMine = (list: { items: { id: string }[] }) => list.items.map((i) => i.id);

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    rep = await createTestUser(app, prisma, 'SALES_REP');
    other = await createTestUser(app, prisma, 'SALES_REP');

    const deal = async (key: string, data: object) => {
      ids[key] = (await prisma.deal.create({ data: { title: `E2E ${key}`, amount: 1000, stageId: 'stage-lead', ...data } as any })).id;
    };
    // Mine: quiet and past due, quiet only, fresh, and one that is already won.
    await deal('quietPastDue', { ownerId: rep.id, createdAt: daysAgo(30), expectedCloseDate: dateOnly(-10) });
    await deal('quiet', { ownerId: rep.id, createdAt: daysAgo(30) });
    await deal('fresh', { ownerId: rep.id, createdAt: daysAgo(1), expectedCloseDate: dateOnly(20) });
    await deal('won', { ownerId: rep.id, createdAt: daysAgo(90), expectedCloseDate: dateOnly(-30), stageId: 'stage-won' });
    // Someone else's.
    await deal('theirs', { ownerId: other.id, createdAt: daysAgo(30), expectedCloseDate: dateOnly(-10) });

    const task = async (key: string, data: object) => {
      ids[key] = (await prisma.task.create({ data: { title: `E2E ${key}`, statusId: 'status-todo', priorityId: 'priority-medium', ...data } as any })).id;
    };
    await task('overdue', { assigneeId: rep.id, dueDate: dateOnly(-5) });
    await task('overdueDone', { assigneeId: rep.id, dueDate: dateOnly(-5), statusId: 'status-done' });
    await task('dueToday', { assigneeId: rep.id, dueDate: dateOnly(0) });
    await task('dueSoon', { assigneeId: rep.id, dueDate: dateOnly(3) });
    await task('theirsOverdue', { assigneeId: other.id, dueDate: dateOnly(-5) });
  });

  afterAll(async () => {
    await prisma.contact.deleteMany({ where: { userId: { in: [rep.id, other.id] } } });
    await prisma.task.deleteMany({ where: { assigneeId: { in: [rep.id, other.id] } } });
    await prisma.deal.deleteMany({ where: { ownerId: { in: [rep.id, other.id] } } });
    await deleteTestUsers(prisma, [rep, other]);
    await app.close();
  });

  it('lists my overdue open tasks only', async () => {
    const { attention } = await dashboard(rep);
    expect(attention.overdueTasks.count).toBe(1);
    expect(ofMine(attention.overdueTasks)).toEqual([ids.overdue]);
    // Done, due-today, upcoming, and other people's tasks are all left out.
    expect(ofMine(attention.overdueTasks)).not.toContain(ids.overdueDone);
    expect(ofMine(attention.overdueTasks)).not.toContain(ids.theirsOverdue);
  });

  it('keeps a task due today on the screen: upcoming, and not overdue', async () => {
    const body = await dashboard(rep);
    const upcoming = body.upcomingTasks.map((t: any) => t.id);
    expect(upcoming).toContain(ids.dueToday);
    expect(upcoming).toContain(ids.dueSoon);
    expect(upcoming).not.toContain(ids.overdue);
    expect(ofMine(body.attention.overdueTasks)).not.toContain(ids.dueToday);
  });

  it('flags my quiet deals, never fresh, closed, or other people\'s', async () => {
    const { attention } = await dashboard(rep);
    const quiet = ofMine(attention.staleDeals);
    expect(quiet.sort()).toEqual([ids.quiet, ids.quietPastDue].sort());
    expect(quiet).not.toContain(ids.fresh);
    expect(quiet).not.toContain(ids.won);
    expect(quiet).not.toContain(ids.theirs);
    expect(attention.staleDeals.items.every((d: any) => d.quietDays >= 14)).toBe(true);
  });

  it('flags my past-due open deals, with how late they are', async () => {
    const { attention } = await dashboard(rep);
    expect(ofMine(attention.pastDueDeals)).toEqual([ids.quietPastDue]);
    expect(attention.pastDueDeals.items[0].daysLate).toBe(10);
    // A won deal with a past close date is finished business, not a problem.
    expect(ofMine(attention.pastDueDeals)).not.toContain(ids.won);
  });

  it('shows each person only their own', async () => {
    const { attention } = await dashboard(other);
    expect(ofMine(attention.staleDeals)).toEqual([ids.theirs]);
    expect(ofMine(attention.pastDueDeals)).toEqual([ids.theirs]);
    expect(ofMine(attention.overdueTasks)).toEqual([ids.theirsOverdue]);
  });

  it('takes a deal off the quiet list once a contact is logged on it', async () => {
    await request(app.getHttpServer())
      .post('/api/contacts')
      .set(bearer(rep))
      .send({ typeId: 'type-call', subject: 'E2E check-in', dealId: ids.quiet })
      .expect(201);
    const { attention } = await dashboard(rep);
    expect(ofMine(attention.staleDeals)).toEqual([ids.quietPastDue]);
    // Still past due: a call does not change its close date.
    expect(ofMine(attention.pastDueDeals)).toEqual([ids.quietPastDue]);
  });

  it('is left out for a profile without deals or tasks access', async () => {
    const limited = await prisma.roleProfile.create({
      data: { name: `E2E people only ${Date.now()}`, permissions: JSON.stringify(['people.view']) },
    });
    const viewer = await createTestUser(app, prisma, limited.id);
    try {
      const { attention } = await dashboard(viewer);
      expect(attention).toEqual({ overdueTasks: null, staleDeals: null, pastDueDeals: null });
    } finally {
      await deleteTestUsers(prisma, [viewer]);
      await prisma.roleProfile.delete({ where: { id: limited.id } });
    }
  });
});
