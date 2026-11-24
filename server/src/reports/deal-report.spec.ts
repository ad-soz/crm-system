import {
  buildDealReport,
  monthKeys,
  localMonthKey,
  STALLED_LIMIT,
  ReportChange,
  ReportDeal,
  ReportInput,
  ReportStage,
} from './deal-report';

/**
 * The expected numbers below were worked out by hand from this data, before the
 * code was written. "Now" is 3pm on 8 November 2026 and the report covers
 * 3 months: September, October, November.
 */
const NOW = new Date(2026, 10, 8, 15, 0);
const at = (m: number, d: number, h = 12, y = 2026) => new Date(y, m - 1, d, h, 0);

const stages: ReportStage[] = [
  { id: 'lead', name: 'Lead', colour: 'secondary', outcome: 'OPEN', winChance: 10, sortOrder: 0 },
  { id: 'qualified', name: 'Qualified', colour: 'info', outcome: 'OPEN', winChance: 25, sortOrder: 1 },
  { id: 'proposal', name: 'Proposal', colour: 'warning', outcome: 'OPEN', winChance: 50, sortOrder: 2 },
  { id: 'won', name: 'Won', colour: 'success', outcome: 'WON', winChance: 100, sortOrder: 3 },
  { id: 'lost', name: 'Lost', colour: 'destructive', outcome: 'LOST', winChance: 0, sortOrder: 4 },
];
const owners = [
  { id: 'a', name: 'Alice' },
  { id: 'b', name: 'Bob' },
];

const deal = (id: string, title: string, amount: number, stageId: string, ownerId: string | null, createdAt: Date): ReportDeal => ({
  id,
  title,
  amount,
  stageId,
  ownerId,
  createdAt,
});
const move = (dealId: string, toStageId: string, createdAt: Date): ReportChange => ({ dealId, toStageId, createdAt });

const deals: ReportDeal[] = [
  deal('d1', 'Alpha', 10000, 'qualified', 'a', at(9, 5)), // moved to Qualified 3 Oct
  deal('d2', 'Bravo', 20000, 'won', 'a', at(8, 20)), // created before the period; won 15 Oct
  deal('d3', 'Charlie', 5000, 'lost', 'b', at(10, 1)), // lost 2 Nov
  deal('d4', 'Delta', 8000, 'won', 'b', at(1, 10)), // won long ago, no recorded move
  deal('d5', 'Echo', 1000, 'lead', null, at(11, 1, 9)), // new, no owner, never moved
  deal('d6', 'Foxtrot', 40000, 'proposal', 'b', at(7, 1, 0)), // old, never recorded as moved
  deal('d7', 'Golf', 3000, 'won', 'a', at(9, 20)), // won 25 Sep
  deal('d8', 'Hotel', 2000, 'qualified', 'a', at(9, 2)), // won 12 Sep, then reopened 20 Sep
];
const changes: ReportChange[] = [
  move('d1', 'qualified', at(10, 3)),
  move('d2', 'proposal', at(9, 10)),
  move('d2', 'won', at(10, 15)),
  move('d3', 'lost', at(11, 2)),
  move('d7', 'won', at(9, 25)),
  move('d8', 'won', at(9, 12)),
  move('d8', 'qualified', at(9, 20)),
];

const base: ReportInput = {
  deals,
  stages,
  changes,
  owners,
  months: 3,
  historySince: at(10, 20), // history began 20 October
  now: NOW,
};

describe('buildDealReport (everyone, 3 months)', () => {
  const r = buildDealReport(base);

  it('covers the last three calendar months, oldest first', () => {
    expect(r.months).toEqual(['2026-09', '2026-10', '2026-11']);
  });

  it('counts deals created in the period (not earlier ones)', () => {
    // Alpha 10,000 + Charlie 5,000 + Echo 1,000 + Golf 3,000 + Hotel 2,000
    expect(r.summary.created).toEqual({ count: 5, value: 21000 });
    expect(r.byMonth.map((m) => [m.key, m.created.count, m.created.value])).toEqual([
      ['2026-09', 3, 15000], // Alpha, Golf, Hotel
      ['2026-10', 1, 5000], // Charlie
      ['2026-11', 1, 1000], // Echo
    ]);
  });

  it('counts wins and losses in the month they were recorded', () => {
    // Bravo won 15 Oct (20,000) and Golf won 25 Sep (3,000); Charlie lost 2 Nov (5,000)
    expect(r.summary.won).toEqual({ count: 2, value: 23000 });
    expect(r.summary.lost).toEqual({ count: 1, value: 5000 });
    expect(r.byMonth.map((m) => [m.key, m.won.count, m.won.value, m.lost.count, m.lost.value])).toEqual([
      ['2026-09', 1, 3000, 0, 0],
      ['2026-10', 1, 20000, 0, 0],
      ['2026-11', 0, 0, 1, 5000],
    ]);
  });

  it('works out the win rate from deals closed in the period: 2 won of 3 closed = 67%', () => {
    expect(r.summary.winRate).toBe(67);
  });

  it('does not count a reopened deal as a win', () => {
    // Hotel was won on 12 Sep but moved back to Qualified on 20 Sep, so it is open, not a win.
    expect(r.summary.won.value).toBe(23000); // no +2,000
    expect(r.summary.open.count).toBe(4);
  });

  it('reports the open pipeline and its weighted value', () => {
    // Alpha 10,000 x 25% = 2,500; Echo 1,000 x 10% = 100; Foxtrot 40,000 x 50% = 20,000; Hotel 2,000 x 25% = 500
    expect(r.summary.open).toEqual({ count: 4, value: 53000, weighted: 23100 });
  });

  it('keeps already-closed deals with no recorded closing move out of every month', () => {
    // Delta (8,000) was won before history began: its month cannot be known.
    expect(r.closedDateUnknown.won).toEqual({ count: 1, value: 8000 });
    expect(r.closedDateUnknown.lost).toEqual({ count: 0, value: 0 });
    expect(r.byMonth.reduce((n, m) => n + m.won.value, 0)).toBe(23000); // Delta is nowhere in the months
  });

  it('counts stage moves by month and by the stage moved into', () => {
    expect(r.byMonth.map((m) => m.moves)).toEqual([4, 2, 1]);
    const by = Object.fromEntries(r.movement.rows.map((row) => [row.key, row.counts]));
    expect(by['2026-09']).toEqual({ proposal: 1, won: 2, qualified: 1 }); // Bravo, Golf+Hotel, Hotel
    expect(by['2026-10']).toEqual({ qualified: 1, won: 1 }); // Alpha, Bravo
    expect(by['2026-11']).toEqual({ lost: 1 }); // Charlie
    expect(r.movement.totals).toEqual({ qualified: 2, proposal: 1, won: 3, lost: 1 });
    expect(r.movement.stages.map((s) => s.id)).toEqual(['lead', 'qualified', 'proposal', 'won', 'lost']);
  });

  it('lists the longest-waiting open deals first, with how long and how sure', () => {
    expect(r.stalled.total).toBe(4);
    expect(r.stalled.items.map((s) => [s.title, s.days, s.approximate])).toEqual([
      ['Foxtrot', 130, true], // since 1 Jul, never recorded as moved: could be shorter
      ['Hotel', 49, false], // back in Qualified since 20 Sep
      ['Alpha', 36, false], // in Qualified since 3 Oct
      ['Echo', 7, false], // created 1 Nov, after history began, so it cannot have moved unseen
    ]);
    expect(r.stalled.items[0].stage).toEqual({ id: 'proposal', name: 'Proposal', colour: 'warning' });
    expect(r.stalled.items[3].ownerName).toBeNull();
  });

  it('gives each person their own figures, biggest open pipeline first', () => {
    expect(r.byPerson.map((p) => p.name)).toEqual(['Bob', 'Alice', 'Unassigned']);
    const [bob, alice, nobody] = r.byPerson;
    expect(bob).toMatchObject({
      open: { count: 1, value: 40000, weighted: 20000 },
      created: { count: 1, value: 5000 },
      won: { count: 0, value: 0 }, // Delta's win has no known date
      lost: { count: 1, value: 5000 },
    });
    expect(alice).toMatchObject({
      open: { count: 2, value: 12000, weighted: 3000 },
      created: { count: 3, value: 15000 },
      won: { count: 2, value: 23000 },
      lost: { count: 0, value: 0 },
    });
    expect(nobody).toMatchObject({ ownerId: null, open: { count: 1, value: 1000, weighted: 100 }, created: { count: 1, value: 1000 } });
  });

  it('adds up: the people sum to the headline figures', () => {
    const sum = (pick: (p: (typeof r.byPerson)[number]) => number) => r.byPerson.reduce((n, p) => n + pick(p), 0);
    expect(sum((p) => p.created.value)).toBe(r.summary.created.value);
    expect(sum((p) => p.won.value)).toBe(r.summary.won.value);
    expect(sum((p) => p.lost.value)).toBe(r.summary.lost.value);
    expect(sum((p) => p.open.weighted)).toBe(r.summary.open.weighted);
    expect(r.byMonth.reduce((n, m) => n + m.created.count, 0)).toBe(r.summary.created.count);
    expect(r.byMonth.reduce((n, m) => n + m.moves, 0)).toBe(Object.values(r.movement.totals).reduce((a, b) => a + b, 0));
  });
});

describe('buildDealReport (one person)', () => {
  const r = buildDealReport({ ...base, ownerId: 'a' });

  it('looks only at that person\'s deals', () => {
    expect(r.summary.created).toEqual({ count: 3, value: 15000 });
    expect(r.summary.won).toEqual({ count: 2, value: 23000 });
    expect(r.summary.lost).toEqual({ count: 0, value: 0 });
    expect(r.summary.winRate).toBe(100);
    expect(r.summary.open).toEqual({ count: 2, value: 12000, weighted: 3000 });
    expect(r.closedDateUnknown.won.count).toBe(0); // Delta is Bob's
    expect(r.stalled.items.map((s) => s.title)).toEqual(['Hotel', 'Alpha']);
    expect(r.byPerson.map((p) => p.name)).toEqual(['Alice']);
    expect(r.byMonth.reduce((n, m) => n + m.moves, 0)).toBe(6); // Bob's Charlie move is not counted
  });
});

describe('buildDealReport edge cases', () => {
  it('handles no deals at all', () => {
    const r = buildDealReport({ ...base, deals: [], changes: [] });
    expect(r.summary.created).toEqual({ count: 0, value: 0 });
    expect(r.summary.winRate).toBeNull();
    expect(r.byPerson).toEqual([]);
    expect(r.stalled).toEqual({ total: 0, items: [] });
    expect(r.byMonth).toHaveLength(3);
  });

  it('has no win rate when nothing closed in the period', () => {
    const r = buildDealReport({ ...base, deals: [deals[0]], changes: [changes[0]] });
    expect(r.summary.winRate).toBeNull();
  });

  it('marks every un-moved deal approximate when nobody knows when history began', () => {
    const r = buildDealReport({ ...base, historySince: null });
    const echo = r.stalled.items.find((s) => s.title === 'Echo')!;
    expect(echo.approximate).toBe(true);
    // A deal with a recorded move is still exact.
    expect(r.stalled.items.find((s) => s.title === 'Alpha')!.approximate).toBe(false);
  });

  it('crosses a year boundary correctly', () => {
    expect(monthKeys(3, new Date(2027, 0, 15))).toEqual(['2026-11', '2026-12', '2027-01']);
    expect(monthKeys(12, new Date(2026, 10, 8))[0]).toBe('2025-12');
    expect(localMonthKey(new Date(2026, 11, 31, 23, 59))).toBe('2026-12');
  });

  it('puts a move at 11:59pm on the last day in that month, and midnight after in the next', () => {
    const d = [deal('x', 'X', 100, 'won', 'a', at(10, 1))];
    const late = buildDealReport({ ...base, deals: d, changes: [move('x', 'won', new Date(2026, 9, 31, 23, 59))] });
    expect(late.byMonth.find((m) => m.key === '2026-10')!.won.count).toBe(1);
    const next = buildDealReport({ ...base, deals: d, changes: [move('x', 'won', new Date(2026, 10, 1, 0, 0))] });
    expect(next.byMonth.find((m) => m.key === '2026-11')!.won.count).toBe(1);
  });

  it('ignores moves and creations before the period or in the future', () => {
    const d = [deal('x', 'X', 100, 'won', 'a', at(1, 1))];
    const r = buildDealReport({ ...base, deals: d, changes: [move('x', 'won', at(8, 30)), move('x', 'won', at(12, 25))] });
    expect(r.summary.won.count).toBe(0);
    expect(r.byMonth.reduce((n, m) => n + m.moves, 0)).toBe(0);
  });

  it('skips a deal whose stage no longer exists rather than failing', () => {
    const r = buildDealReport({ ...base, deals: [deal('x', 'X', 100, 'gone', 'a', at(10, 1))], changes: [] });
    expect(r.summary.created.count).toBe(0);
    expect(r.summary.open.count).toBe(0);
  });

  it('ignores a non-numeric amount instead of poisoning the totals', () => {
    const r = buildDealReport({ ...base, deals: [deal('x', 'X', NaN, 'lead', 'a', at(10, 1)), deal('y', 'Y', 500, 'lead', 'a', at(10, 2))], changes: [] });
    expect(r.summary.created.value).toBe(500);
    expect(r.summary.open.weighted).toBe(50);
  });

  it('names a removed owner as "Former user" and never shows an id', () => {
    const r = buildDealReport({ ...base, deals: [deal('x', 'X', 100, 'lead', 'ghost', at(10, 1))], changes: [] });
    expect(r.byPerson[0].name).toBe('Former user');
    expect(r.stalled.items[0].ownerName).toBe('Former user');
  });

  it('caps the stalled list but still says how many there are', () => {
    const many = Array.from({ length: 14 }, (_, i) => deal(`m${i}`, `Deal ${i}`, 100, 'lead', 'a', at(10, 1 + (i % 5))));
    const r = buildDealReport({ ...base, deals: many, changes: [] });
    expect(r.stalled.total).toBe(14);
    expect(r.stalled.items).toHaveLength(STALLED_LIMIT);
  });

  it('breaks ties between equally old deals by value, then name, so the order is stable', () => {
    const t = at(10, 1);
    const r = buildDealReport({
      ...base,
      deals: [deal('1', 'Bee', 100, 'lead', 'a', t), deal('2', 'Ant', 100, 'lead', 'a', t), deal('3', 'Cat', 900, 'lead', 'a', t)],
      changes: [],
    });
    expect(r.stalled.items.map((s) => s.title)).toEqual(['Cat', 'Ant', 'Bee']);
  });

  it('rounds money to whole cents', () => {
    const r = buildDealReport({ ...base, deals: [deal('x', 'X', 33.33, 'lead', 'a', at(10, 1))], changes: [] });
    expect(r.summary.open.weighted).toBe(3.33);
  });

  it('treats a changed stage order as the order to show', () => {
    const r = buildDealReport({ ...base, stages: [{ ...stages[0], sortOrder: 9 }, ...stages.slice(1)] });
    expect(r.movement.stages.at(-1)!.id).toBe('lead');
  });
});
