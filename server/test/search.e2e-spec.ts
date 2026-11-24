import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bearer, createTestApp, createTestUser, deleteTestUsers, TestUser } from './helpers';

/**
 * Global search, against the real stack. The screen draws every label and sublabel as text, so
 * every one of them must be a plain string: an object here once blanked the whole page.
 */
describe('Global search (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: TestUser;
  let dealsOnly: TestUser;
  const profileIds: string[] = [];
  let companyId: string;
  let personId: string;
  let dealId: string;

  const http = () => request(app.getHttpServer());
  const search = async (q: string, who: TestUser = admin) => (await http().get('/api/search').query({ q }).set(bearer(who)).expect(200)).body;
  const post = async (url: string, body: object) => (await http().post(url).set(bearer(admin)).send(body).expect(201)).body;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    admin = await createTestUser(app, prisma, 'ADMIN');
    const profile = await http().post('/api/role-profiles').set(bearer(admin)).send({ name: `Deals only ${Date.now()}`, permissions: ['deals.view'] }).expect(201);
    profileIds.push(profile.body.id);
    dealsOnly = await createTestUser(app, prisma, profile.body.id);

    companyId = (await post('/api/companies', { name: 'Zorblax Industries' })).id;
    personId = (await post('/api/people', { firstName: 'Quentin', lastName: 'Zorblax', email: 'quentin@zorblax.test', companyId })).id;
    dealId = (await post('/api/deals', { title: 'Zorblax Renewal', amount: 42000, companyId, personId })).id;
  });

  afterAll(async () => {
    await prisma.deal.deleteMany({ where: { id: dealId } });
    await prisma.person.deleteMany({ where: { id: personId } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await deleteTestUsers(prisma, [admin, dealsOnly]);
    await prisma.roleProfile.deleteMany({ where: { id: { in: profileIds } } });
    await app.close();
  });

  const everyItem = (body: any) => [...body.people, ...body.companies, ...body.deals];

  it('finds a record of each kind', async () => {
    const body = await search('zorblax');
    expect(body.people.map((p: any) => p.id)).toEqual([personId]);
    expect(body.companies.map((c: any) => c.id)).toEqual([companyId]);
    expect(body.deals.map((d: any) => d.id)).toEqual([dealId]);
  });

  it('sends only plain text for every label and sublabel, so the screen can always draw them', async () => {
    const body = await search('zorblax');
    expect(everyItem(body).length).toBeGreaterThan(0);
    for (const item of everyItem(body)) {
      expect(typeof item.label).toBe('string');
      expect(item.sublabel === undefined || typeof item.sublabel === 'string').toBe(true);
    }
  });

  it('describes a deal by its stage name and amount, not by the stage record', async () => {
    const [deal] = (await search('Renewal')).deals;
    expect(deal).toMatchObject({ type: 'deal', id: dealId, label: 'Zorblax Renewal' });
    expect(deal.sublabel).toContain('Lead');
    expect(deal.sublabel).toContain('$42,000');
  });

  it('describes a person by their email and company', async () => {
    const [person] = (await search('quentin')).people;
    expect(person.sublabel).toContain('quentin@zorblax.test');
    expect(person.sublabel).toContain('Zorblax Industries');
  });

  it('finds a person by their full name, in either order', async () => {
    expect((await search('Quentin Zorblax')).people.map((p: any) => p.id)).toEqual([personId]);
    expect((await search('zorblax quentin')).people.map((p: any) => p.id)).toEqual([personId]);
    expect((await search('Quen Zor')).people.map((p: any) => p.id)).toEqual([personId]);
  });

  it('needs every word to match, so extra words narrow the result', async () => {
    expect((await search('Quentin Nobody')).people).toEqual([]);
  });

  it('finds a deal by its company, and a person by their company', async () => {
    expect((await search('Zorblax Industries')).deals.map((d: any) => d.id)).toEqual([dealId]);
    expect((await search('Industries')).people.map((p: any) => p.id)).toEqual([personId]);
  });

  it('ignores case', async () => {
    expect((await search('ZORBLAX')).companies).toHaveLength(1);
  });

  it('returns nothing, and not an error, for an empty or blank search', async () => {
    expect(await search('')).toEqual({ people: [], companies: [], deals: [] });
    expect(await search('   ')).toEqual({ people: [], companies: [], deals: [] });
  });

  it('treats search characters as plain text, not as patterns', async () => {
    // % and _ are wildcards in the database's pattern matching; a search for them must not match everything.
    expect(everyItem(await search('%'))).toEqual([]);
    expect(everyItem(await search('_'))).toEqual([]);
    expect(everyItem(await search("'; DROP TABLE deals; --"))).toEqual([]);
    expect(await prisma.deal.count({ where: { id: dealId } })).toBe(1);
  });

  it('shows at most five of each kind', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 7; i++) ids.push((await post('/api/companies', { name: `Bulkco ${i}` })).id);
    const body = await search('Bulkco');
    expect(body.companies).toHaveLength(5);
    await prisma.company.deleteMany({ where: { id: { in: ids } } });
  });

  it('only searches the areas the role profile can view', async () => {
    const body = await search('zorblax', dealsOnly);
    expect(body.people).toEqual([]);
    expect(body.companies).toEqual([]);
    expect(body.deals).toHaveLength(1);
    // The deal's company name is not given away to someone who may not view companies.
    expect(body.deals[0].sublabel).not.toContain('Zorblax Industries');
  });

  it('needs sign-in', async () => {
    await http().get('/api/search').query({ q: 'zorblax' }).expect(401);
  });

  it('records nothing in the audit log, because searching changes nothing', async () => {
    const before = await prisma.auditLog.count();
    await search('zorblax');
    expect(await prisma.auditLog.count()).toBe(before);
  });
});
