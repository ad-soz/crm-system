import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { classifyDbError } from '../reference-data/guards';
import { ALL_PERMISSIONS } from '../permissions/permissions';
import { hideUnviewable } from '../permissions/visibility';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

// Flatten the join rows into a plain industries array for the client.
function withIndustries<T extends { industries?: { industry: unknown }[] }>(company: T) {
  if (!company?.industries) return company;
  return { ...company, industries: company.industries.map((ci) => ci.industry) };
}

@Injectable()
export class CompaniesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateCompanyDto) {
    const { industryIds, ...fields } = dto;
    const company = await this.guarded(() =>
      this.prisma.company.create({
        data: {
          ...fields,
          industries: industryIds?.length
            ? { create: industryIds.map((industryId) => ({ industryId })) }
            : undefined,
        },
        include: this.detailInclude,
      }),
    );
    return withIndustries(company);
  }

  async findAll(page = 1, limit = 20, search?: string) {
    const skip = (page - 1) * limit;
    const where = search ? { name: { contains: search } } : {};

    const [rows, total] = await Promise.all([
      this.prisma.company.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        include: {
          industries: { include: { industry: true } },
          _count: { select: { people: true, deals: true } },
        },
      }),
      this.prisma.company.count({ where }),
    ]);

    return { data: rows.map(withIndustries), total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string, permissions: string[] = ALL_PERMISSIONS) {
    const company = await this.prisma.company.findUnique({ where: { id }, include: this.detailInclude });
    if (!company) throw new NotFoundException('Company not found');
    return hideUnviewable(withIndustries(company), permissions, { people: 'people.view', deals: 'deals.view' });
  }

  async update(id: string, dto: UpdateCompanyDto) {
    await this.ensureExists(id);
    const { industryIds, ...fields } = dto;
    const company = await this.guarded(() =>
      this.prisma.$transaction(async (tx) => {
        if (industryIds !== undefined) {
          // Replace the set, but keep any already-linked ids so a retired
          // industry that was already attached is preserved.
          const current = await tx.companyIndustry.findMany({ where: { companyId: id } });
          const currentIds = new Set(current.map((c) => c.industryId));
          const nextIds = new Set(industryIds);
          const toRemove = [...currentIds].filter((x) => !nextIds.has(x));
          const toAdd = [...nextIds].filter((x) => !currentIds.has(x));
          if (toRemove.length) {
            await tx.companyIndustry.deleteMany({ where: { companyId: id, industryId: { in: toRemove } } });
          }
          for (const industryId of toAdd) {
            await tx.companyIndustry.create({ data: { companyId: id, industryId } });
          }
        }
        return tx.company.update({ where: { id }, data: fields, include: this.detailInclude });
      }),
    );
    return withIndustries(company);
  }

  async remove(id: string) {
    await this.ensureExists(id);
    const [personCount, dealCount] = await Promise.all([
      this.prisma.person.count({ where: { companyId: id } }),
      this.prisma.deal.count({ where: { companyId: id } }),
    ]);
    if (personCount > 0 || dealCount > 0) {
      throw new BadRequestException(
        `Cannot delete company with ${personCount} people and ${dealCount} deal(s). Remove or reassign them first.`,
      );
    }
    // The join rows are removed automatically (cascade).
    await this.prisma.company.delete({ where: { id } });
    return { success: true };
  }

  // Map database-rule failures (unknown/retired industry, single-vs-multiple) to messages.
  private async guarded<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (err: any) {
      const classified = classifyDbError(err);
      if (classified?.kind === 'guard') throw new BadRequestException(classified.message);
      if (classified?.kind === 'foreignKey') throw new BadRequestException('One of the chosen industries does not exist');
      throw err;
    }
  }

  private async ensureExists(id: string) {
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) throw new NotFoundException('Company not found');
    return company;
  }

  private detailInclude = {
    industries: { include: { industry: true } },
    people: { include: { owner: { select: { id: true, firstName: true, lastName: true } } } },
    deals: { include: { person: true, stage: true } },
  };
}
