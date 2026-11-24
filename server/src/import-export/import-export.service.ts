import { Injectable, BadRequestException } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { PrismaService } from '../prisma/prisma.service';

export interface ImportError {
  row: number;
  message: string;
}

export interface ImportResult {
  total: number;
  imported: number;
  errors: ImportError[];
}

@Injectable()
export class ImportExportService {
  constructor(private prisma: PrismaService) {}

  async exportPeople(): Promise<string> {
    const people = await this.prisma.person.findMany({
      include: { company: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const rows = people.map((c) => ({
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email ?? '',
      phone: c.phone ?? '',
      title: c.title ?? '',
      companyName: c.company?.name ?? '',
    }));

    return stringify(rows, {
      // Prefix cells starting with = + - @ (and tab/CR) with a quote, so a
      // value like =HYPERLINK(...) stays text when the file is opened in Excel.
      escape_formulas: true,
      header: true,
      columns: ['firstName', 'lastName', 'email', 'phone', 'title', 'companyName'],
    });
  }

  async importPeople(
    buffer: Buffer,
    currentUserId: string,
    options: { canCreateCompanies: boolean } = { canCreateCompanies: true },
  ): Promise<ImportResult> {
    let records: any[];
    try {
      records = parse(buffer.toString('utf-8'), {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });
    } catch (err: any) {
      throw new BadRequestException(`Malformed CSV: ${err.message}`);
    }

    const result: ImportResult = { total: records.length, imported: 0, errors: [] };

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      const rowNum = i + 2; // +1 for header, +1 for 1-based indexing

      const firstName = (row.firstName ?? '').trim();
      const lastName = (row.lastName ?? '').trim();

      if (!firstName || !lastName) {
        result.errors.push({ row: rowNum, message: 'firstName and lastName are required' });
        continue;
      }

      const email = (row.email ?? '').trim();
      if (email && !this.isValidEmail(email)) {
        result.errors.push({ row: rowNum, message: `Invalid email: ${email}` });
        continue;
      }

      try {
        let companyId: string | undefined;
        const companyName = (row.companyName ?? '').trim();
        if (companyName) {
          const company = await this.findOrCreateCompany(companyName, options.canCreateCompanies);
          if (!company) {
            result.errors.push({
              row: rowNum,
              message: `Company "${companyName}" doesn't exist, and your role profile can't create companies`,
            });
            continue;
          }
          companyId = company.id;
        }

        await this.prisma.person.create({
          data: {
            firstName,
            lastName,
            email: email || undefined,
            phone: (row.phone ?? '').trim() || undefined,
            title: (row.title ?? '').trim() || undefined,
            companyId,
            ownerId: currentUserId,
          },
        });
        result.imported++;
      } catch (err: any) {
        result.errors.push({ row: rowNum, message: err.message });
      }
    }

    return result;
  }

  private async findOrCreateCompany(name: string, canCreate: boolean) {
    const existing = await this.prisma.company.findFirst({ where: { name } });
    if (existing) return existing;
    if (!canCreate) return null;
    return this.prisma.company.create({ data: { name } });
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
}
