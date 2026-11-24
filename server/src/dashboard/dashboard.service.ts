import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ALL_PERMISSIONS } from '../permissions/permissions';
import { buildForecast } from './forecast';
import { buildDealAttention, MAX_ITEMS } from './attention';
import { startOfToday } from './dates';

/**
 * Dashboard figures for the signed-in user. "Open" deals and "done" tasks are
 * decided by flags on the reference lists (stage outcome, status isDone), not
 * by hard-coded names, so renamed or added values behave correctly.
 */
@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getSummary(currentUserId: string, permissions: string[] = ALL_PERMISSIONS) {
    const can = (p: string) => permissions.includes(p);
    const now = new Date();
    // Due dates are stored as midnight UTC of the chosen date, so "today" starts there.
    // (Comparing with the current clock time would call a task due today late by 00:01.)
    const todayStart = new Date(startOfToday(now));
    const in7Days = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    const none = Promise.resolve(null);

    const [openStageIds, doneStatusIds] = await Promise.all([
      this.prisma.dealStage.findMany({ where: { outcome: 'OPEN' }, select: { id: true, winChance: true } }),
      this.prisma.taskStatus.findMany({ where: { isDone: true }, select: { id: true } }),
    ]);
    const openIds = openStageIds.map((s) => s.id);
    const doneIds = doneStatusIds.map((s) => s.id);
    const chances = new Map(openStageIds.map((s) => [s.id, s.winChance ?? 0]));

    const [
      totalPeople,
      totalCompanies,
      openDeals,
      pipelineAgg,
      stages,
      dealsByStageRaw,
      openDealRows,
      upcomingTasks,
      recentContacts,
    ] = await Promise.all([
      can('people.view') ? this.prisma.person.count() : none,
      can('companies.view') ? this.prisma.company.count() : none,
      can('deals.view') ? this.prisma.deal.count({ where: { stageId: { in: openIds } } }) : none,
      can('deals.view')
        ? this.prisma.deal.aggregate({ where: { stageId: { in: openIds } }, _sum: { amount: true } })
        : none,
      can('deals.view') ? this.prisma.dealStage.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }) : none,
      can('deals.view') ? this.prisma.deal.groupBy({ by: ['stageId'], _count: { _all: true }, _sum: { amount: true } }) : none,
      can('deals.view')
        ? this.prisma.deal.findMany({
            where: { stageId: { in: openIds } },
            select: {
              id: true,
              title: true,
              amount: true,
              expectedCloseDate: true,
              stageId: true,
              ownerId: true,
              personId: true,
              createdAt: true,
            },
          })
        : none,
      can('tasks.view')
        ? this.prisma.task.findMany({
            where: { assigneeId: currentUserId, statusId: { notIn: doneIds }, dueDate: { gte: todayStart, lte: in7Days } },
            orderBy: { dueDate: 'asc' },
            include: {
              status: true,
              priority: true,
              person: { select: { id: true, firstName: true, lastName: true } },
              deal: { select: { id: true, title: true } },
              assignee: { select: { id: true, firstName: true, lastName: true } },
            },
          })
        : none,
      can('contacts.view')
        ? this.prisma.contact.findMany({
            take: 10,
            orderBy: { createdAt: 'desc' },
            include: {
              type: true,
              person: { select: { id: true, firstName: true, lastName: true } },
              deal: { select: { id: true, title: true } },
              user: { select: { id: true, firstName: true, lastName: true } },
            },
          })
        : none,
    ]);

    // ---- Needs attention (for this person only) ----
    const taskSelect = {
      id: true,
      title: true,
      dueDate: true,
      priority: { select: { id: true, name: true, colour: true } },
      person: { select: { id: true, firstName: true, lastName: true } },
      deal: { select: { id: true, title: true } },
    };
    const overdueWhere = { assigneeId: currentUserId, statusId: { notIn: doneIds }, dueDate: { lt: todayStart } };
    const [overdueCount, overdueItems] = can('tasks.view')
      ? await Promise.all([
          this.prisma.task.count({ where: overdueWhere }),
          this.prisma.task.findMany({ where: overdueWhere, orderBy: { dueDate: 'asc' }, take: MAX_ITEMS, select: taskSelect }),
        ])
      : [0, []];

    let dealAttention: ReturnType<typeof buildDealAttention> | null = null;
    if (openDealRows) {
      // Last contact per deal and per person, for this person's open deals only.
      const mine = openDealRows.filter((d) => d.ownerId === currentUserId);
      const dealIds = mine.map((d) => d.id);
      const personIds = [...new Set(mine.map((d) => d.personId).filter((c): c is string => !!c))];
      const [byDeal, byPerson] = mine.length
        ? await Promise.all([
            this.prisma.contact.groupBy({ by: ['dealId'], where: { dealId: { in: dealIds } }, _max: { createdAt: true } }),
            personIds.length
              ? this.prisma.contact.groupBy({ by: ['personId'], where: { personId: { in: personIds } }, _max: { createdAt: true } })
              : Promise.resolve([]),
          ])
        : [[], []];
      const lastByDeal = new Map<string, Date>();
      for (const r of byDeal) if (r.dealId && r._max.createdAt) lastByDeal.set(r.dealId, r._max.createdAt);
      const lastByPerson = new Map<string, Date>();
      for (const r of byPerson) if (r.personId && r._max.createdAt) lastByPerson.set(r.personId, r._max.createdAt);
      dealAttention = buildDealAttention(mine, currentUserId, lastByDeal, lastByPerson, now);
    }

    const dealsByStage = stages
      ? stages.map((stage) => {
          const found = dealsByStageRaw!.find((d) => d.stageId === stage.id);
          return { stage, count: found?._count._all ?? 0, value: found?._sum.amount ?? 0 };
        })
      : null;

    return {
      totalPeople,
      totalCompanies,
      openDeals,
      pipelineValue: pipelineAgg ? (pipelineAgg._sum.amount ?? 0) : null,
      dealsByStage,
      forecast: openDealRows ? buildForecast(openDealRows, chances, now) : null,
      attention: {
        overdueTasks: can('tasks.view') ? { count: overdueCount, items: overdueItems } : null,
        staleDeals: dealAttention?.staleDeals ?? null,
        pastDueDeals: dealAttention?.pastDueDeals ?? null,
      },
      upcomingTasks,
      recentContacts,
    };
  }
}
