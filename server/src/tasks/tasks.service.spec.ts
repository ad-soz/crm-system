import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReferenceDataService } from '../reference-data/reference-data.service';

describe('TasksService', () => {
  let service: TasksService;
  let prisma: any;
  let ref: any;

  beforeEach(async () => {
    prisma = {
      task: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      person: { findUnique: jest.fn() },
      deal: { findUnique: jest.fn() },
      contact: { findUnique: jest.fn() },
    };
    ref = {
      defaultId: jest.fn((model: string) => Promise.resolve(model === 'taskStatus' ? 'status-todo' : 'priority-medium')),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: PrismaService, useValue: prisma },
        { provide: ReferenceDataService, useValue: ref },
      ],
    }).compile();

    service = module.get(TasksService);
  });

  it('defaults assignee to creator and status/priority to the list defaults', async () => {
    prisma.task.create.mockResolvedValue({ id: '1', title: 'Task', assigneeId: 'user-1' });
    await service.create({ title: 'Task' }, 'user-1');
    const data = prisma.task.create.mock.calls[0][0].data;
    expect(data.assigneeId).toBe('user-1');
    expect(data.statusId).toBe('status-todo');
    expect(data.priorityId).toBe('priority-medium');
  });

  it('keeps an explicit status/priority id', async () => {
    prisma.task.create.mockResolvedValue({ id: '1' });
    await service.create({ title: 'Task', statusId: 'status-done', priorityId: 'priority-high' }, 'user-1');
    expect(ref.defaultId).not.toHaveBeenCalled();
    const data = prisma.task.create.mock.calls[0][0].data;
    expect(data.statusId).toBe('status-done');
    expect(data.priorityId).toBe('priority-high');
  });

  it('filters by status id', async () => {
    prisma.task.findMany.mockResolvedValue([]);
    prisma.task.count.mockResolvedValue(0);
    await service.findAll(1, 100, { statusId: 'status-done' });
    expect(prisma.task.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { statusId: 'status-done' } }));
  });

  it('filters by assignee', async () => {
    prisma.task.findMany.mockResolvedValue([]);
    prisma.task.count.mockResolvedValue(0);
    await service.findAll(1, 100, { assigneeId: 'user-2' });
    expect(prisma.task.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { assigneeId: 'user-2' } }));
  });

  it('updates task status id', async () => {
    prisma.task.findUnique.mockResolvedValue({ id: '1' });
    prisma.task.update.mockResolvedValue({ id: '1', statusId: 'status-in-progress' });
    const result = await service.update('1', { statusId: 'status-in-progress' });
    expect(result.statusId).toBe('status-in-progress');
  });

  describe('tasks that follow up a contact', () => {
    const contact = { id: 'c1', personId: 'p1', dealId: null };

    it('copies person and deal from the contact when none are given', async () => {
      prisma.contact.findUnique.mockResolvedValue({ ...contact, dealId: 'd1' });
      prisma.person.findUnique.mockResolvedValue({ id: 'p1' });
      prisma.task.create.mockResolvedValue({ id: '1' });
      await service.create({ title: 'T', contactId: 'c1' }, 'u1');
      const data = prisma.task.create.mock.calls[0][0].data;
      expect(data).toMatchObject({ contactId: 'c1', personId: 'p1', dealId: 'd1' });
    });

    it('refuses a different person than the contact', async () => {
      prisma.contact.findUnique.mockResolvedValue(contact);
      prisma.person.findUnique.mockResolvedValue({ id: 'p2' });
      await expect(service.create({ title: 'T', contactId: 'c1', personId: 'p2' }, 'u1')).rejects.toThrow(/different person/);
      expect(prisma.task.create).not.toHaveBeenCalled();
    });

    it('refuses a different deal than the contact', async () => {
      prisma.contact.findUnique.mockResolvedValue({ ...contact, dealId: 'd1' });
      prisma.deal.findUnique.mockResolvedValue({ id: 'd2' });
      await expect(service.create({ title: 'T', contactId: 'c1', dealId: 'd2' }, 'u1')).rejects.toThrow(/different deal/);
    });

    it('refuses an unknown contact', async () => {
      prisma.contact.findUnique.mockResolvedValue(null);
      await expect(service.create({ title: 'T', contactId: 'nope' }, 'u1')).rejects.toThrow(/contact does not exist/);
    });

    it('lets a task add a deal the contact does not have', async () => {
      prisma.contact.findUnique.mockResolvedValue(contact);
      prisma.deal.findUnique.mockResolvedValue({ id: 'd9' });
      prisma.task.create.mockResolvedValue({ id: '1' });
      await service.create({ title: 'T', contactId: 'c1', dealId: 'd9' }, 'u1');
      expect(prisma.task.create.mock.calls[0][0].data).toMatchObject({ personId: 'p1', dealId: 'd9' });
    });

    it('clears the contact on update without touching person or deal', async () => {
      prisma.task.findUnique.mockResolvedValue({ id: '1', contactId: 'c1', personId: 'p1', dealId: null });
      prisma.person.findUnique.mockResolvedValue({ id: 'p1' });
      prisma.task.update.mockResolvedValue({ id: '1' });
      await service.update('1', { contactId: null });
      const data = prisma.task.update.mock.calls[0][0].data;
      expect(data).toMatchObject({ contactId: null, personId: 'p1', dealId: null });
    });

    it('does not re-fill a person the user cleared from a task that keeps its contact', async () => {
      prisma.task.findUnique.mockResolvedValue({ id: '1', contactId: 'c1', personId: 'p1', dealId: null });
      prisma.contact.findUnique.mockResolvedValue(contact);
      prisma.task.update.mockResolvedValue({ id: '1' });
      await service.update('1', { personId: null as any });
      expect(prisma.task.update.mock.calls[0][0].data.personId).toBeNull();
    });
  });

  it('throws 404 for a missing task', async () => {
    prisma.task.findUnique.mockResolvedValue(null);
    await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
  });

  it('deletes a task', async () => {
    prisma.task.findUnique.mockResolvedValue({ id: '1' });
    prisma.task.delete.mockResolvedValue({});
    expect((await service.remove('1')).success).toBe(true);
  });
});
