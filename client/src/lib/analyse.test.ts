import { describe, it, expect } from 'vitest';
import {
  applyFilters,
  categoryOptions,
  countFilters,
  emptyFilters,
  exportRows,
  groupRows,
  monthLabel,
  NONE,
  parseView,
  sortRows,
  summarise,
  viewToParams,
  type Column,
  type ViewDefaults,
} from '@/lib/analyse';

// A small set of deals worked out by hand, so every figure below can be checked with a pencil.
interface Deal {
  id: string;
  title: string;
  company: string | null;
  stage: string;
  owner: string | null;
  amount: number;
  expected: number | null;
  closes: string | null;
  tags: string[];
}

const deals: Deal[] = [
  { id: '1', title: 'Alpha', company: 'Acme', stage: 'Lead', owner: 'Ann', amount: 1000, expected: 100, closes: '2026-12-10T00:00:00.000Z', tags: ['Tech'] },
  { id: '2', title: 'Beta', company: 'Acme', stage: 'Proposal', owner: 'Bob', amount: 3000, expected: 1500, closes: '2026-12-20T00:00:00.000Z', tags: ['Tech', 'Retail'] },
  { id: '3', title: 'Gamma', company: 'Zenith', stage: 'Lead', owner: 'Ann', amount: 500, expected: 50, closes: '2027-01-05T00:00:00.000Z', tags: [] },
  { id: '4', title: 'Delta', company: null, stage: 'Proposal', owner: null, amount: 2500, expected: 1250, closes: null, tags: ['Retail'] },
  { id: '5', title: 'Epsilon', company: 'Zenith', stage: 'Won', owner: 'Bob', amount: 4000, expected: null, closes: '2026-11-30T00:00:00.000Z', tags: ['Tech'] },
];

const cols: Column<Deal>[] = [
  { key: 'title', label: 'Title', type: 'text', get: (r) => r.title },
  { key: 'company', label: 'Company', type: 'category', get: (r) => r.company },
  { key: 'stage', label: 'Stage', type: 'category', get: (r) => r.stage },
  { key: 'owner', label: 'Owner', type: 'category', get: (r) => r.owner },
  { key: 'tags', label: 'Industry', type: 'category', get: (r) => r.tags },
  { key: 'amount', label: 'Amount', type: 'currency', get: (r) => r.amount },
  { key: 'expected', label: 'Expected', type: 'currency', get: (r) => r.expected },
  { key: 'closes', label: 'Closes', type: 'date', get: (r) => r.closes },
];
const col = (k: string) => cols.find((c) => c.key === k)!;
const ids = (rows: Deal[]) => rows.map((r) => r.id);

describe('summarise', () => {
  it('adds up, averages, and finds the smallest and largest', () => {
    // 1000 + 3000 + 500 + 2500 + 4000 = 11000, over 5 deals = 2200
    expect(summarise(deals, col('amount'))).toMatchObject({ count: 5, counted: 5, sum: 11000, average: 2200, min: 500, max: 4000 });
  });

  it('leaves out rows with no figure, so the average is not dragged down', () => {
    // 100 + 1500 + 50 + 1250 = 2900 over the 4 deals that have one
    expect(summarise(deals, col('expected'))).toMatchObject({ count: 5, counted: 4, sum: 2900, average: 725 });
  });

  it('counts rows when there is no measure', () => {
    expect(summarise(deals)).toMatchObject({ count: 5, sum: 0, average: null });
  });

  it('handles nothing at all', () => {
    expect(summarise([], col('amount'))).toMatchObject({ count: 0, sum: 0, average: null, min: null, max: null });
  });

  it('rounds to the cent', () => {
    const rows = [{ ...deals[0], amount: 0.1 }, { ...deals[1], amount: 0.2 }];
    expect(summarise(rows, col('amount')).sum).toBe(0.3);
  });
});

describe('filtering', () => {
  it('finds rows by words anywhere in text and category columns, all words required, any case', () => {
    expect(ids(applyFilters(deals, cols, { ...emptyFilters(), q: 'acme' }))).toEqual(['1', '2']);
    expect(ids(applyFilters(deals, cols, { ...emptyFilters(), q: 'ZENITH lead' }))).toEqual(['3']);
    expect(ids(applyFilters(deals, cols, { ...emptyFilters(), q: 'nothing like this' }))).toEqual([]);
  });

  it('keeps rows whose category is any of the chosen values', () => {
    const f = { ...emptyFilters(), categories: { stage: ['Lead', 'Won'] } };
    expect(ids(applyFilters(deals, cols, f))).toEqual(['1', '3', '5']);
  });

  it('matches a row with several values if any one is chosen', () => {
    expect(ids(applyFilters(deals, cols, { ...emptyFilters(), categories: { tags: ['Retail'] } }))).toEqual(['2', '4']);
  });

  it('lets you pick the rows that have nothing', () => {
    expect(ids(applyFilters(deals, cols, { ...emptyFilters(), categories: { company: [NONE] } }))).toEqual(['4']);
    expect(ids(applyFilters(deals, cols, { ...emptyFilters(), categories: { tags: [NONE] } }))).toEqual(['3']);
  });

  it('combines filters: every one must hold', () => {
    const f = { ...emptyFilters(), categories: { stage: ['Lead', 'Proposal'], owner: ['Ann'] } };
    expect(ids(applyFilters(deals, cols, f))).toEqual(['1', '3']);
  });

  it('filters a number range, both ends included, and drops rows with no figure', () => {
    expect(ids(applyFilters(deals, cols, { ...emptyFilters(), ranges: { amount: { min: 1000, max: 3000 } } }))).toEqual(['1', '2', '4']);
    expect(ids(applyFilters(deals, cols, { ...emptyFilters(), ranges: { expected: { min: 0 } } }))).toEqual(['1', '2', '3', '4']);
    expect(ids(applyFilters(deals, cols, { ...emptyFilters(), ranges: { amount: { max: 999 } } }))).toEqual(['3']);
  });

  it('filters a date range by calendar day, both ends included, and drops rows with no date', () => {
    expect(ids(applyFilters(deals, cols, { ...emptyFilters(), dates: { closes: { from: '2026-12-10', to: '2026-12-20' } } }))).toEqual(['1', '2']);
    expect(ids(applyFilters(deals, cols, { ...emptyFilters(), dates: { closes: { from: '2027-01-01' } } }))).toEqual(['3']);
    expect(ids(applyFilters(deals, cols, { ...emptyFilters(), dates: { closes: { to: '2030-01-01' } } }))).toEqual(['1', '2', '3', '5']);
  });

  it('ignores a filter on a column that does not exist', () => {
    expect(applyFilters(deals, cols, { ...emptyFilters(), categories: { nope: ['x'] } })).toHaveLength(5);
  });

  it('counts how many filters are in force', () => {
    expect(countFilters(emptyFilters())).toBe(0);
    expect(countFilters({ q: ' ', categories: { stage: [] }, ranges: {}, dates: {} })).toBe(0);
    expect(countFilters({ q: 'a', categories: { stage: ['Lead'] }, ranges: { amount: { min: 1 } }, dates: { closes: { to: '2026-01-01' } } })).toBe(4);
  });

  it('lists the values a category has, most common first, "(none)" last, with counts', () => {
    expect(categoryOptions(deals, col('stage'))).toEqual([
      { value: 'Lead', count: 2 },
      { value: 'Proposal', count: 2 },
      { value: 'Won', count: 1 },
    ]);
    expect(categoryOptions(deals, col('company')).at(-1)).toEqual({ value: NONE, count: 1 });
    expect(categoryOptions(deals, col('tags'))).toEqual([
      { value: 'Tech', count: 3 },
      { value: 'Retail', count: 2 },
      { value: NONE, count: 1 },
    ]);
  });
});

describe('sorting', () => {
  it('sorts numbers as numbers, either way, without changing the original', () => {
    const before = ids(deals);
    expect(ids(sortRows(deals, col('amount'), 'asc'))).toEqual(['3', '1', '4', '2', '5']);
    expect(ids(sortRows(deals, col('amount'), 'desc'))).toEqual(['5', '2', '4', '1', '3']);
    expect(ids(deals)).toEqual(before);
  });

  it('sorts text without regard to case', () => {
    const rows = [{ ...deals[0], title: 'banana' }, { ...deals[1], title: 'Apple' }, { ...deals[2], title: 'cherry' }];
    expect(rows.length && sortRows(rows, col('title'), 'asc').map((r) => r.title)).toEqual(['Apple', 'banana', 'cherry']);
  });

  it('always puts rows with nothing last, ascending or descending', () => {
    expect(ids(sortRows(deals, col('closes'), 'asc'))).toEqual(['5', '1', '2', '3', '4']);
    expect(ids(sortRows(deals, col('closes'), 'desc'))).toEqual(['3', '2', '1', '5', '4']);
    expect(ids(sortRows(deals, col('expected'), 'desc')).at(-1)).toBe('5');
  });

  it('keeps tied rows in their original order', () => {
    expect(ids(sortRows(deals, col('stage'), 'asc'))).toEqual(['1', '3', '2', '4', '5']);
  });

  it('does nothing without a column', () => {
    expect(sortRows(deals, undefined, 'asc')).toBe(deals);
  });
});

describe('grouping', () => {
  it('groups by a category and adds up a measure, biggest first', () => {
    const g = groupRows(deals, col('stage'), col('amount'));
    // Won 4000, Proposal 3000 + 2500 = 5500, Lead 1000 + 500 = 1500
    expect(g.groups.map((x) => [x.label, x.count, x.sum])).toEqual([
      ['Proposal', 2, 5500],
      ['Won', 1, 4000],
      ['Lead', 2, 1500],
    ]);
    expect(g.total.sum).toBe(11000);
    expect(g.overlapping).toBe(false);
  });

  it('gives each group its share of the total, which add up to 100', () => {
    const g = groupRows(deals, col('stage'), col('amount'));
    expect(g.groups.map((x) => x.share)).toEqual([50, 36.36, 13.64]);
    expect(g.groups.reduce((s, x) => s + x.share, 0)).toBeCloseTo(100, 1);
  });

  it('counts rows when there is no measure, and shares are of the row count', () => {
    const g = groupRows(deals, col('owner'));
    expect(g.groups.map((x) => [x.label, x.count, x.share])).toEqual([
      ['Ann', 2, 40],
      ['Bob', 2, 40],
      [NONE, 1, 20],
    ]);
  });

  it('puts rows with no value in a "(none)" group, last', () => {
    expect(groupRows(deals, col('company'), col('amount')).groups.at(-1)).toMatchObject({ key: NONE, count: 1, sum: 2500 });
  });

  it('groups a date by month, in date order, with a group for no date', () => {
    const g = groupRows(deals, col('closes'), col('amount'));
    expect(g.groups.map((x) => [x.label, x.count, x.sum])).toEqual([
      ['Nov 2026', 1, 4000],
      ['Dec 2026', 2, 4000],
      ['Jan 2027', 1, 500],
      [NONE, 1, 2500],
    ]);
  });

  it('puts a row with several values in each of its groups, and says the groups overlap', () => {
    const g = groupRows(deals, col('tags'), col('amount'));
    // Tech: Alpha 1000 + Beta 3000 + Epsilon 4000 = 8000; Retail: Beta 3000 + Delta 2500 = 5500; none: Gamma 500
    expect(g.groups.map((x) => [x.label, x.count, x.sum])).toEqual([['Tech', 3, 8000], ['Retail', 2, 5500], [NONE, 1, 500]]);
    expect(g.overlapping).toBe(true);
    // The grand total counts each deal once, even though the groups add up to more.
    expect(g.total.sum).toBe(11000);
  });

  it('measures only the rows that have a figure', () => {
    const g = groupRows(deals, col('stage'), col('expected'));
    expect(g.groups.find((x) => x.label === 'Won')).toMatchObject({ count: 1, counted: 0, sum: 0, average: null });
    expect(g.total.sum).toBe(2900);
  });

  it('handles no rows', () => {
    expect(groupRows([], col('stage'), col('amount'))).toMatchObject({ groups: [], overlapping: false });
  });

  it('writes months in words', () => {
    expect(monthLabel('2026-11')).toBe('Nov 2026');
    expect(monthLabel('2027-01')).toBe('Jan 2027');
  });
});

describe('export', () => {
  it('writes the columns shown, in order, with several values joined', () => {
    const rows = exportRows([deals[1], deals[3]], [col('title'), col('tags'), col('amount'), col('closes')]);
    expect(rows).toEqual([
      ['Title', 'Industry', 'Amount', 'Closes'],
      ['Beta', 'Tech; Retail', 3000, '2026-12-20T00:00:00.000Z'],
      ['Delta', 'Retail', 2500, ''],
    ]);
  });
});

describe('keeping a view in the address', () => {
  const defaults: ViewDefaults = { group: 'stage', measure: 'amount', sort: 'amount', dir: 'desc' };
  const parse = (query: string) => parseView(new URLSearchParams(query), cols, defaults);

  it('starts from the defaults when the address says nothing', () => {
    const v = parse('');
    expect(v).toMatchObject({ group: 'stage', measure: 'amount', sort: 'amount', dir: 'desc', cols: null, closed: false, page: 1 });
    expect(countFilters(v.filters)).toBe(0);
  });

  it('round-trips every kind of choice', () => {
    const v = parse('q=acme&f.stage=Lead|Won&min.amount=500&max.amount=2000&from.closes=2026-12-01&to.closes=2026-12-31&group=owner&measure=expected&sort=title&dir=asc&cols=title|amount&closed=1&page=3');
    expect(v.filters).toEqual({
      q: 'acme',
      categories: { stage: ['Lead', 'Won'] },
      ranges: { amount: { min: 500, max: 2000 } },
      dates: { closes: { from: '2026-12-01', to: '2026-12-31' } },
    });
    expect(v).toMatchObject({ group: 'owner', measure: 'expected', sort: 'title', dir: 'asc', cols: ['title', 'amount'], closed: true, page: 3 });
    const again = parseView(viewToParams(v, defaults), cols, defaults);
    expect(again).toEqual(v);
  });

  it('leaves out anything that matches the defaults, so addresses stay short', () => {
    expect(viewToParams(parse(''), defaults).toString()).toBe('');
    expect(viewToParams(parse('group=stage&sort=amount&dir=desc&page=1'), defaults).toString()).toBe('');
  });

  it('ignores anything unknown or malformed instead of failing', () => {
    const v = parse('f.nope=x&min.amount=abc&from.closes=yesterday&group=amount&measure=title&sort=nope&dir=sideways&cols=nope|also-nope&page=-4&page=zzz');
    expect(countFilters(v.filters)).toBe(0);
    // amount is a number, so it cannot be grouped on; title is text, so it cannot be a measure.
    expect(v).toMatchObject({ group: 'stage', measure: 'amount', sort: 'amount', dir: 'desc', cols: null, page: 1 });
  });

  it('allows grouping to be switched off', () => {
    expect(parse('group=').group).toBe('');
    expect(viewToParams(parse('group='), defaults).get('group')).toBe('');
  });
});
