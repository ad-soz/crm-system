import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildDealReport } from './deal-report';

export const HISTORY_SINCE_KEY = 'stage_history_since';
export const ALLOWED_MONTHS = [3, 6, 12] as const;

/** Reads deals, stages and recorded stage moves, and hands them to the report calculation. */
@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  /** Parse and check the query so a bad value gets a clear message and not a wrong report. */
  parseOptions(monthsRaw?: string, ownerId?: string) {
    const months = monthsRaw === undefined || monthsRaw === '' ? 6 : Number(monthsRaw);
    if (!(ALLOWED_MONTHS as readonly number[]).includes(months)) {
      throw new BadRequestException(`Choose a period of ${ALLOWED_MONTHS.join(', ')} months`);
    }
    return { months, ownerId: ownerId ? ownerId : undefined };
  }

  async deals(options: { months: number; ownerId?: string }) {
    const [deals, stages, changes, users, marker] = await Promise.all([
      this.prisma.deal.findMany({
        select: { id: true, title: true, amount: true, stageId: true, ownerId: true, createdAt: true },
      }),
      this.prisma.dealStage.findMany({
        select: { id: true, name: true, colour: true, outcome: true, winChance: true, sortOrder: true },
      }),
      this.prisma.dealStageChange.findMany({ select: { dealId: true, toStageId: true, createdAt: true } }),
      this.prisma.user.findMany({ select: { id: true, firstName: true, lastName: true, email: true }, orderBy: { firstName: 'asc' } }),
      this.prisma.appSetting.findUnique({ where: { key: HISTORY_SINCE_KEY } }),
    ]);

    const owners = users.map((u) => ({
      id: u.id,
      name: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email,
    }));

    const parsed = marker ? new Date(marker.value) : null;
    const historySince = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;

    const report = buildDealReport({
      deals,
      stages,
      changes,
      owners,
      months: options.months,
      ownerId: options.ownerId,
      historySince,
    });

    return {
      ...report,
      options: { months: options.months, ownerId: options.ownerId ?? null },
      owners,
      historySince: historySince ? historySince.toISOString() : null,
    };
  }
}
