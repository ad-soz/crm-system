import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bearer, createTestApp, createTestUser, deleteTestUsers, TestUser } from './helpers';

/**
 * The rows behind the dashboard cards. The test that matters most: the figures on the
 * cards and the rows you can drill into must agree, to the cent.
 */
describe('Analyse: the rows behind the dashboard cards (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: TestUser;
  let limited: TestUser;
  const profileIds: string[] = [];
  let companyId: string;
  let personId: string;
  let openDealId: string;
  let wonDealId: string;
  let contactId: string;

  const http = () => request(app.getHttpServer());
  const get = async (url: string, who: TestUser = admin) => (await http().get(url).set(bearer(who)).expect(200)).body;
  const post = async (url: string, body: object) => (await http().post(url).set(bearer(admin)).send(body).expect(201)).body;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    admin = await createTestUser(app, prisma, 'ADMIN');
    const profile = await http().post('/api/role-profiles').set(bearer(admin)).send({ name: `Deals only ${Date.now()}`, permissions: ['deals.view'] }).expect(201);
    profileIds.push(profile.body.id);
    limited = await createTestUser(app, prisma, profile.body.id);

    companyId = (await post('/api/companies', { name: 'Analyse Co', industryIds: ['ind-technology'] })).id;
    personId = (await post('/api/people', { firstName: 'Ana', lastName: 'Lyse', title: 'Buyer', companyId })).id;
    openDealId = (await post('/api/deals', { title: 'Open Deal', amount: 10000, companyId, personId, expectedCloseDate: '2027-03-15' })).id;
    wonDealId = (await post('/api/deals', { title: 'Won Deal', amount: 4000, companyId, personId })).id;
    await http().patch(`/api/deals/${wonDealId}`).set(bearer(admin)).send({ stageId: 'stage-won', stageComment: 'Signed' }).expect(200);
    contactId = (await post('/api/contacts', { typeId: 'type-call', subject: 'Analyse call', personId, dealId: openDealId })).id;
    await post('/api/tasks', { title: 'Analyse task', dealId: openDealId, personId });
  });

  afterAll(async () => {
    await prisma.task.deleteMany({ where: { dealId: { in: [openDealId, wonDealId] } } });
    await prisma.contact.deleteMany({ where: { id: contactId } });
    await prisma.deal.deleteMany({ where: { id: { in: [openDealId, wonDealId] } } });
    await prisma.person.deleteMany({ where: { id: personId } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await deleteTestUsers(prisma, [admin, limited]);
    await prisma.roleProfile.deleteMany({ where: { id: { in: profileIds } } });
    await app.close();
  });

  describe('the cards and the rows agree', () => {
    it('Open Deals: the number of open rows equals the card', async () => {
      const [dash, deals] = await Promise.all([get('/api/dashboard'), get('/api/analyse/deals')]);
      const open = deals.rows.filter((r: any) => r.outcome === 'OPEN');
      expect(open.length).toBe(dash.openDeals);
    });

    it('Pipeline Value: the open amounts add up to the card', async () => {
      const [dash, deals] = await Promise.all([get('/api/dashboard'), get('/api/analyse/deals')]);
      const sum = deals.rows.filter((r: any) => r.outcome === 'OPEN').reduce((s: number, r: any) => s + r.amount, 0);
      expect(sum).toBeCloseTo(dash.pipelineValue, 2);
    });

    it('Weighted Forecast: the expected values add up to the card', async () => {
      const [dash, deals] = await Promise.all([get('/api/dashboard'), get('/api/analyse/deals')]);
      const sum = deals.rows.reduce((s: number, r: any) => s + (r.expected ?? 0), 0);
      expect(sum).toBeCloseTo(dash.forecast.weighted, 1);
      // And matches a hand calculation from the stage list.
      const stages = (await get('/api/reference/deal-stages')).values;
      const chance = new Map<string, number>(stages.map((s: any) => [s.id, s.winChance]));
      const stageOf = new Map<string, string>(deals.rows.map((r: any) => [r.id, r.stage]));
      const byName = new Map<string, number>(stages.map((s: any) => [s.name, chance.get(s.id)!]));
      const hand = deals.rows.filter((r: any) => r.outcome === 'OPEN').reduce((s: number, r: any) => s + (r.amount * byName.get(stageOf.get(r.id)!)!) / 100, 0);
      expect(sum).toBeCloseTo(hand, 1);
    });

    it('Total People and Total Companies: one row each', async () => {
      const [dash, people, companies] = await Promise.all([get('/api/dashboard'), get('/api/analyse/people'), get('/api/analyse/companies')]);
      expect(people.rows.length).toBe(dash.totalPeople);
      expect(companies.rows.length).toBe(dash.totalCompanies);
      expect(people.total).toBe(dash.totalPeople);
      expect(people.truncated).toBe(false);
    });
  });

  describe('what each row carries', () => {
    it('a deal: names, stage, amount, expected value, close date, last contact and task counts', async () => {
      const row = (await get('/api/analyse/deals')).rows.find((r: any) => r.id === openDealId);
      expect(row).toMatchObject({
        title: 'Open Deal',
        company: 'Analyse Co',
        person: 'Ana Lyse',
        stage: 'Lead',
        outcome: 'OPEN',
        amount: 10000,
        contacts: 1,
        tasks: 1,
        openTasks: 1,
      });
      expect(row.expected).toBe((10000 * row.winChance) / 100);
      expect(row.expectedCloseDate.slice(0, 10)).toBe('2027-03-15');
      expect(row.lastContactAt).toEqual(expect.any(String));
    });

    it('a won deal has no expected value, because there is nothing left to win', async () => {
      const row = (await get('/api/analyse/deals')).rows.find((r: any) => r.id === wonDealId);
      expect(row).toMatchObject({ outcome: 'WON', stage: 'Won', amount: 4000, expected: null, winChance: null });
    });

    it('a person: company, title, and their open deals and tasks', async () => {
      const row = (await get('/api/analyse/people')).rows.find((r: any) => r.id === personId);
      expect(row).toMatchObject({ name: 'Ana Lyse', title: 'Buyer', company: 'Analyse Co', openDeals: 1, openDealValue: 10000, contacts: 1, openTasks: 1 });
    });

    it('a company: industries, people, and its open and total deals', async () => {
      const row = (await get('/api/analyse/companies')).rows.find((r: any) => r.id === companyId);
      expect(row).toMatchObject({ name: 'Analyse Co', industries: ['Technology'], people: 1, deals: 2, openDeals: 1, openDealValue: 10000 });
    });
  });

  describe('permissions', () => {
    it('is refused for an area the role profile does not include', async () => {
      await http().get('/api/analyse/people').set(bearer(limited)).expect(403);
      await http().get('/api/analyse/companies').set(bearer(limited)).expect(403);
    });

    it('leaves out the figures from areas the person may not see', async () => {
      const row = (await get('/api/analyse/deals', limited)).rows.find((r: any) => r.id === openDealId);
      expect(row.title).toBe('Open Deal');
      expect(row.contacts).toBeNull();
      expect(row.lastContactAt).toBeNull();
      expect(row.tasks).toBeNull();
      expect(row.openTasks).toBeNull();
    });

    it('needs sign-in, and refuses an unknown subject', async () => {
      await http().get('/api/analyse/deals').expect(401);
      await http().get('/api/analyse/passwords').set(bearer(admin)).expect(404);
    });
  });

  it('does not change anything', async () => {
    const before = await prisma.auditLog.count();
    await get('/api/analyse/deals');
    await get('/api/analyse/people');
    await get('/api/analyse/companies');
    expect(await prisma.auditLog.count()).toBe(before);
  });
});
