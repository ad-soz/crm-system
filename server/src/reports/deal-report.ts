/**
 * Deal reporting: how deals change over time.
 *
 * Everything here is plain calculation on rows passed in, so it can be tested
 * against numbers worked out by hand. It reads data and never changes it.
 *
 * What is and is not known (this shapes every figure below):
 *  - When a deal was CREATED is always known.
 *  - Stage moves are recorded from `historySince` onward (the day the stage
 *    comment feature shipped). A deal's CLOSING date is therefore known only if
 *    it was closed after that. Deals that were already won or lost earlier are
 *    counted separately as "closed, date unknown" and are never guessed into a month.
 *  - How long a deal has been in its stage is exact if it has a recorded move to
 *    that stage, or if it was created after history began (so it cannot have moved
 *    unrecorded). Otherwise it is marked approximate.
 *
 * Months are the local calendar months of the computer running the CRM (these
 * are real moments in time, unlike close dates, which are calendar dates).
 */

export interface ReportStage {
  id: string;
  name: string;
  colour: string;
  /** 'OPEN', 'WON' or 'LOST'. */
  outcome: string;
  winChance: number;
  sortOrder: number;
}

export interface ReportDeal {
  id: string;
  title: string;
  amount: number;
  stageId: string;
  ownerId: string | null;
  createdAt: Date;
}

export interface ReportChange {
  dealId: string;
  toStageId: string;
  createdAt: Date;
}

export interface ReportOwner {
  id: string;
  name: string;
}

export interface Money {
  count: number;
  value: number;
}

export interface OpenMoney extends Money {
  /** Sum of amount x the stage's win chance. */
  weighted: number;
}

export interface MonthRow {
  key: string;
  created: Money;
  won: Money;
  lost: Money;
  /** Stage moves recorded in the month. */
  moves: number;
}

export interface StalledDeal {
  id: string;
  title: string;
  amount: number;
  stage: { id: string; name: string; colour: string };
  ownerName: string | null;
  /** Whole days in the current stage. */
  days: number;
  since: string;
  /** True when it may have moved before history began, so the real figure could be shorter. */
  approximate: boolean;
}

export interface PersonRow {
  ownerId: string | null;
  name: string;
  open: OpenMoney;
  created: Money;
  won: Money;
  lost: Money;
}

export interface DealReport {
  months: string[];
  summary: {
    created: Money;
    won: Money;
    lost: Money;
    /** Won as a percentage of won + lost closed in the period; null when nothing closed. */
    winRate: number | null;
    open: OpenMoney;
  };
  byMonth: MonthRow[];
  movement: {
    stages: { id: string; name: string; colour: string }[];
    /** counts[monthKey][stageId] = moves into that stage in that month. */
    rows: { key: string; counts: Record<string, number> }[];
    totals: Record<string, number>;
  };
  /** Deals already won or lost but with no recorded closing move, so no month can be given. */
  closedDateUnknown: { won: Money; lost: Money };
  stalled: { total: number; items: StalledDeal[] };
  byPerson: PersonRow[];
}

export interface ReportInput {
  deals: ReportDeal[];
  stages: ReportStage[];
  changes: ReportChange[];
  owners: ReportOwner[];
  months: number;
  /** Only deals owned by this person; omit for everyone. */
  ownerId?: string;
  /** When stage-move history began, or null if unknown. */
  historySince: Date | null;
  now?: Date;
}

export const STALLED_LIMIT = 10;
const DAY = 24 * 60 * 60 * 1000;

const cents = (n: number) => Math.round(n * 100) / 100;
const pad = (n: number) => String(n).padStart(2, '0');
const zero = (): Money => ({ count: 0, value: 0 });
const zeroOpen = (): OpenMoney => ({ count: 0, value: 0, weighted: 0 });

export function localMonthKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** The last `months` calendar months ending with the current one, oldest first. */
export function monthKeys(months: number, now: Date): string[] {
  return Array.from({ length: months }, (_, i) =>
    localMonthKey(new Date(now.getFullYear(), now.getMonth() - (months - 1) + i, 1)),
  );
}

function addTo(target: Money, amount: number) {
  target.count += 1;
  target.value += amount;
}

function tidy<T extends Money>(m: T): T {
  m.value = cents(m.value);
  if ('weighted' in m) (m as unknown as OpenMoney).weighted = cents((m as unknown as OpenMoney).weighted);
  return m;
}

export function buildDealReport(input: ReportInput): DealReport {
  const now = input.now ?? new Date();
  const keys = monthKeys(input.months, now);
  const periodStart = new Date(now.getFullYear(), now.getMonth() - (input.months - 1), 1);
  const inPeriod = (d: Date) => d.getTime() >= periodStart.getTime() && d.getTime() <= now.getTime();

  const stages = [...input.stages].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const stageById = new Map(stages.map((s) => [s.id, s]));
  const ownerName = new Map(input.owners.map((o) => [o.id, o.name]));

  const deals = input.ownerId ? input.deals.filter((d) => d.ownerId === input.ownerId) : input.deals;
  const dealIds = new Set(deals.map((d) => d.id));

  // Changes per deal, kept in time order.
  const changesByDeal = new Map<string, ReportChange[]>();
  for (const c of input.changes) {
    if (!dealIds.has(c.dealId)) continue;
    const list = changesByDeal.get(c.dealId) ?? [];
    list.push(c);
    changesByDeal.set(c.dealId, list);
  }
  for (const list of changesByDeal.values()) list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const byMonth = new Map<string, MonthRow>(
    keys.map((key) => [key, { key, created: zero(), won: zero(), lost: zero(), moves: 0 }]),
  );
  const movement = new Map<string, Record<string, number>>(keys.map((k) => [k, {}]));
  const movementTotals: Record<string, number> = {};

  const summary = { created: zero(), won: zero(), lost: zero(), open: zeroOpen() };
  const closedUnknown = { won: zero(), lost: zero() };
  const stalled: StalledDeal[] = [];
  const people = new Map<string | null, PersonRow>();
  const person = (ownerId: string | null): PersonRow => {
    let row = people.get(ownerId);
    if (!row) {
      row = {
        ownerId,
        name: ownerId ? (ownerName.get(ownerId) ?? 'Former user') : 'Unassigned',
        open: zeroOpen(),
        created: zero(),
        won: zero(),
        lost: zero(),
      };
      people.set(ownerId, row);
    }
    return row;
  };

  // Stage moves in the period, by month and by the stage moved into.
  for (const [, list] of changesByDeal) {
    for (const c of list) {
      if (!inPeriod(c.createdAt)) continue;
      const key = localMonthKey(c.createdAt);
      byMonth.get(key)!.moves += 1;
      const row = movement.get(key)!;
      row[c.toStageId] = (row[c.toStageId] ?? 0) + 1;
      movementTotals[c.toStageId] = (movementTotals[c.toStageId] ?? 0) + 1;
    }
  }

  for (const deal of deals) {
    const stage = stageById.get(deal.stageId);
    if (!stage) continue;
    const amount = Number.isFinite(deal.amount) ? deal.amount : 0;
    const who = person(deal.ownerId);
    const changes = changesByDeal.get(deal.id) ?? [];
    // The latest recorded move into the stage the deal is in now.
    const lastIntoCurrent = [...changes].reverse().find((c) => c.toStageId === deal.stageId);

    if (inPeriod(deal.createdAt)) {
      addTo(summary.created, amount);
      addTo(who.created, amount);
      addTo(byMonth.get(localMonthKey(deal.createdAt))!.created, amount);
    }

    if (stage.outcome === 'WON' || stage.outcome === 'LOST') {
      const kind = stage.outcome === 'WON' ? 'won' : 'lost';
      if (!lastIntoCurrent) {
        addTo(closedUnknown[kind], amount);
      } else if (inPeriod(lastIntoCurrent.createdAt)) {
        addTo(summary[kind], amount);
        addTo(who[kind], amount);
        addTo(byMonth.get(localMonthKey(lastIntoCurrent.createdAt))![kind], amount);
      }
      continue;
    }

    // Open deal.
    const chance = Math.min(100, Math.max(0, stage.winChance ?? 0));
    const worth = (amount * chance) / 100;
    for (const open of [summary.open, who.open]) {
      open.count += 1;
      open.value += amount;
      open.weighted += worth;
    }

    const since = lastIntoCurrent ? lastIntoCurrent.createdAt : deal.createdAt;
    const approximate = !lastIntoCurrent && (!input.historySince || deal.createdAt.getTime() < input.historySince.getTime());
    stalled.push({
      id: deal.id,
      title: deal.title,
      amount,
      stage: { id: stage.id, name: stage.name, colour: stage.colour },
      ownerName: deal.ownerId ? (ownerName.get(deal.ownerId) ?? 'Former user') : null,
      days: Math.max(0, Math.floor((now.getTime() - since.getTime()) / DAY)),
      since: since.toISOString(),
      approximate,
    });
  }

  stalled.sort((a, b) => b.days - a.days || b.amount - a.amount || a.title.localeCompare(b.title));

  const closedKnown = summary.won.count + summary.lost.count;
  const personRows = [...people.values()]
    .map((p) => ({ ...p, open: tidy(p.open), created: tidy(p.created), won: tidy(p.won), lost: tidy(p.lost) }))
    .sort((a, b) => b.open.value - a.open.value || a.name.localeCompare(b.name));

  return {
    months: keys,
    summary: {
      created: tidy(summary.created),
      won: tidy(summary.won),
      lost: tidy(summary.lost),
      winRate: closedKnown ? Math.round((summary.won.count / closedKnown) * 100) : null,
      open: tidy(summary.open),
    },
    byMonth: keys.map((k) => {
      const row = byMonth.get(k)!;
      return { ...row, created: tidy(row.created), won: tidy(row.won), lost: tidy(row.lost) };
    }),
    movement: {
      stages: stages.map((s) => ({ id: s.id, name: s.name, colour: s.colour })),
      rows: keys.map((k) => ({ key: k, counts: movement.get(k)! })),
      totals: movementTotals,
    },
    closedDateUnknown: { won: tidy(closedUnknown.won), lost: tidy(closedUnknown.lost) },
    stalled: { total: stalled.length, items: stalled.slice(0, STALLED_LIMIT) },
    byPerson: personRows,
  };
}
