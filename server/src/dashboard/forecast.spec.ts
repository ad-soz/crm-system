import { buildForecast, monthKey } from './forecast';

// "Now" is mid-afternoon on 8 November 2026 on the local clock, so the tests give
// the same answer in every time zone. Deal dates are stored as UTC midnight.
const NOW = new Date(2026, 10, 8, 15, 30);
const day = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

const chances = new Map([
  ['lead', 10],
  ['qualified', 25],
  ['proposal', 50],
  ['negotiation', 75],
]);

describe('buildForecast', () => {
  it('weights each deal by its stage chance (hand calculation)', () => {
    const f = buildForecast(
      [
        { amount: 75000, expectedCloseDate: day(2026, 11, 15), stageId: 'negotiation' }, // 56,250
        { amount: 120000, expectedCloseDate: day(2026, 12, 20), stageId: 'qualified' }, // 30,000
        { amount: 45000, expectedCloseDate: day(2026, 12, 1), stageId: 'proposal' }, // 22,500
        { amount: 15000, expectedCloseDate: null, stageId: 'lead' }, // 1,500
      ],
      chances,
      NOW,
    );
    expect(f.count).toBe(4);
    expect(f.total).toBe(255000);
    expect(f.weighted).toBe(110250);
  });

  it('groups by month in date order, with overdue first and no-date last', () => {
    const f = buildForecast(
      [
        { amount: 1000, expectedCloseDate: null, stageId: 'lead' },
        { amount: 2000, expectedCloseDate: day(2027, 1, 5), stageId: 'lead' },
        { amount: 3000, expectedCloseDate: day(2026, 11, 20), stageId: 'lead' },
        { amount: 4000, expectedCloseDate: day(2026, 10, 1), stageId: 'lead' },
        { amount: 5000, expectedCloseDate: day(2026, 12, 31), stageId: 'lead' },
      ],
      chances,
      NOW,
    );
    expect(f.rows.map((r) => r.key)).toEqual(['overdue', '2026-11', '2026-12', '2027-01', 'none']);
    expect(f.rows.map((r) => r.kind)).toEqual(['overdue', 'month', 'month', 'month', 'none']);
  });

  it('sums count, value and weighted value within a month', () => {
    const f = buildForecast(
      [
        { amount: 10000, expectedCloseDate: day(2026, 11, 10), stageId: 'qualified' }, // 2,500
        { amount: 20000, expectedCloseDate: day(2026, 11, 28), stageId: 'negotiation' }, // 15,000
      ],
      chances,
      NOW,
    );
    expect(f.rows).toEqual([{ key: '2026-11', kind: 'month', count: 2, value: 30000, weighted: 17500 }]);
  });

  it('treats a deal due today as this month, and yesterday as overdue', () => {
    const f = buildForecast(
      [
        { amount: 100, expectedCloseDate: day(2026, 11, 8), stageId: 'lead' },
        { amount: 200, expectedCloseDate: day(2026, 11, 7), stageId: 'lead' },
      ],
      chances,
      NOW,
    );
    expect(f.rows.map((r) => [r.key, r.value])).toEqual([
      ['overdue', 200],
      ['2026-11', 100],
    ]);
  });

  it('counts a stage with no chance as zero rather than guessing', () => {
    const f = buildForecast([{ amount: 5000, expectedCloseDate: null, stageId: 'unknown' }], chances, NOW);
    expect(f.total).toBe(5000);
    expect(f.weighted).toBe(0);
  });

  it('never lets an out-of-range chance inflate or reverse the forecast', () => {
    const wild = new Map([
      ['high', 250],
      ['low', -40],
    ]);
    const f = buildForecast(
      [
        { amount: 1000, expectedCloseDate: null, stageId: 'high' },
        { amount: 1000, expectedCloseDate: null, stageId: 'low' },
      ],
      wild,
      NOW,
    );
    expect(f.weighted).toBe(1000); // 100% + 0%
  });

  it('ignores a non-numeric amount instead of poisoning the totals', () => {
    const f = buildForecast(
      [
        { amount: NaN, expectedCloseDate: null, stageId: 'lead' },
        { amount: 1000, expectedCloseDate: null, stageId: 'lead' },
      ],
      chances,
      NOW,
    );
    expect(f.total).toBe(1000);
    expect(f.weighted).toBe(100);
  });

  it('rounds to whole cents', () => {
    const f = buildForecast([{ amount: 33.33, expectedCloseDate: null, stageId: 'lead' }], chances, NOW);
    expect(f.weighted).toBe(3.33);
  });

  it('handles no deals', () => {
    expect(buildForecast([], chances, NOW)).toEqual({ count: 0, total: 0, weighted: 0, rows: [] });
  });

  it('puts a late-evening UTC date in the month it was entered for', () => {
    // A date picker stores the 30th as midnight UTC; it must stay in November.
    expect(monthKey(day(2026, 11, 30))).toBe('2026-11');
    expect(monthKey(day(2026, 12, 1))).toBe('2026-12');
  });
});
