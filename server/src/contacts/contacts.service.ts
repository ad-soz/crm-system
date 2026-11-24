import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReferenceDataService } from '../reference-data/reference-data.service';
import { classifyDbError } from '../reference-data/guards';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';

@Injectable()
export class ContactsService {
  constructor(
    private prisma: PrismaService,
    private ref: ReferenceDataService,
  ) {}

  async create(dto: CreateContactDto, currentUserId: string) {
    if (!dto.personId && !dto.dealId) {
      throw new BadRequestException('At least one of personId or dealId is required');
    }
    await this.validateRefs(dto.personId, dto.dealId);
    const typeId = dto.typeId ?? (await this.ref.defaultId('contactType'));

    return this.guardType(() =>
      this.prisma.contact.create({
        data: {
          typeId,
          subject: dto.subject,
          description: dto.description,
          personId: dto.personId,
          dealId: dto.dealId,
          userId: currentUserId,
        },
        include: this.include,
      }),
    );
  }

  async findAll(page = 1, limit = 50, personId?: string, dealId?: string, typeId?: string) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (personId) where.personId = personId;
    if (dealId) where.dealId = dealId;
    if (typeId) where.typeId = typeId;

    const [data, total] = await Promise.all([
      this.prisma.contact.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: this.include,
      }),
      this.prisma.contact.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const contact = await this.prisma.contact.findUnique({
      where: { id },
      include: this.include,
    });
    if (!contact) throw new NotFoundException('Contact not found');
    return contact;
  }

  async update(id: string, dto: UpdateContactDto) {
    await this.ensureExists(id);
    return this.prisma.contact.update({
      where: { id },
      data: dto,
      include: this.include,
    });
  }

  async remove(id: string) {
    await this.ensureExists(id);
    await this.prisma.contact.delete({ where: { id } });
    return { success: true };
  }

  private async guardType<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (err: any) {
      const classified = classifyDbError(err);
      if (classified?.kind === 'guard') throw new BadRequestException(classified.message);
      if (classified?.kind === 'foreignKey') throw new BadRequestException('That contact type does not exist');
      throw err;
    }
  }

  private async ensureExists(id: string) {
    const contact = await this.prisma.contact.findUnique({ where: { id } });
    if (!contact) throw new NotFoundException('Contact not found');
    return contact;
  }

  private async validateRefs(personId?: string, dealId?: string) {
    if (personId) {
      const person = await this.prisma.person.findUnique({ where: { id: personId } });
      if (!person) throw new BadRequestException('Referenced person does not exist');
    }
    if (dealId) {
      const deal = await this.prisma.deal.findUnique({ where: { id: dealId } });
      if (!deal) throw new BadRequestException('Referenced deal does not exist');
    }
  }

  private include = {
    type: true,
    person: { select: { id: true, firstName: true, lastName: true } },
    deal: { select: { id: true, title: true } },
    user: { select: { id: true, firstName: true, lastName: true } },
  };
}
