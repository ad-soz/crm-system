import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bearer, createTestApp, createTestUser, deleteTestUsers, TestUser } from './helpers';

const DAY = 86_400_000;
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

describe('Reports: deals over time (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let rep: TestUser;
  let other: TestUser;
  const ids: Record<string, string> = {};
  const thisMonth = monthKey(new Date());

  const report = async (query = '', as: TestUser = rep) =>
    (await request(app.getHttpServer()).get(`/api/reports/deals${query}`).set(bearer(as)).expect(200)).body;
  const mine = (months = 12) => report(`?months=${months}&ownerId=${rep.id}`);
  const move = (id: string, stageId: string, comment: string) =>
    request(app.getHttpServer()).patch(`/api/deals/${id}`).set(bearer(rep)).send({ stageId, stageComment: comment }).expect(200);

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    rep = await createTestUser(app, prisma, 'SALES_REP');
    other = await createTestUser(app, prisma, 'SALES_REP');

    const make = async (key: string, amount: number, stageId: string, createdAt = new Date()) => {
      ids[key] = (await prisma.deal.create({ data: { title: `E2E rpt ${key}`, amount, stageId, ownerId: rep.id, createdAt } })).id;
    };
    // The set, worked out by hand:
    await make('qualified', 10000, 'stage-lead'); // moved to Qualified below
    await make('won', 20000, 'stage-lead'); // moved to Won below
    await make('lost', 5000, 'stage-lead'); // moved to Lost below
    await make('oldWin', 8000, 'stage-won'); // already Won, no recorded move
    await make('old', 4000, 'stage-proposal', new Date(Date.now() - 40 * DAY)); // old, never moved
    await move(ids.qualified, 'stage-qualified', 'Discovery done');
    await move(ids.won, 'stage-won', 'Signed');
    await move(ids.lost, 'stage-lost', 'Went with a competitor');
  });

  afterAll(async () => {
    await prisma.deal.deleteMany({ where: { ownerId: { in: [rep.id, other.id] } } });
    await deleteTestUsers(prisma, [rep, other]);
    await app.close();
  });

  it('matches the hand calculation for this person', async () => {
    const r = await mine();
    expect(r.summary.created).toEqual({ count: 5, value: 47000 });
    expect(r.summary.won).toEqual({ count: 1, value: 20000 });
    expect(r.summary.lost).toEqual({ count: 1, value: 5000 });
    expect(r.summary.winRate).toBe(50);
    // Open: 10,000 in Qualified (25%) + 4,000 in Proposal (50%).
    expect(r.summary.open).toEqual({ count: 2, value: 14000, weighted: 4500 });
  });

  it('puts this month\'s contact in this month, and nothing in the others', async () => {
    const r = await mine();
    const row = r.byMonth.find((m: any) => m.key === thisMonth);
    expect(row.moves).toBe(3);
    expect(row.won).toEqual({ count: 1, value: 20000 });
    expect(row.lost).toEqual({ count: 1, value: 5000 });
    expect(r.byMonth).toHaveLength(12);
    expect(r.byMonth.at(-1).key).toBe(thisMonth);
    // The 40-day-old deal was created in an earlier or the same month; either way it is counted exactly once.
    expect(r.byMonth.reduce((n: number, m: any) => n + m.created.count, 0)).toBe(5);
  });

  it('shows where deals moved to', async () => {
    const r = await mine();
    const counts = r.movement.rows.find((row: any) => row.key === thisMonth).counts;
    expect(counts).toEqual({ 'stage-qualified': 1, 'stage-won': 1, 'stage-lost': 1 });
    expect(r.movement.stages.map((s: any) => s.id)).toContain('stage-negotiation'); // every stage is a column, even unused ones
  });

  it('does not guess a month for a deal that was already won', async () => {
    const r = await mine();
    expect(r.closedDateUnknown.won).toEqual({ count: 1, value: 8000 });
    expect(r.summary.won.value).toBe(20000); // not 28,000
  });

  it('lists the longest-waiting open deals, and is honest about the old one', async () => {
    const r = await mine();
    expect(r.stalled.total).toBe(2);
    const [oldest, newest] = r.stalled.items;
    expect(oldest).toMatchObject({ id: ids.old, days: 40, approximate: true, stage: { id: 'stage-proposal' } });
    // Just moved by a recorded move: exact.
    expect(newest).toMatchObject({ id: ids.qualified, days: 0, approximate: false, ownerName: 'E2E User' });
  });

  it('knows when history began', async () => {
    const r = await mine();
    expect(r.historySince).toBeTruthy();
    expect(new Date(r.historySince).getTime()).toBeLessThanOrEqual(Date.now());
    // It was recorded by the migration, in a form dates can be read from.
    const marker = await prisma.appSetting.findUnique({ where: { key: 'stage_history_since' } });
    expect(marker?.value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
  });

  it('records history as starting when the stage feature was installed, not when the marker was added', async () => {
    // Prisma stores a migration's finish time as whole milliseconds. A wrong conversion
    // once made the migration fall back to "now", which is a different, later moment.
    const [installed] = await prisma.$queryRawUnsafe<{ ms: bigint | number }[]>(
      `SELECT finished_at AS ms FROM _prisma_migrations WHERE migration_name = '20261108230000_deal_stage_changes'`,
    );
    const marker = await prisma.appSetting.findUnique({ where: { key: 'stage_history_since' } });
    expect(new Date(marker!.value).getTime()).toBe(Number(installed.ms));
  });

  it('keeps the one person\'s numbers out of another\'s', async () => {
    await prisma.deal.create({ data: { title: 'E2E rpt theirs', amount: 99999, stageId: 'stage-lead', ownerId: other.id } });
    const r = await mine();
    expect(r.summary.created.count).toBe(5);
    expect(r.byPerson.map((p: any) => p.name)).toEqual(['E2E User']);
    const theirs = await report(`?months=12&ownerId=${other.id}`);
    expect(theirs.summary.created).toEqual({ count: 1, value: 99999 });
  });

  it('offers the people to choose from, and the figures add up across everyone', async () => {
    const r = await report('?months=12');
    expect(r.owners.map((o: any) => o.id)).toEqual(expect.arrayContaining([rep.id, other.id]));
    const sum = (pick: (p: any) => number) => r.byPerson.reduce((n: number, p: any) => n + pick(p), 0);
    expect(sum((p) => p.created.count)).toBe(r.summary.created.count);
    expect(sum((p) => p.won.value)).toBe(r.summary.won.value);
    expect(sum((p) => p.open.weighted)).toBeCloseTo(r.summary.open.weighted, 2);
  });

  it('defaults to six months and accepts only 3, 6 or 12', async () => {
    expect((await report()).options).toEqual({ months: 6, ownerId: null });
    expect((await report('?months=3')).byMonth).toHaveLength(3);
    for (const bad of ['0', '7', '24', '-3', 'abc', '3.5']) {
      const res = await request(app.getHttpServer()).get(`/api/reports/deals?months=${bad}`).set(bearer(rep)).expect(400);
      expect(res.body.message).toMatch(/3, 6, 12 months/);
    }
  });

  it('shows nothing for a person who does not exist, rather than everything', async () => {
    const r = await report('?months=6&ownerId=nobody-by-that-id');
    expect(r.summary.created).toEqual({ count: 0, value: 0 });
    expect(r.byPerson).toEqual([]);
  });

  it('is only for people who can view deals', async () => {
    await request(app.getHttpServer()).get('/api/reports/deals').expect(401);
    const profile = await prisma.roleProfile.create({
      data: { name: `E2E no deals ${Date.now()}`, permissions: JSON.stringify(['people.view']) },
    });
    const viewer = await createTestUser(app, prisma, profile.id);
    try {
      await request(app.getHttpServer()).get('/api/reports/deals').set(bearer(viewer)).expect(403);
    } finally {
      await deleteTestUsers(prisma, [viewer]);
      await prisma.roleProfile.delete({ where: { id: profile.id } });
    }
  });

  it('only reads: running it changes nothing', async () => {
    const counts = async () => [await prisma.deal.count(), await prisma.dealStageChange.count(), await prisma.appSetting.count()];
    const before = await counts();
    await report('?months=12');
    await report(`?months=3&ownerId=${rep.id}`);
    expect(await counts()).toEqual(before);
  });
});
