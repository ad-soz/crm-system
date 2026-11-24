import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReferenceDataService } from '../reference-data/reference-data.service';
import { classifyDbError } from '../reference-data/guards';
import { ALL_PERMISSIONS } from '../permissions/permissions';
import { hideUnviewable } from '../permissions/visibility';
import { CreateDealDto } from './dto/create-deal.dto';
import { UpdateDealDto } from './dto/update-deal.dto';

/** Who is making a change, as recorded in history. */
export interface ActingUser {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}

@Injectable()
export class DealsService {
  constructor(
    private prisma: PrismaService,
    private ref: ReferenceDataService,
  ) {}

  async create(dto: CreateDealDto, currentUserId: string) {
    await this.validateRefs(dto.companyId, dto.personId);
    // Default the stage from the list when the caller doesn't choose one.
    const stageId = dto.stageId ?? (await this.ref.defaultId('dealStage'));

    return this.guardStage(() =>
      this.prisma.deal.create({
        data: {
          title: dto.title,
          amount: dto.amount,
          stageId,
          companyId: dto.companyId,
          personId: dto.personId,
          ownerId: dto.ownerId ?? currentUserId,
          expectedCloseDate: dto.expectedCloseDate ? new Date(dto.expectedCloseDate) : undefined,
        },
        include: this.listInclude,
      }),
    );
  }

  async findAll(page = 1, limit = 100, stageId?: string, ownerId?: string) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (stageId) where.stageId = stageId;
    if (ownerId) where.ownerId = ownerId;

    const [data, total] = await Promise.all([
      this.prisma.deal.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: this.listInclude,
      }),
      this.prisma.deal.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // Counts and totals per stage, in list order, including stages with no deals.
  async pipeline() {
    const [stages, grouped] = await Promise.all([
      this.prisma.dealStage.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      this.prisma.deal.groupBy({ by: ['stageId'], _count: { _all: true }, _sum: { amount: true } }),
    ]);
    return stages.map((stage) => {
      const found = grouped.find((g) => g.stageId === stage.id);
      return { stage, count: found?._count._all ?? 0, value: found?._sum.amount ?? 0 };
    });
  }

  async findOne(id: string, permissions: string[] = ALL_PERMISSIONS) {
    const deal = await this.prisma.deal.findUnique({
      where: { id },
      include: {
        stage: true,
        company: true,
        person: true,
        owner: { select: this.ownerSelect },
        contacts: { orderBy: { createdAt: 'desc' }, include: { type: true, user: { select: this.ownerSelect } } },
        tasks: {
          orderBy: { createdAt: 'desc' },
          include: {
            status: true,
            priority: true,
            assignee: { select: this.ownerSelect },
            contact: { select: { id: true, subject: true } },
          },
        },
      },
    });

    if (!deal) throw new NotFoundException('Deal not found');
    return hideUnviewable(deal, permissions, { contacts: 'contacts.view', tasks: 'tasks.view' });
  }

  /**
   * Update a deal. Moving it to another stage needs a comment, which is saved
   * (with who and when) in the deal's stage history in the same step as the
   * move, so neither can exist without the other. The database enforces this
   * too, so nothing can move a deal without leaving the record.
   */
  async update(id: string, dto: UpdateDealDto, user?: ActingUser) {
    const existing = await this.ensureExists(id);
    await this.validateRefs(dto.companyId, dto.personId);

    // The comment belongs in the history, not on the deal itself.
    const { stageComment, ...fields } = dto;
    const data: any = { ...fields };
    if (dto.expectedCloseDate) {
      data.expectedCloseDate = new Date(dto.expectedCloseDate);
    }

    const moving = dto.stageId !== undefined && dto.stageId !== existing.stageId;
    if (!moving) {
      return this.guardStage(() => this.prisma.deal.update({ where: { id }, data, include: this.listInclude }));
    }

    const comment = (stageComment ?? '').trim();
    if (!comment) {
      throw new BadRequestException('Add a comment to explain why this deal is moving to another stage');
    }
    if (!user) {
      // Every route passes the signed-in person; a move with nobody to record would be untraceable.
      throw new BadRequestException('A stage move must be made by a signed-in user');
    }
    const target = await this.prisma.dealStage.findUnique({ where: { id: dto.stageId } });
    if (!target) throw new BadRequestException('That deal stage does not exist');
    if (!target.isActive) throw new BadRequestException('That deal stage has been retired and cannot be chosen');

    const userName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email || 'Unknown user';
    return this.guardStage(() =>
      this.prisma.$transaction(async (tx) => {
        await tx.dealStageChange.create({
          data: { dealId: id, fromStageId: existing.stageId, toStageId: dto.stageId!, userId: user.id, userName, comment },
        });
        return tx.deal.update({ where: { id }, data, include: this.listInclude });
      }),
    );
  }

  /** Every stage move for a deal, newest first: when, who, from, to, and why. */
  async history(id: string) {
    await this.ensureExists(id);
    return this.prisma.dealStageChange.findMany({
      where: { dealId: id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        comment: true,
        userId: true,
        userName: true,
        createdAt: true,
        fromStage: { select: { id: true, name: true, colour: true } },
        toStage: { select: { id: true, name: true, colour: true } },
      },
    });
  }

  async remove(id: string) {
    await this.ensureExists(id);
    await this.prisma.deal.delete({ where: { id } });
    return { success: true };
  }

  // Turn a bad/retired stage foreign-key failure into a clear message.
  private async guardStage<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (err: any) {
      const classified = classifyDbError(err);
      if (classified?.kind === 'guard') throw new BadRequestException(classified.message);
      if (classified?.kind === 'foreignKey') throw new BadRequestException('That deal stage does not exist');
      throw err;
    }
  }

  private async ensureExists(id: string) {
    const deal = await this.prisma.deal.findUnique({ where: { id } });
    if (!deal) throw new NotFoundException('Deal not found');
    return deal;
  }

  private async validateRefs(companyId?: string, personId?: string) {
    if (companyId) {
      const company = await this.prisma.company.findUnique({ where: { id: companyId } });
      if (!company) throw new BadRequestException('Referenced company does not exist');
    }
    if (personId) {
      const person = await this.prisma.person.findUnique({ where: { id: personId } });
      if (!person) throw new BadRequestException('Referenced person does not exist');
    }
  }

  private ownerSelect = { id: true, firstName: true, lastName: true, email: true };
  private listInclude = {
    stage: true,
    company: { select: { id: true, name: true } },
    person: { select: { id: true, firstName: true, lastName: true } },
    owner: { select: { id: true, firstName: true, lastName: true, email: true } },
    _count: { select: { tasks: true } },
  };
}
