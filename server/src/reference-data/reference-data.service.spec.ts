import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ReferenceDataService } from './reference-data.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * These tests exercise the service's own logic (which list is which, how the
 * default is moved, how reorder validates, how database-rule failures become
 * plain messages). The database triggers themselves are covered in
 * guards.spec.ts.
 */
describe('ReferenceDataService', () => {
  let service: ReferenceDataService;
  let prisma: any;

  // A reusable fake of one Prisma model delegate.
  const modelMock = () => ({
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    aggregate: jest.fn().mockResolvedValue({ _max: { sortOrder: -1 } }),
    groupBy: jest.fn().mockResolvedValue([]),
  });

  beforeEach(async () => {
    prisma = {
      industry: modelMock(),
      dealStage: modelMock(),
      contactType: modelMock(),
      taskStatus: modelMock(),
      taskPriority: modelMock(),
      deal: { groupBy: jest.fn().mockResolvedValue([]) },
      contact: { groupBy: jest.fn().mockResolvedValue([]) },
      task: { groupBy: jest.fn().mockResolvedValue([]) },
      companyIndustry: { groupBy: jest.fn().mockResolvedValue([]) },
      referenceFieldSetting: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
      $transaction: jest.fn((ops: any[]) => Promise.all(ops)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ReferenceDataService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(ReferenceDataService);
  });

  describe('catalog', () => {
    it('describes every list and reports the multiple-selection flag', async () => {
      prisma.referenceFieldSetting.findMany.mockResolvedValue([
        { fieldKey: 'company.industry', allowMultiple: true },
      ]);

      const { lists } = await service.catalog();

      expect(lists.map((l) => l.key)).toEqual([
        'industries',
        'deal-stages',
        'contact-types',
        'task-statuses',
        'task-priorities',
      ]);

      const industries = lists.find((l) => l.key === 'industries')!;
      expect(industries.multiField).toBe('company.industry');
      expect(industries.allowMultiple).toBe(true);

      // Lists without a multi field report null rather than false.
      const stages = lists.find((l) => l.key === 'deal-stages')!;
      expect(stages.multiField).toBeNull();
      expect(stages.allowMultiple).toBeNull();
      expect(stages.required).toBe(true);
    });
  });

  describe('list', () => {
    it('returns values annotated with their usage counts', async () => {
      prisma.dealStage.findMany.mockResolvedValue([
        { id: 'stage-lead', name: 'Lead' },
        { id: 'stage-won', name: 'Won' },
      ]);
      prisma.deal.groupBy.mockResolvedValue([{ stageId: 'stage-lead', _count: { _all: 3 } }]);

      const result = await service.list('deal-stages');

      expect(result.key).toBe('deal-stages');
      const lead = result.values.find((v: any) => v.id === 'stage-lead');
      const won = result.values.find((v: any) => v.id === 'stage-won');
      expect(lead.inUse).toBe(true);
      expect(lead.usageCount).toBe(3);
      expect(won.inUse).toBe(false);
      expect(won.usageCount).toBe(0);
    });

    it('counts industry usage through the join table', async () => {
      prisma.industry.findMany.mockResolvedValue([{ id: 'ind-saas', name: 'SaaS' }]);
      prisma.companyIndustry.groupBy.mockResolvedValue([{ industryId: 'ind-saas', _count: { _all: 2 } }]);

      const result = await service.list('industries');
      expect(result.values[0].usageCount).toBe(2);
    });

    it('rejects an unknown list', async () => {
      await expect(service.list('nope')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('appends the new value at the end of the sort order', async () => {
      prisma.taskPriority.aggregate.mockResolvedValue({ _max: { sortOrder: 4 } });
      prisma.taskPriority.create.mockResolvedValue({ id: 'new', name: 'Critical' });

      await service.create('task-priorities', { name: '  Critical  ' } as any);

      expect(prisma.taskPriority.create).toHaveBeenCalledWith({
        data: { name: 'Critical', sortOrder: 5 },
      });
    });

    it('only writes columns the list actually supports', async () => {
      prisma.industry.aggregate.mockResolvedValue({ _max: { sortOrder: null } });
      prisma.industry.create.mockResolvedValue({ id: 'x' });

      // outcome/isDone/isDefault are not valid for industries and are dropped.
      await service.create('industries', { name: 'Retail', outcome: 'WON', isDefault: true } as any);

      const data = prisma.industry.create.mock.calls[0][0].data;
      expect(data).toEqual({ name: 'Retail', sortOrder: 0 });
    });
  });

  describe('update', () => {
    it('clears the previous default before setting a new one', async () => {
      prisma.dealStage.findUnique.mockResolvedValue({ id: 'stage-won' });
      prisma.dealStage.update.mockResolvedValue({ id: 'stage-won', isDefault: true });

      await service.update('deal-stages', 'stage-won', { isDefault: true } as any);

      expect(prisma.dealStage.updateMany).toHaveBeenCalledWith({
        where: { isDefault: true, NOT: { id: 'stage-won' } },
        data: { isDefault: false },
      });
      // Then the chosen value is updated.
      expect(prisma.dealStage.update).toHaveBeenCalledWith({
        where: { id: 'stage-won' },
        data: { isDefault: true },
      });
    });

    it('404s when the value is not in the list', async () => {
      prisma.taskStatus.findUnique.mockResolvedValue(null);
      await expect(service.update('task-statuses', 'ghost', { name: 'x' } as any)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('translates a database guard failure into a plain message', async () => {
      prisma.taskStatus.findUnique.mockResolvedValue({ id: 'status-todo' });
      prisma.taskStatus.update.mockRejectedValue(new Error('CRM_REF: Keep at least one active task status'));

      await expect(
        service.update('task-statuses', 'status-todo', { isActive: false } as any),
      ).rejects.toMatchObject({ message: 'Keep at least one active task status' });
    });
  });

  describe('remove', () => {
    it('turns a foreign-key failure into a retire-instead message', async () => {
      prisma.dealStage.findUnique.mockResolvedValue({ id: 'stage-lead' });
      prisma.dealStage.delete.mockRejectedValue(new Error('FOREIGN KEY constraint failed'));

      await expect(service.remove('deal-stages', 'stage-lead')).rejects.toMatchObject({
        message: expect.stringMatching(/in use/i),
      });
    });

    it('reports success when the value is deletable', async () => {
      prisma.dealStage.findUnique.mockResolvedValue({ id: 'stage-extra' });
      prisma.dealStage.delete.mockResolvedValue({});
      expect(await service.remove('deal-stages', 'stage-extra')).toEqual({ success: true });
    });
  });

  describe('reorder', () => {
    it('rejects a list that does not cover every value exactly once', async () => {
      prisma.taskPriority.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
      await expect(service.reorder('task-priorities', ['a', 'b'])).rejects.toThrow(BadRequestException);
    });

    it('writes the new sort order positionally', async () => {
      prisma.taskPriority.findMany
        .mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }, { id: 'c' }]) // validation read
        .mockResolvedValue([]); // the list() refetch at the end
      prisma.taskPriority.update.mockResolvedValue({});

      await service.reorder('task-priorities', ['c', 'a', 'b']);

      expect(prisma.taskPriority.update).toHaveBeenCalledWith({ where: { id: 'c' }, data: { sortOrder: 0 } });
      expect(prisma.taskPriority.update).toHaveBeenCalledWith({ where: { id: 'a' }, data: { sortOrder: 1 } });
      expect(prisma.taskPriority.update).toHaveBeenCalledWith({ where: { id: 'b' }, data: { sortOrder: 2 } });
    });
  });

  describe('setMultiple', () => {
    it('upserts the setting for a list that supports it', async () => {
      await service.setMultiple('industries', true);
      expect(prisma.referenceFieldSetting.upsert).toHaveBeenCalledWith({
        where: { fieldKey: 'company.industry' },
        create: { fieldKey: 'company.industry', allowMultiple: true },
        update: { allowMultiple: true },
      });
    });

    it('refuses lists that do not support multiple selection', async () => {
      await expect(service.setMultiple('deal-stages', true)).rejects.toThrow(BadRequestException);
    });
  });

  describe('defaultId', () => {
    it('returns the id of the default value', async () => {
      prisma.dealStage.findFirst.mockResolvedValue({ id: 'stage-lead' });
      expect(await service.defaultId('dealStage')).toBe('stage-lead');
    });

    it('explains when no default is set', async () => {
      prisma.taskStatus.findFirst.mockResolvedValue(null);
      await expect(service.defaultId('taskStatus')).rejects.toThrow(BadRequestException);
    });
  });

  describe('isMultiple', () => {
    it('reads the stored flag, defaulting to false', async () => {
      prisma.referenceFieldSetting.findUnique.mockResolvedValue(null);
      expect(await service.isMultiple('company.industry')).toBe(false);

      prisma.referenceFieldSetting.findUnique.mockResolvedValue({ allowMultiple: true });
      expect(await service.isMultiple('company.industry')).toBe(true);
    });
  });
});
