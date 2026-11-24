import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const SUBJECTS = ['people', 'companies', 'deals'] as const;
export type Subject = (typeof SUBJECTS)[number];

/** The permission needed to analyse each subject. */
export const SUBJECT_PERMISSION: Record<Subject, string> = {
  people: 'people.view',
  companies: 'companies.view',
  deals: 'deals.view',
};

/** More rows than this are not sent; the screen says so. A small business will not reach it. */
export const ROW_LIMIT = 5000;

const fullName = (u?: { firstName: string; lastName: string } | null) => (u ? `${u.firstName} ${u.lastName}`.trim() : null);
const iso = (d?: Date | null) => (d ? d.toISOString() : null);
const cents = (n: number) => Math.round(n * 100) / 100;

/**
 * The rows behind a dashboard figure, one per person, company or deal, with the
 * names and totals needed to slice them. The screen filters, groups and charts them.
 *
 * A column is `null` when the person may not see that area (for example a deal's
 * last contact needs the right to view contacts), and the screen leaves it out.
 */
@Injectable()
export class AnalyseService {
  constructor(private prisma: PrismaService) {}

  async dataset(subject: Subject, permissions: string[]) {
    const can = (p: string) => permissions.includes(p);
    const [stages, doneStatuses] = await Promise.all([
      this.prisma.dealStage.findMany({ select: { id: true, outcome: true, winChance: true } }),
      this.prisma.taskStatus.findMany({ where: { isDone: true }, select: { id: true } }),
    ]);
    const openStageIds = stages.filter((s) => s.outcome === 'OPEN').map((s) => s.id);
    const doneIds = doneStatuses.map((s) => s.id);

    const result =
      subject === 'people'
        ? await this.people(can, openStageIds, doneIds)
        : subject === 'companies'
          ? await this.companies(can, openStageIds)
          : await this.deals(can, doneIds);

    return { subject, rows: result.rows, total: result.total, truncated: result.total > result.rows.length, limit: ROW_LIMIT };
  }

  private async people(can: (p: string) => boolean, openStageIds: string[], doneIds: string[]) {
    const [people, total, contacts, deals, tasks] = await Promise.all([
      this.prisma.person.findMany({
        take: ROW_LIMIT,
        orderBy: { createdAt: 'desc' },
        include: { company: { select: { id: true, name: true } }, owner: { select: { firstName: true, lastName: true } } },
      }),
      this.prisma.person.count(),
      can('contacts.view')
        ? this.prisma.contact.groupBy({ by: ['personId'], where: { personId: { not: null } }, _count: { _all: true }, _max: { createdAt: true } })
        : null,
      can('deals.view')
        ? this.prisma.deal.groupBy({ by: ['personId'], where: { personId: { not: null }, stageId: { in: openStageIds } }, _count: { _all: true }, _sum: { amount: true } })
        : null,
      can('tasks.view')
        ? this.prisma.task.groupBy({ by: ['personId'], where: { personId: { not: null }, statusId: { notIn: doneIds } }, _count: { _all: true } })
        : null,
    ]);
    const byPerson = <T extends { personId: string | null }>(list: T[] | null) => new Map((list ?? []).map((r) => [r.personId as string, r]));
    const contactsBy = byPerson(contacts);
    const dealsBy = byPerson(deals);
    const tasksBy = byPerson(tasks);

    const rows = people.map((p) => ({
      id: p.id,
      name: `${p.firstName} ${p.lastName}`.trim(),
      title: p.title ?? null,
      email: p.email ?? null,
      phone: p.phone ?? null,
      companyId: p.company?.id ?? null,
      company: p.company?.name ?? null,
      owner: fullName(p.owner),
      createdAt: iso(p.createdAt),
      contacts: contacts ? (contactsBy.get(p.id)?._count._all ?? 0) : null,
      lastContactAt: contacts ? iso(contactsBy.get(p.id)?._max.createdAt) : null,
      openDeals: deals ? (dealsBy.get(p.id)?._count._all ?? 0) : null,
      openDealValue: deals ? (dealsBy.get(p.id)?._sum.amount ?? 0) : null,
      openTasks: tasks ? (tasksBy.get(p.id)?._count._all ?? 0) : null,
    }));
    return { rows, total };
  }

  private async companies(can: (p: string) => boolean, openStageIds: string[]) {
    const [companies, total, people, deals, all] = await Promise.all([
      this.prisma.company.findMany({
        take: ROW_LIMIT,
        orderBy: { createdAt: 'desc' },
        include: { industries: { include: { industry: { select: { name: true } } } } },
      }),
      this.prisma.company.count(),
      can('people.view') ? this.prisma.person.groupBy({ by: ['companyId'], where: { companyId: { not: null } }, _count: { _all: true } }) : null,
      can('deals.view')
        ? this.prisma.deal.groupBy({ by: ['companyId'], where: { companyId: { not: null }, stageId: { in: openStageIds } }, _count: { _all: true }, _sum: { amount: true } })
        : null,
      can('deals.view') ? this.prisma.deal.groupBy({ by: ['companyId'], where: { companyId: { not: null } }, _count: { _all: true } }) : null,
    ]);
    const by = <T extends { companyId: string | null }>(list: T[] | null) => new Map((list ?? []).map((r) => [r.companyId as string, r]));
    const peopleBy = by(people);
    const dealsBy = by(deals);
    const allBy = by(all);

    const rows = companies.map((c) => ({
      id: c.id,
      name: c.name,
      industries: c.industries.map((i) => i.industry.name).sort((a, b) => a.localeCompare(b)),
      website: c.website ?? null,
      phone: c.phone ?? null,
      email: c.email ?? null,
      address: c.address ?? null,
      createdAt: iso(c.createdAt),
      people: people ? (peopleBy.get(c.id)?._count._all ?? 0) : null,
      deals: all ? (allBy.get(c.id)?._count._all ?? 0) : null,
      openDeals: deals ? (dealsBy.get(c.id)?._count._all ?? 0) : null,
      openDealValue: deals ? (dealsBy.get(c.id)?._sum.amount ?? 0) : null,
    }));
    return { rows, total };
  }

  private async deals(can: (p: string) => boolean, doneIds: string[]) {
    const [deals, total, contacts, tasks, openTasks] = await Promise.all([
      this.prisma.deal.findMany({
        take: ROW_LIMIT,
        orderBy: { createdAt: 'desc' },
        include: {
          stage: true,
          company: { select: { id: true, name: true } },
          person: { select: { id: true, firstName: true, lastName: true } },
          owner: { select: { firstName: true, lastName: true } },
        },
      }),
      this.prisma.deal.count(),
      can('contacts.view') ? this.prisma.contact.groupBy({ by: ['dealId'], where: { dealId: { not: null } }, _count: { _all: true }, _max: { createdAt: true } }) : null,
      can('tasks.view') ? this.prisma.task.groupBy({ by: ['dealId'], where: { dealId: { not: null } }, _count: { _all: true } }) : null,
      can('tasks.view') ? this.prisma.task.groupBy({ by: ['dealId'], where: { dealId: { not: null }, statusId: { notIn: doneIds } }, _count: { _all: true } }) : null,
    ]);
    const by = <T extends { dealId: string | null }>(list: T[] | null) => new Map((list ?? []).map((r) => [r.dealId as string, r]));
    const contactsBy = by(contacts);
    const tasksBy = by(tasks);
    const openTasksBy = by(openTasks);

    const rows = deals.map((d) => {
      const open = d.stage.outcome === 'OPEN';
      const chance = Math.min(100, Math.max(0, d.stage.winChance ?? 0));
      return {
        id: d.id,
        title: d.title,
        companyId: d.company?.id ?? null,
        company: d.company?.name ?? null,
        personId: d.person?.id ?? null,
        person: fullName(d.person),
        owner: fullName(d.owner),
        stage: d.stage.name,
        stageColour: d.stage.colour,
        outcome: d.stage.outcome,
        amount: d.amount,
        // Only an open deal is still to be won, so only an open deal has an expected value.
        // This is the same rule as the dashboard forecast: amount x the stage's win chance.
        winChance: open ? chance : null,
        expected: open ? cents((d.amount * chance) / 100) : null,
        expectedCloseDate: iso(d.expectedCloseDate),
        createdAt: iso(d.createdAt),
        contacts: contacts ? (contactsBy.get(d.id)?._count._all ?? 0) : null,
        lastContactAt: contacts ? iso(contactsBy.get(d.id)?._max.createdAt) : null,
        tasks: tasks ? (tasksBy.get(d.id)?._count._all ?? 0) : null,
        openTasks: openTasks ? (openTasksBy.get(d.id)?._count._all ?? 0) : null,
      };
    });
    return { rows, total };
  }
}
