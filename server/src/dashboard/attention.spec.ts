import { AttentionDeal, buildDealAttention, MAX_ITEMS, STALE_DAYS } from './attention';

const NOW = new Date(2026, 10, 8, 15, 0); // 3pm on 8 Nov 2026, local clock (same answer in every time zone)
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

const deal = (over: Partial<AttentionDeal> & { id: string }): AttentionDeal => ({
  title: `Deal ${over.id}`,
  amount: 1000,
  ownerId: 'me',
  personId: null,
  createdAt: daysAgo(100),
  expectedCloseDate: null,
  ...over,
});

const none = new Map<string, Date>();

describe('buildDealAttention: stale deals', () => {
  it('flags a deal with no contact for 14 days or more', () => {
    const r = buildDealAttention([deal({ id: 'a' })], 'me', none, none, NOW);
    expect(r.staleDeals.count).toBe(1);
    expect(r.staleDeals.items[0]).toMatchObject({ id: 'a', quietDays: 100 });
  });

  it('is exactly 14 days: 13 is fine, 14 is stale', () => {
    const quiet = (days: number) =>
      buildDealAttention([deal({ id: 'a' })], 'me', new Map([['a', daysAgo(days)]]), none, NOW).staleDeals.count;
    expect(STALE_DAYS).toBe(14);
    expect(quiet(13)).toBe(0);
    expect(quiet(14)).toBe(1);
  });

  it('counts contact logged on the deal OR on its person', () => {
    const d = deal({ id: 'a', personId: 'c1' });
    expect(buildDealAttention([d], 'me', none, new Map([['c1', daysAgo(2)]]), NOW).staleDeals.count).toBe(0);
    expect(buildDealAttention([d], 'me', new Map([['a', daysAgo(2)]]), none, NOW).staleDeals.count).toBe(0);
    // A contact on someone else's person does not count.
    expect(buildDealAttention([d], 'me', none, new Map([['other', daysAgo(2)]]), NOW).staleDeals.count).toBe(1);
  });

  it('uses the most recent contact when there are several', () => {
    const d = deal({ id: 'a', personId: 'c1' });
    const r = buildDealAttention([d], 'me', new Map([['a', daysAgo(30)]]), new Map([['c1', daysAgo(20)]]), NOW);
    expect(r.staleDeals.items[0].quietDays).toBe(20);
  });

  it('does not flag a brand new deal that has had no contact yet', () => {
    const r = buildDealAttention([deal({ id: 'new', createdAt: daysAgo(3) })], 'me', none, none, NOW);
    expect(r.staleDeals.count).toBe(0);
  });

  it('flags a deal created long ago with no contact ever, counting from creation', () => {
    const r = buildDealAttention([deal({ id: 'old', createdAt: daysAgo(40) })], 'me', none, none, NOW);
    expect(r.staleDeals.items[0].quietDays).toBe(40);
  });

  it('only looks at the person\'s own deals', () => {
    const r = buildDealAttention(
      [deal({ id: 'mine' }), deal({ id: 'theirs', ownerId: 'someone-else' }), deal({ id: 'nobody', ownerId: null })],
      'me',
      none,
      none,
      NOW,
    );
    expect(r.staleDeals.items.map((i) => i.id)).toEqual(['mine']);
  });

  it('lists the quietest first, then the biggest, and keeps the full count', () => {
    const deals = Array.from({ length: 8 }, (_, i) => deal({ id: `d${i}`, createdAt: daysAgo(20 + i) }));
    const r = buildDealAttention(deals, 'me', none, none, NOW);
    expect(r.staleDeals.count).toBe(8);
    expect(r.staleDeals.items).toHaveLength(MAX_ITEMS);
    expect(r.staleDeals.items.map((i) => i.id)).toEqual(['d7', 'd6', 'd5', 'd4', 'd3']);
  });
});

describe('buildDealAttention: past-due deals', () => {
  const recent = daysAgo(1); // keep these from also being stale

  it('flags a close date that has passed, and says by how many days', () => {
    const r = buildDealAttention([deal({ id: 'a', createdAt: recent, expectedCloseDate: utc(2026, 11, 3) })], 'me', none, none, NOW);
    expect(r.pastDueDeals.items).toEqual([{ id: 'a', title: 'Deal a', amount: 1000, daysLate: 5 }]);
  });

  it('does not flag today, or the future, or no date', () => {
    const r = buildDealAttention(
      [
        deal({ id: 'today', createdAt: recent, expectedCloseDate: utc(2026, 11, 8) }),
        deal({ id: 'future', createdAt: recent, expectedCloseDate: utc(2026, 12, 1) }),
        deal({ id: 'nodate', createdAt: recent, expectedCloseDate: null }),
      ],
      'me',
      none,
      none,
      NOW,
    );
    expect(r.pastDueDeals.count).toBe(0);
  });

  it('can be both stale and past due, and appears in both lists', () => {
    const r = buildDealAttention([deal({ id: 'a', expectedCloseDate: utc(2026, 10, 1) })], 'me', none, none, NOW);
    expect(r.staleDeals.count).toBe(1);
    expect(r.pastDueDeals.count).toBe(1);
  });

  it('puts the furthest overdue first', () => {
    const r = buildDealAttention(
      [
        deal({ id: 'a', createdAt: recent, expectedCloseDate: utc(2026, 11, 6) }),
        deal({ id: 'b', createdAt: recent, expectedCloseDate: utc(2026, 9, 1) }),
      ],
      'me',
      none,
      none,
      NOW,
    );
    expect(r.pastDueDeals.items.map((i) => i.id)).toEqual(['b', 'a']);
  });
});

it('handles no deals', () => {
  const r = buildDealAttention([], 'me', none, none, NOW);
  expect(r.staleDeals).toEqual({ count: 0, items: [] });
  expect(r.pastDueDeals).toEqual({ count: 0, items: [] });
});
