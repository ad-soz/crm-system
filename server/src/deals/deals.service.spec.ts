import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { DealsService } from './deals.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReferenceDataService } from '../reference-data/reference-data.service';

describe('DealsService', () => {
  let service: DealsService;
  let prisma: any;
  let ref: any;

  beforeEach(async () => {
    prisma = {
      deal: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        groupBy: jest.fn(),
      },
      dealStage: { findMany: jest.fn(), findUnique: jest.fn() },
      dealStageChange: { create: jest.fn(), findMany: jest.fn() },
      $transaction: jest.fn((cb: any) => cb(prisma)),
      company: { findUnique: jest.fn() },
      person: { findUnique: jest.fn() },
    };
    ref = { defaultId: jest.fn().mockResolvedValue('stage-lead') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DealsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ReferenceDataService, useValue: ref },
      ],
    }).compile();

    service = module.get(DealsService);
  });

  it('uses the list default stage when none is given', async () => {
    prisma.deal.create.mockResolvedValue({ id: '1', title: 'Deal' });
    await service.create({ title: 'Deal', amount: 1000 }, 'user-1');
    expect(ref.defaultId).toHaveBeenCalledWith('dealStage');
    expect(prisma.deal.create.mock.calls[0][0].data.stageId).toBe('stage-lead');
  });

  it('uses the given stage id without looking up a default', async () => {
    prisma.deal.create.mockResolvedValue({ id: '1' });
    await service.create({ title: 'Deal', amount: 1000, stageId: 'stage-won' }, 'user-1');
    expect(ref.defaultId).not.toHaveBeenCalled();
    expect(prisma.deal.create.mock.calls[0][0].data.stageId).toBe('stage-won');
  });

  it('reports a bad stage from the database as a clear message', async () => {
    prisma.deal.create.mockRejectedValue(new Error('FOREIGN KEY constraint failed'));
    await expect(service.create({ title: 'D', amount: 1, stageId: 'nope' }, 'user-1')).rejects.toThrow(
      /deal stage does not exist/,
    );
  });

  it('rejects a deal referencing a missing company', async () => {
    prisma.company.findUnique.mockResolvedValue(null);
    await expect(
      service.create({ title: 'Deal', amount: 1000, companyId: 'missing' }, 'user-1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('filters deals by stage id', async () => {
    prisma.deal.findMany.mockResolvedValue([]);
    prisma.deal.count.mockResolvedValue(0);
    await service.findAll(1, 100, 'stage-won');
    expect(prisma.deal.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { stageId: 'stage-won' } }));
  });

  it('aggregates the pipeline across every stage in list order', async () => {
    prisma.dealStage.findMany.mockResolvedValue([
      { id: 'stage-lead', name: 'Lead', sortOrder: 0 },
      { id: 'stage-proposal', name: 'Proposal', sortOrder: 1 },
    ]);
    prisma.deal.groupBy.mockResolvedValue([{ stageId: 'stage-lead', _count: { _all: 2 }, _sum: { amount: 5000 } }]);
    const result = await service.pipeline();
    expect(result.length).toBe(2);
    expect(result[0]).toMatchObject({ count: 2, value: 5000 });
    expect(result[0].stage.name).toBe('Lead');
    expect(result[1]).toMatchObject({ count: 0, value: 0 });
  });

  describe('moving a deal to another stage', () => {
    const user = { id: 'u1', firstName: 'Sarah', lastName: 'Admin', email: 's@x.com' };

    beforeEach(() => {
      prisma.deal.findUnique.mockResolvedValue({ id: '1', stageId: 'stage-lead' });
      prisma.dealStage.findUnique.mockResolvedValue({ id: 'stage-qualified', isActive: true });
      prisma.deal.update.mockResolvedValue({ id: '1', stageId: 'stage-qualified' });
    });

    it('refuses a move with no comment, and changes nothing', async () => {
      await expect(service.update('1', { stageId: 'stage-qualified' } as any, user)).rejects.toThrow(/Add a comment/);
      expect(prisma.dealStageChange.create).not.toHaveBeenCalled();
      expect(prisma.deal.update).not.toHaveBeenCalled();
    });

    it('refuses a comment that is only spaces', async () => {
      await expect(
        service.update('1', { stageId: 'stage-qualified', stageComment: '   \n ' } as any, user),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.deal.update).not.toHaveBeenCalled();
    });

    it('saves the comment with who, from and to, then moves the deal, in one step', async () => {
      const order: string[] = [];
      prisma.dealStageChange.create.mockImplementation(async () => void order.push('record'));
      prisma.deal.update.mockImplementation(async () => (order.push('move'), { id: '1', stageId: 'stage-qualified' }));

      const result = await service.update('1', { stageId: 'stage-qualified', stageComment: '  Budget signed off  ' } as any, user);

      expect(result.stageId).toBe('stage-qualified');
      // The record is written first, so the database allows the move that follows.
      expect(order).toEqual(['record', 'move']);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.dealStageChange.create).toHaveBeenCalledWith({
        data: {
          dealId: '1',
          fromStageId: 'stage-lead',
          toStageId: 'stage-qualified',
          userId: 'u1',
          userName: 'Sarah Admin',
          comment: 'Budget signed off',
        },
      });
    });

    it('keeps the comment off the deal itself', async () => {
      await service.update('1', { stageId: 'stage-qualified', stageComment: 'Why', title: 'Renamed' } as any, user);
      const data = prisma.deal.update.mock.calls[0][0].data;
      expect(data).toEqual({ stageId: 'stage-qualified', title: 'Renamed' });
      expect('stageComment' in data).toBe(false);
    });

    it('does not ask for a comment when the stage is not changing', async () => {
      prisma.deal.update.mockResolvedValue({ id: '1', title: 'Renamed' });
      await service.update('1', { title: 'Renamed' } as any, user);
      // Sending the same stage again is not a move either.
      await service.update('1', { stageId: 'stage-lead', title: 'Renamed' } as any, user);
      expect(prisma.dealStageChange.create).not.toHaveBeenCalled();
      expect(prisma.deal.update).toHaveBeenCalledTimes(2);
    });

    it('refuses a move to a stage that does not exist, or that is retired', async () => {
      prisma.dealStage.findUnique.mockResolvedValueOnce(null);
      await expect(service.update('1', { stageId: 'nope', stageComment: 'x' } as any, user)).rejects.toThrow(/does not exist/);
      prisma.dealStage.findUnique.mockResolvedValueOnce({ id: 'stage-old', isActive: false });
      await expect(service.update('1', { stageId: 'stage-old', stageComment: 'x' } as any, user)).rejects.toThrow(/retired/);
      expect(prisma.dealStageChange.create).not.toHaveBeenCalled();
    });

    it('refuses a move with nobody to record it against', async () => {
      await expect(service.update('1', { stageId: 'stage-qualified', stageComment: 'x' } as any)).rejects.toThrow(/signed-in user/);
    });

    it('falls back to the email, then a placeholder, when a user has no name', async () => {
      await service.update('1', { stageId: 'stage-qualified', stageComment: 'x' } as any, { id: 'u2', email: 'a@b.com' });
      expect(prisma.dealStageChange.create.mock.calls[0][0].data.userName).toBe('a@b.com');
      await service.update('1', { stageId: 'stage-qualified', stageComment: 'x' } as any, { id: 'u3' });
      expect(prisma.dealStageChange.create.mock.calls[1][0].data.userName).toBe('Unknown user');
    });
  });

  describe('history', () => {
    it('lists a deal\'s moves newest first', async () => {
      prisma.deal.findUnique.mockResolvedValue({ id: '1' });
      prisma.dealStageChange.findMany.mockResolvedValue([{ id: 'c2' }, { id: 'c1' }]);
      const rows = await service.history('1');
      expect(rows).toHaveLength(2);
      const args = prisma.dealStageChange.findMany.mock.calls[0][0];
      expect(args.where).toEqual({ dealId: '1' });
      expect(args.orderBy[0]).toEqual({ createdAt: 'desc' });
    });

    it('404s for a deal that does not exist', async () => {
      prisma.deal.findUnique.mockResolvedValue(null);
      await expect(service.history('missing')).rejects.toThrow(NotFoundException);
    });
  });

  it('throws 404 for a missing deal', async () => {
    prisma.deal.findUnique.mockResolvedValue(null);
    await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
  });

  it('deletes a deal', async () => {
    prisma.deal.findUnique.mockResolvedValue({ id: '1' });
    prisma.deal.delete.mockResolvedValue({});
    expect((await service.remove('1')).success).toBe(true);
  });
});
