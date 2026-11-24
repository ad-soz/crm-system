import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ALL_PERMISSIONS } from '../permissions/permissions';
import { hideUnviewable } from '../permissions/visibility';
import { CreatePersonDto } from './dto/create-person.dto';
import { UpdatePersonDto } from './dto/update-person.dto';

@Injectable()
export class PeopleService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreatePersonDto, currentUserId: string) {
    if (dto.companyId) {
      await this.ensureCompanyExists(dto.companyId);
    }

    return this.prisma.person.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        phone: dto.phone,
        title: dto.title,
        companyId: dto.companyId,
        ownerId: dto.ownerId ?? currentUserId,
      },
      include: { company: true, owner: { select: this.ownerSelect } },
    });
  }

  async findAll(page = 1, limit = 20, search?: string, companyId?: string) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (companyId) where.companyId = companyId;
    if (search) {
      where.OR = [
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { email: { contains: search } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.person.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          company: { select: { id: true, name: true } },
          owner: { select: this.ownerSelect },
        },
      }),
      this.prisma.person.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string, permissions: string[] = ALL_PERMISSIONS) {
    const person = await this.prisma.person.findUnique({
      where: { id },
      include: {
        company: true,
        owner: { select: this.ownerSelect },
        contacts: { orderBy: { createdAt: 'desc' }, include: { user: { select: this.ownerSelect } } },
        tasks: {
          orderBy: { createdAt: 'desc' },
          include: {
            status: true,
            priority: true,
            assignee: { select: this.ownerSelect },
            contact: { select: { id: true, subject: true } },
          },
        },
        deals: true,
      },
    });

    if (!person) {
      throw new NotFoundException('Person not found');
    }

    return hideUnviewable(person, permissions, {
      contacts: 'contacts.view',
      tasks: 'tasks.view',
      deals: 'deals.view',
    });
  }

  async update(id: string, dto: UpdatePersonDto) {
    await this.ensureExists(id);
    if (dto.companyId) {
      await this.ensureCompanyExists(dto.companyId);
    }
    return this.prisma.person.update({
      where: { id },
      data: dto,
      include: { company: true, owner: { select: this.ownerSelect } },
    });
  }

  async remove(id: string) {
    await this.ensureExists(id);
    await this.prisma.person.delete({ where: { id } });
    return { success: true };
  }

  /**
   * Distinct job titles already in use, for type-ahead suggestions. Job title
   * stays free text (titles vary too much to be a fixed list), but suggesting
   * existing ones keeps spelling consistent.
   */
  async titleSuggestions(query = ''): Promise<string[]> {
    const q = query.trim().toLowerCase();
    const rows = await this.prisma.person.findMany({
      where: { title: { not: null } },
      select: { title: true },
      distinct: ['title'],
      orderBy: { title: 'asc' },
      take: 200,
    });
    const titles = rows.map((r) => r.title!).filter((t) => t.trim() !== '');
    const matched = q ? titles.filter((t) => t.toLowerCase().includes(q)) : titles;
    return matched.slice(0, 20);
  }

  private async ensureExists(id: string) {
    const person = await this.prisma.person.findUnique({ where: { id } });
    if (!person) throw new NotFoundException('Person not found');
    return person;
  }

  private async ensureCompanyExists(companyId: string) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new BadRequestException('Referenced company does not exist');
  }

  private ownerSelect = { id: true, firstName: true, lastName: true, email: true };
}
