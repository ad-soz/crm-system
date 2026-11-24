import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReferenceDataService } from '../reference-data/reference-data.service';
import { classifyDbError } from '../reference-data/guards';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

interface TaskFilters {
  statusId?: string;
  assigneeId?: string;
  dueBefore?: string;
  dueAfter?: string;
}

@Injectable()
export class TasksService {
  constructor(
    private prisma: PrismaService,
    private ref: ReferenceDataService,
  ) {}

  async create(dto: CreateTaskDto, currentUserId: string) {
    const { personId, dealId } = await this.resolveLinks(dto.contactId, dto.personId, dto.dealId);
    const [statusId, priorityId] = await Promise.all([
      dto.statusId ? Promise.resolve(dto.statusId) : this.ref.defaultId('taskStatus'),
      dto.priorityId ? Promise.resolve(dto.priorityId) : this.ref.defaultId('taskPriority'),
    ]);

    return this.guardRefs(() =>
      this.prisma.task.create({
        data: {
          title: dto.title,
          description: dto.description,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
          statusId,
          priorityId,
          personId,
          dealId,
          contactId: dto.contactId ?? undefined,
          assigneeId: dto.assigneeId ?? currentUserId,
        },
        include: this.include,
      }),
    );
  }

  async findAll(page = 1, limit = 100, filters: TaskFilters = {}) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (filters.statusId) where.statusId = filters.statusId;
    if (filters.assigneeId) where.assigneeId = filters.assigneeId;
    if (filters.dueBefore || filters.dueAfter) {
      where.dueDate = {};
      if (filters.dueBefore) where.dueDate.lte = new Date(filters.dueBefore);
      if (filters.dueAfter) where.dueDate.gte = new Date(filters.dueAfter);
    }

    const [data, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        include: this.include,
      }),
      this.prisma.task.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const task = await this.prisma.task.findUnique({ where: { id }, include: this.include });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  async update(id: string, dto: UpdateTaskDto) {
    const existing = await this.ensureExists(id);

    // What the task will be linked to once this change is applied (null = none).
    const contactId = dto.contactId === undefined ? existing.contactId : dto.contactId;
    const personId = dto.personId === undefined ? existing.personId : dto.personId;
    const dealId = dto.dealId === undefined ? existing.dealId : dto.dealId;
    const data: any = { ...dto };
    if (dto.contactId !== undefined || dto.personId !== undefined || dto.dealId !== undefined) {
      // Person and deal are copied from the contact only when a contact is newly attached.
      const copyFromContact = dto.contactId !== undefined && dto.contactId !== existing.contactId;
      const links = await this.resolveLinks(contactId, personId, dealId, copyFromContact);
      data.personId = links.personId ?? null;
      data.dealId = links.dealId ?? null;
    }
    if (dto.dueDate) data.dueDate = new Date(dto.dueDate);

    return this.guardRefs(() => this.prisma.task.update({ where: { id }, data, include: this.include }));
  }

  async remove(id: string) {
    await this.ensureExists(id);
    await this.prisma.task.delete({ where: { id } });
    return { success: true };
  }

  private async guardRefs<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (err: any) {
      const classified = classifyDbError(err);
      if (classified?.kind === 'guard') throw new BadRequestException(classified.message);
      if (classified?.kind === 'foreignKey') throw new BadRequestException('That task status or priority does not exist');
      throw err;
    }
  }

  private async ensureExists(id: string) {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  /**
   * Check the person, deal and contact a task points at, and make them agree.
   *
   * A task made from a Contact (touchpoint) is about the same person and deal as
   * that Contact unless it says otherwise; saying otherwise is refused. Person and
   * deal are only copied from the Contact when none was given (and copyFromContact
   * is set), so an existing link is never silently replaced.
   */
  private async resolveLinks(
    contactId?: string | null,
    personId?: string | null,
    dealId?: string | null,
    copyFromContact = true,
  ): Promise<{ personId?: string | null; dealId?: string | null }> {
    if (personId) {
      const person = await this.prisma.person.findUnique({ where: { id: personId } });
      if (!person) throw new BadRequestException('Referenced person does not exist');
    }
    if (dealId) {
      const deal = await this.prisma.deal.findUnique({ where: { id: dealId } });
      if (!deal) throw new BadRequestException('Referenced deal does not exist');
    }
    if (contactId) {
      const contact = await this.prisma.contact.findUnique({ where: { id: contactId } });
      if (!contact) throw new BadRequestException('Referenced contact does not exist');
      if (personId && contact.personId && personId !== contact.personId) {
        throw new BadRequestException('A task cannot be about a different person than the contact it follows up');
      }
      if (dealId && contact.dealId && dealId !== contact.dealId) {
        throw new BadRequestException('A task cannot be about a different deal than the contact it follows up');
      }
      if (copyFromContact) {
        return { personId: personId ?? contact.personId, dealId: dealId ?? contact.dealId };
      }
    }
    return { personId, dealId };
  }

  private include = {
    status: true,
    priority: true,
    person: { select: { id: true, firstName: true, lastName: true } },
    deal: { select: { id: true, title: true } },
    contact: { select: { id: true, subject: true, createdAt: true, type: { select: { id: true, name: true } } } },
    assignee: { select: { id: true, firstName: true, lastName: true, email: true } },
  };
}