import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../prisma/prisma.service';

describe('DashboardService', () => {
  let service: DashboardService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      person: { count: jest.fn() },
      company: { count: jest.fn() },
      deal: { count: jest.fn(), aggregate: jest.fn(), groupBy: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      dealStage: { findMany: jest.fn() },
      taskStatus: { findMany: jest.fn() },
      task: { findMany: jest.fn(), count: jest.fn().mockResolvedValue(0) },
      contact: { findMany: jest.fn(), groupBy: jest.fn().mockResolvedValue([]) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [DashboardService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(DashboardService);
  });

  it('should aggregate dashboard metrics', async () => {
    prisma.person.count.mockResolvedValue(5);
    prisma.company.count.mockResolvedValue(3);
    prisma.deal.count.mockResolvedValue(4);
    prisma.deal.aggregate.mockResolvedValue({ _sum: { amount: 255000 } });
    // Three stages exist; open stages are lead + won is closed etc. For this
    // test two are OPEN and feed the open-deal queries.
    prisma.dealStage.findMany.mockImplementation(({ where }: any) => {
      if (where?.outcome === 'OPEN') {
        return Promise.resolve([
          { id: 'stage-lead', winChance: 10 },
          { id: 'stage-negotiation', winChance: 75 },
        ]);
      }
      // The ordered list of all stages used for the per-stage breakdown.
      return Promise.resolve([
        { id: 'stage-lead', name: 'Lead' },
        { id: 'stage-negotiation', name: 'Negotiation' },
        { id: 'stage-won', name: 'Won' },
      ]);
    });
    prisma.taskStatus.findMany.mockResolvedValue([{ id: 'status-done' }]);
    prisma.deal.groupBy.mockResolvedValue([
      { stageId: 'stage-lead', _count: { _all: 1 }, _sum: { amount: 15000 } },
    ]);
    prisma.task.findMany.mockResolvedValue([{ id: 't1' }]);
    prisma.contact.findMany.mockResolvedValue([{ id: 'a1' }]);
    prisma.deal.findMany.mockResolvedValue([
      { amount: 15000, expectedCloseDate: null, stageId: 'stage-lead' }, // 1,500
      { amount: 75000, expectedCloseDate: new Date('2099-01-15T00:00:00Z'), stageId: 'stage-negotiation' }, // 56,250
    ]);

    const result = await service.getSummary('user-1');

    expect(result.totalPeople).toBe(5);
    expect(result.totalCompanies).toBe(3);
    expect(result.openDeals).toBe(4);
    expect(result.pipelineValue).toBe(255000);
    // One entry per stage; the stage that had deals carries the count/value.
    expect(result.dealsByStage?.length).toBe(3);
    const lead = result.dealsByStage?.find((d: any) => d.stage.id === 'stage-lead');
    expect(lead?.count).toBe(1);
    expect(lead?.value).toBe(15000);
    expect(result.upcomingTasks?.length).toBe(1);
    expect(result.recentContacts?.length).toBe(1);

    // Forecast: 15,000 x 10% + 75,000 x 75% = 57,750 from 90,000 of open deals.
    expect(result.forecast).toMatchObject({ count: 2, total: 90000, weighted: 57750 });
    expect(result.forecast?.rows.map((r) => r.key)).toEqual(['2099-01', 'none']);
    // Only open deals feed it.
    expect(prisma.deal.findMany.mock.calls[0][0].where).toEqual({ stageId: { in: ['stage-lead', 'stage-negotiation'] } });
  });

  it('should restrict open-deal queries to OPEN stage ids', async () => {
    prisma.person.count.mockResolvedValue(0);
    prisma.company.count.mockResolvedValue(0);
    prisma.deal.count.mockResolvedValue(0);
    prisma.deal.aggregate.mockResolvedValue({ _sum: { amount: null } });
    prisma.deal.groupBy.mockResolvedValue([]);
    prisma.dealStage.findMany.mockImplementation(({ where }: any) =>
      Promise.resolve(where?.outcome === 'OPEN' ? [{ id: 'stage-lead' }] : []),
    );
    prisma.taskStatus.findMany.mockResolvedValue([{ id: 'status-done' }]);
    prisma.task.findMany.mockResolvedValue([]);
    prisma.contact.findMany.mockResolvedValue([]);

    const result = await service.getSummary('user-1');
    expect(result.pipelineValue).toBe(0);

    // Count and pipeline aggregate are both scoped to the OPEN stage ids,
    // which excludes WON/LOST because those are not outcome OPEN.
    const countCall = prisma.deal.count.mock.calls[0][0];
    expect(countCall.where.stageId.in).toEqual(['stage-lead']);
    const aggCall = prisma.deal.aggregate.mock.calls[0][0];
    expect(aggCall.where.stageId.in).toEqual(['stage-lead']);

    // Upcoming tasks exclude done statuses by id.
    const taskCall = prisma.task.findMany.mock.calls[0][0];
    expect(taskCall.where.statusId.notIn).toEqual(['status-done']);
  });
});

describe('DashboardService needs-attention', () => {
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
  let prisma: any;
  let service: DashboardService;

  beforeEach(() => {
    prisma = {
      person: { count: jest.fn().mockResolvedValue(0) },
      company: { count: jest.fn().mockResolvedValue(0) },
      deal: {
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn(),
      },
      dealStage: { findMany: jest.fn().mockResolvedValue([{ id: 's-open', winChance: 50 }]) },
      taskStatus: { findMany: jest.fn().mockResolvedValue([{ id: 'done' }]) },
      task: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      contact: { findMany: jest.fn().mockResolvedValue([]), groupBy: jest.fn() },
    };
    service = new DashboardService(prisma);
  });

  const row = (over: object) => ({
    id: 'x',
    title: 'X',
    amount: 1000,
    expectedCloseDate: null,
    stageId: 's-open',
    ownerId: 'me',
    personId: null,
    createdAt: daysAgo(60),
    ...over,
  });

  it('finds my quiet and past-due deals, using the latest contact on the deal or its person', async () => {
    prisma.deal.findMany.mockResolvedValue([
      row({ id: 'quiet', title: 'Quiet one' }),
      row({ id: 'warm', title: 'Recently called', personId: 'c1' }),
      row({ id: 'late', title: 'Late one', createdAt: daysAgo(2), expectedCloseDate: new Date(Date.UTC(2020, 0, 1)) }),
      row({ id: 'theirs', title: 'Not mine', ownerId: 'someone-else' }),
    ]);
    prisma.contact.groupBy.mockImplementation(({ by }: any) =>
      Promise.resolve(by[0] === 'personId' ? [{ personId: 'c1', _max: { createdAt: daysAgo(1) } }] : []),
    );

    const { attention } = await service.getSummary('me');

    expect(attention.staleDeals!.items.map((d) => d.id)).toEqual(['quiet']);
    expect(attention.pastDueDeals!.items.map((d) => d.id)).toEqual(['late']);
    // Other people's deals are never looked at, so no contact is fetched for them.
    const askedDeals = prisma.contact.groupBy.mock.calls.find((c: any) => c[0].by[0] === 'dealId')[0].where.dealId.in;
    expect(askedDeals).not.toContain('theirs');
  });

  it('lists my overdue open tasks, oldest first, with the full count', async () => {
    prisma.deal.findMany.mockResolvedValue([]);
    prisma.task.count.mockResolvedValue(7);
    prisma.task.findMany.mockImplementation((args: any) =>
      Promise.resolve(args.where.dueDate?.lt ? [{ id: 't1', title: 'Chase invoice' }] : []),
    );

    const { attention } = await service.getSummary('me');
    expect(attention.overdueTasks).toEqual({ count: 7, items: [{ id: 't1', title: 'Chase invoice' }] });

    const where = prisma.task.count.mock.calls[0][0].where;
    expect(where.assigneeId).toBe('me');
    expect(where.statusId).toEqual({ notIn: ['done'] }); // done tasks never appear
    expect(where.dueDate.lt).toBeInstanceOf(Date);
    const call = prisma.task.findMany.mock.calls.find((c: any) => c[0].where.dueDate?.lt)[0];
    expect(call.orderBy).toEqual({ dueDate: 'asc' });
    expect(call.take).toBe(5);
  });

  it('treats a task due today as upcoming, not lost between overdue and upcoming', async () => {
    prisma.deal.findMany.mockResolvedValue([]);
    await service.getSummary('me');
    const upcoming = prisma.task.findMany.mock.calls.find((c: any) => c[0].where.dueDate?.gte)[0].where.dueDate;
    const overdue = prisma.task.count.mock.calls[0][0].where.dueDate.lt;
    // The same boundary: overdue ends where upcoming begins, with no gap.
    expect(upcoming.gte.getTime()).toBe(overdue.getTime());
    // And that boundary is the start of the local calendar day, not "now".
    const d = new Date();
    expect(overdue.getTime()).toBe(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  });

  it('reports nothing for sections the person cannot view, and does no work for them', async () => {
    const { attention } = await service.getSummary('me', ['people.view']);
    expect(attention).toEqual({ overdueTasks: null, staleDeals: null, pastDueDeals: null });
    expect(prisma.task.count).not.toHaveBeenCalled();
    expect(prisma.contact.groupBy).not.toHaveBeenCalled();
  });

  it('returns empty sections (not nulls) when everything is fine', async () => {
    prisma.deal.findMany.mockResolvedValue([row({ id: 'fine', createdAt: daysAgo(1) })]);
    prisma.contact.groupBy.mockResolvedValue([]);
    const { attention } = await service.getSummary('me');
    expect(attention.overdueTasks).toEqual({ count: 0, items: [] });
    expect(attention.staleDeals).toEqual({ count: 0, items: [] });
    expect(attention.pastDueDeals).toEqual({ count: 0, items: [] });
  });
});

describe('DashboardService permissions', () => {
  it('leaves out sections the user cannot view, without querying them', async () => {
    const prisma: any = {
      person: { count: jest.fn().mockResolvedValue(5) },
      company: { count: jest.fn() },
      deal: { count: jest.fn(), aggregate: jest.fn(), groupBy: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      // These run unconditionally to resolve the open/done flag ids.
      dealStage: { findMany: jest.fn().mockResolvedValue([]) },
      taskStatus: { findMany: jest.fn().mockResolvedValue([]) },
      task: { findMany: jest.fn(), count: jest.fn().mockResolvedValue(0) },
      contact: { findMany: jest.fn(), groupBy: jest.fn().mockResolvedValue([]) },
    };
    const service = new DashboardService(prisma);
    const result = await service.getSummary('user-1', ['people.view']);

    expect(result.totalPeople).toBe(5);
    expect(result.totalCompanies).toBeNull();
    expect(result.openDeals).toBeNull();
    expect(result.pipelineValue).toBeNull();
    expect(result.dealsByStage).toBeNull();
    expect(result.forecast).toBeNull();
    expect(prisma.deal.findMany).not.toHaveBeenCalled();
    expect(result.upcomingTasks).toBeNull();
    expect(result.recentContacts).toBeNull();
    expect(prisma.deal.count).not.toHaveBeenCalled();
    expect(prisma.task.findMany).not.toHaveBeenCalled();
  });
});
