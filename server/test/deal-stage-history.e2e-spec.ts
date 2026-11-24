import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bearer, createTestApp, createTestUser, deleteTestUsers, TestUser } from './helpers';

describe('Deal stage moves need a comment (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let rep: TestUser;
  let other: TestUser;
  const dealIds: string[] = [];

  const newDeal = async (stageId = 'stage-lead', ownerId = rep.id) => {
    const deal = await prisma.deal.create({ data: { title: `E2E move ${dealIds.length}`, amount: 1000, stageId, ownerId } });
    dealIds.push(deal.id);
    return deal.id;
  };
  const move = (id: string, body: object, as = rep) =>
    request(app.getHttpServer()).patch(`/api/deals/${id}`).set(bearer(as)).send(body);
  const history = async (id: string, as = rep) =>
    (await request(app.getHttpServer()).get(`/api/deals/${id}/history`).set(bearer(as)).expect(200)).body;
  const stageOf = async (id: string) => (await prisma.deal.findUnique({ where: { id } }))!.stageId;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    rep = await createTestUser(app, prisma, 'SALES_REP');
    other = await createTestUser(app, prisma, 'SALES_REP');
  });

  afterAll(async () => {
    await prisma.deal.deleteMany({ where: { id: { in: dealIds } } });
    await deleteTestUsers(prisma, [rep, other]);
    await app.close();
  });

  describe('through the API', () => {
    it('refuses a move with no comment, and the deal stays where it was', async () => {
      const id = await newDeal();
      const res = await move(id, { stageId: 'stage-qualified' }).expect(400);
      expect(res.body.message).toMatch(/comment/i);
      expect(await stageOf(id)).toBe('stage-lead');
      expect(await history(id)).toEqual([]);
    });

    it('refuses an empty or whitespace-only comment', async () => {
      const id = await newDeal();
      await move(id, { stageId: 'stage-qualified', stageComment: '' }).expect(400);
      await move(id, { stageId: 'stage-qualified', stageComment: '   \n\t ' }).expect(400);
      expect(await stageOf(id)).toBe('stage-lead');
    });

    it('refuses a comment over 1000 characters', async () => {
      const id = await newDeal();
      await move(id, { stageId: 'stage-qualified', stageComment: 'x'.repeat(1001) }).expect(400);
      expect(await stageOf(id)).toBe('stage-lead');
    });

    it('moves the deal and records when, who, from, to and why', async () => {
      const id = await newDeal();
      const before = Date.now();
      const res = await move(id, { stageId: 'stage-qualified', stageComment: '  Budget approved by finance  ' }).expect(200);
      expect(res.body.stage.id).toBe('stage-qualified');

      const rows = await history(id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        comment: 'Budget approved by finance', // trimmed
        userId: rep.id,
        userName: 'E2E User',
        fromStage: { id: 'stage-lead', name: 'Lead' },
        toStage: { id: 'stage-qualified', name: 'Qualified' },
      });
      const when = new Date(rows[0].createdAt).getTime();
      expect(when).toBeGreaterThanOrEqual(before - 2000);
      expect(when).toBeLessThanOrEqual(Date.now() + 2000);
    });

    it('lists moves newest first, each with its own comment', async () => {
      const id = await newDeal();
      await move(id, { stageId: 'stage-qualified', stageComment: 'first' }).expect(200);
      await move(id, { stageId: 'stage-proposal', stageComment: 'second' }).expect(200);
      await move(id, { stageId: 'stage-lead', stageComment: 'third (back again)' }).expect(200);
      const rows = await history(id);
      expect(rows.map((r: any) => r.comment)).toEqual(['third (back again)', 'second', 'first']);
      expect(rows[0].fromStage.id).toBe('stage-proposal');
      expect(rows[0].toStage.id).toBe('stage-lead');
    });

    it('records the person who actually made the move', async () => {
      const id = await newDeal();
      await move(id, { stageId: 'stage-qualified', stageComment: 'by someone else' }, other).expect(200);
      expect((await history(id))[0].userId).toBe(other.id);
    });

    it('needs no comment for other edits, or for "moving" to the stage it is already in', async () => {
      const id = await newDeal();
      await move(id, { title: 'Renamed', amount: 2500 }).expect(200);
      await move(id, { stageId: 'stage-lead', title: 'Renamed again' }).expect(200);
      expect(await history(id)).toEqual([]);
      expect((await prisma.deal.findUnique({ where: { id } }))!.title).toBe('Renamed again');
    });

    it('does not record anything for a comment on its own', async () => {
      const id = await newDeal();
      await move(id, { stageComment: 'no stage given' }).expect(200);
      expect(await history(id)).toEqual([]);
      expect(await stageOf(id)).toBe('stage-lead');
    });

    it('refuses a move to a stage that does not exist, or one that is retired', async () => {
      const id = await newDeal();
      await move(id, { stageId: 'stage-nope', stageComment: 'x' }).expect(400);
      const retired = await prisma.dealStage.create({ data: { name: `E2E retired ${Date.now()}`, isActive: false } });
      try {
        const res = await move(id, { stageId: retired.id, stageComment: 'x' }).expect(400);
        expect(res.body.message).toMatch(/retired/i);
      } finally {
        await prisma.dealStage.delete({ where: { id: retired.id } });
      }
      expect(await history(id)).toEqual([]);
      expect(await stageOf(id)).toBe('stage-lead');
    });

    it('404s the history of a deal that does not exist', async () => {
      await request(app.getHttpServer()).get('/api/deals/does-not-exist/history').set(bearer(rep)).expect(404);
    });

    it('keeps history away from people without access', async () => {
      const id = await newDeal();
      await request(app.getHttpServer()).get(`/api/deals/${id}/history`).expect(401);
      const profile = await prisma.roleProfile.create({
        data: { name: `E2E no deals ${Date.now()}`, permissions: JSON.stringify(['people.view']) },
      });
      const viewer = await createTestUser(app, prisma, profile.id);
      try {
        await request(app.getHttpServer()).get(`/api/deals/${id}/history`).set(bearer(viewer)).expect(403);
      } finally {
        await deleteTestUsers(prisma, [viewer]);
        await prisma.roleProfile.delete({ where: { id: profile.id } });
      }
    });

    it('does not let someone with view-only access move a deal at all', async () => {
      const profile = await prisma.roleProfile.create({
        data: { name: `E2E deals view ${Date.now()}`, permissions: JSON.stringify(['deals.view']) },
      });
      const viewer = await createTestUser(app, prisma, profile.id);
      try {
        const id = await newDeal();
        await move(id, { stageId: 'stage-qualified', stageComment: 'x' }, viewer).expect(403);
        expect(await stageOf(id)).toBe('stage-lead');
      } finally {
        await deleteTestUsers(prisma, [viewer]);
        await prisma.roleProfile.delete({ where: { id: profile.id } });
      }
    });
  });

  describe('enforced by the database itself (going around the API)', () => {
    const record = (dealId: string, fromStageId: string, toStageId: string, comment = 'because') =>
      prisma.dealStageChange.create({ data: { dealId, fromStageId, toStageId, userName: 'Direct', comment } });

    it('refuses to move a deal with no comment, even straight through the database', async () => {
      const id = await newDeal();
      await expect(prisma.deal.update({ where: { id }, data: { stageId: 'stage-proposal' } })).rejects.toThrow();
      expect(await stageOf(id)).toBe('stage-lead');
    });

    it('allows the move once a matching comment exists, and marks it used', async () => {
      const id = await newDeal();
      const row = await record(id, 'stage-lead', 'stage-proposal');
      await prisma.deal.update({ where: { id }, data: { stageId: 'stage-proposal' } });
      expect(await stageOf(id)).toBe('stage-proposal');
      expect((await prisma.dealStageChange.findUnique({ where: { id: row.id } }))!.applied).toBe(true);
    });

    it('lets one comment authorise one move only, never a repeat', async () => {
      const id = await newDeal();
      await record(id, 'stage-lead', 'stage-proposal');
      await prisma.deal.update({ where: { id }, data: { stageId: 'stage-proposal' } }); // uses it up
      await record(id, 'stage-proposal', 'stage-lead');
      await prisma.deal.update({ where: { id }, data: { stageId: 'stage-lead' } }); // back again
      // Lead -> Proposal again: the first comment is already spent.
      await expect(prisma.deal.update({ where: { id }, data: { stageId: 'stage-proposal' } })).rejects.toThrow();
      expect(await stageOf(id)).toBe('stage-lead');
    });

    it('only accepts a comment for that deal, that starting stage and that target stage', async () => {
      const a = await newDeal();
      const b = await newDeal();
      await record(a, 'stage-lead', 'stage-proposal');
      // Another deal can't borrow it.
      await expect(prisma.deal.update({ where: { id: b }, data: { stageId: 'stage-proposal' } })).rejects.toThrow();
      // A different target can't use it.
      await expect(prisma.deal.update({ where: { id: a }, data: { stageId: 'stage-qualified' } })).rejects.toThrow();
      // A comment written for another starting point can't be used either.
      const c = await newDeal('stage-qualified');
      await expect(prisma.deal.update({ where: { id: c }, data: { stageId: 'stage-proposal' } })).rejects.toThrow();
    });

    it('refuses a blank comment, or a move to the same stage, in the history table', async () => {
      const id = await newDeal();
      await expect(record(id, 'stage-lead', 'stage-proposal', '')).rejects.toThrow();
      await expect(record(id, 'stage-lead', 'stage-proposal', '   ')).rejects.toThrow();
      await expect(record(id, 'stage-lead', 'stage-proposal', 'x'.repeat(1001))).rejects.toThrow();
      await expect(record(id, 'stage-lead', 'stage-lead')).rejects.toThrow();
      expect(await prisma.dealStageChange.count({ where: { dealId: id } })).toBe(0);
    });

    it('does not let history be edited or deleted', async () => {
      const id = await newDeal();
      await move(id, { stageId: 'stage-qualified', stageComment: 'original wording' }).expect(200);
      const row = (await prisma.dealStageChange.findFirst({ where: { dealId: id } }))!;

      await expect(prisma.dealStageChange.update({ where: { id: row.id }, data: { comment: 'rewritten' } })).rejects.toThrow();
      await expect(prisma.dealStageChange.update({ where: { id: row.id }, data: { userName: 'Someone Else' } })).rejects.toThrow();
      await expect(prisma.dealStageChange.update({ where: { id: row.id }, data: { toStageId: 'stage-won' } })).rejects.toThrow();
      await expect(prisma.dealStageChange.update({ where: { id: row.id }, data: { applied: false } })).rejects.toThrow();
      await expect(prisma.dealStageChange.delete({ where: { id: row.id } })).rejects.toThrow();
      await expect(prisma.dealStageChange.deleteMany({ where: { dealId: id } })).rejects.toThrow();

      const after = (await prisma.dealStageChange.findUnique({ where: { id: row.id } }))!;
      expect(after.comment).toBe('original wording');
      expect(after.userName).toBe('E2E User');
    });

    it('still lets a deal be deleted, taking its own history with it', async () => {
      const id = await newDeal();
      await move(id, { stageId: 'stage-qualified', stageComment: 'will go with the deal' }).expect(200);
      expect(await prisma.dealStageChange.count({ where: { dealId: id } })).toBe(1);
      await request(app.getHttpServer()).delete(`/api/deals/${id}`).set(bearer(rep)).expect(200);
      expect(await prisma.dealStageChange.count({ where: { dealId: id } })).toBe(0);
    });

    it('keeps history, with the name, when the person who moved the deal is later removed', async () => {
      const leaver = await createTestUser(app, prisma, 'SALES_REP');
      const id = await newDeal(undefined, leaver.id);
      await move(id, { stageId: 'stage-qualified', stageComment: 'handover note' }, leaver).expect(200);

      await deleteTestUsers(prisma, [leaver]);

      const rows = await history(id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ comment: 'handover note', userName: 'E2E User', userId: null });
    });

    it('refuses to delete a stage that has history, instead of losing it', async () => {
      const stage = await prisma.dealStage.create({ data: { name: `E2E stage ${Date.now()}`, isActive: true } });
      const id = await newDeal();
      await move(id, { stageId: stage.id, stageComment: 'into the new stage' }).expect(200);
      await move(id, { stageId: 'stage-lead', stageComment: 'and out again' }).expect(200);
      await expect(prisma.dealStage.delete({ where: { id: stage.id } })).rejects.toThrow();
      // Clean up: remove the deal (and its history), then the stage can go.
      await prisma.deal.delete({ where: { id } });
      await prisma.dealStage.delete({ where: { id: stage.id } });
    });
  });
});
