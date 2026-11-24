import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  let service: PrismaService;

  beforeAll(async () => {
    service = new PrismaService();
    await service.$connect();
  });

  afterAll(async () => {
    await service.$disconnect();
  });

  it('should connect to the database', async () => {
    const result = await service.$queryRaw`SELECT 1 as value`;
    expect(result).toBeDefined();
  });

  // Note: these assert the seed produced at least the expected records.
  // Exact equality is avoided because e2e suites share this dev database and
  // may add rows; the seed script itself is what guarantees the exact counts.
  it('should have seeded data in users table', async () => {
    const users = await service.user.findMany();
    expect(users.length).toBeGreaterThanOrEqual(2);
  });

  it('should have seeded data in companies table', async () => {
    const companies = await service.company.findMany();
    expect(companies.length).toBeGreaterThanOrEqual(3);
  });

  it('should have seeded data in people table', async () => {
    const people = await service.person.findMany();
    expect(people.length).toBeGreaterThanOrEqual(5);
  });

  it('should have seeded data in deals table', async () => {
    const deals = await service.deal.findMany();
    expect(deals.length).toBeGreaterThanOrEqual(4);
  });

  it('should have seeded data in contacts table', async () => {
    const contacts = await service.contact.findMany();
    expect(contacts.length).toBeGreaterThanOrEqual(4);
  });

  it('should have seeded data in tasks table', async () => {
    const tasks = await service.task.findMany();
    expect(tasks.length).toBeGreaterThanOrEqual(4);
  });
});
