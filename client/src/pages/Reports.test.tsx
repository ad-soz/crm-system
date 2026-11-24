import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Reports from './Reports';
import { renderWithProviders } from '@/test/utils';
import { api } from '@/lib/api';
import * as csv from '@/lib/csv';
import type { DealReport } from '@/types';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { get: vi.fn() } };
});

let permissions = ['deals.view', 'data.export'];
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', firstName: 'A', lastName: 'B', email: 'a@b.com', permissions } }),
}));

const stages = [
  { id: 'lead', name: 'Lead', colour: 'secondary' as const },
  { id: 'qualified', name: 'Qualified', colour: 'info' as const },
  { id: 'won', name: 'Won', colour: 'success' as const },
  { id: 'lost', name: 'Lost', colour: 'destructive' as const },
];

/** The same numbers worked out by hand for the server tests. */
const fixture = (over: Partial<DealReport> = {}): DealReport => ({
  months: ['2026-09', '2026-10', '2026-11'],
  summary: {
    created: { count: 5, value: 21000 },
    won: { count: 2, value: 23000 },
    lost: { count: 1, value: 5000 },
    winRate: 67,
    open: { count: 4, value: 53000, weighted: 23100 },
  },
  byMonth: [
    { key: '2026-09', created: { count: 3, value: 15000 }, won: { count: 1, value: 3000 }, lost: { count: 0, value: 0 }, moves: 4 },
    { key: '2026-10', created: { count: 1, value: 5000 }, won: { count: 1, value: 20000 }, lost: { count: 0, value: 0 }, moves: 2 },
    { key: '2026-11', created: { count: 1, value: 1000 }, won: { count: 0, value: 0 }, lost: { count: 1, value: 5000 }, moves: 1 },
  ],
  movement: {
    stages,
    rows: [
      { key: '2026-09', counts: { won: 2, qualified: 1 } },
      { key: '2026-10', counts: { qualified: 1, won: 1 } },
      { key: '2026-11', counts: { lost: 1 } },
    ],
    totals: { qualified: 2, won: 3, lost: 1 },
  },
  closedDateUnknown: { won: { count: 1, value: 8000 }, lost: { count: 0, value: 0 } },
  stalled: {
    total: 4,
    items: [
      { id: 'd6', title: 'Foxtrot', amount: 40000, stage: stages[0], ownerName: 'Bob', days: 130, since: '2026-07-01T00:00:00.000Z', approximate: true },
      { id: 'd1', title: 'Alpha', amount: 10000, stage: stages[1], ownerName: 'Alice', days: 36, since: '2026-10-03T00:00:00.000Z', approximate: false },
    ],
  },
  byPerson: [
    { ownerId: 'b', name: 'Bob', open: { count: 1, value: 40000, weighted: 20000 }, created: { count: 1, value: 5000 }, won: { count: 0, value: 0 }, lost: { count: 1, value: 5000 } },
    { ownerId: 'a', name: 'Alice', open: { count: 2, value: 12000, weighted: 3000 }, created: { count: 3, value: 15000 }, won: { count: 2, value: 23000 }, lost: { count: 0, value: 0 } },
  ],
  options: { months: 6, ownerId: null },
  owners: [
    { id: 'a', name: 'Alice' },
    { id: 'b', name: 'Bob' },
  ],
  historySince: '2026-10-20T00:00:00.000Z',
  ...over,
});

const show = (report: DealReport = fixture()) => {
  (api.get as any).mockResolvedValue({ data: report });
  return renderWithProviders(<Reports />);
};

describe('Reports page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    permissions = ['deals.view', 'data.export'];
  });

  it('shows the headline figures', async () => {
    show();
    const summary = await screen.findByRole('region', { name: 'Summary' });
    expect(summary).toHaveTextContent('$21,000'); // created
    expect(summary).toHaveTextContent('5 deals');
    expect(summary).toHaveTextContent('$23,000'); // won
    expect(summary).toHaveTextContent('$5,000'); // lost
    expect(summary).toHaveTextContent('67%');
    expect(summary).toHaveTextContent('2 won of 3 closed');
    expect(summary).toHaveTextContent('$53,000');
    expect(summary).toHaveTextContent('$23,100 expected');
  });

  it('asks for six months and everyone to begin with', async () => {
    show();
    await screen.findByRole('region', { name: 'Summary' });
    expect(api.get).toHaveBeenCalledWith('/reports/deals', { params: { months: 6 } });
  });

  it('shows deals over time as charts and as a table with totals', async () => {
    show();
    await screen.findByRole('region', { name: 'Summary' });
    expect(screen.getByRole('img', { name: /Deals created per month/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Won and lost per month/ })).toBeInTheDocument();

    const table = screen.getByRole('table', { name: 'Deals created, won and lost by month' });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(5); // header + 3 months + total
    expect(rows[1]).toHaveTextContent('Sep 2026');
    expect(rows[1]).toHaveTextContent('$15,000');
    expect(rows[2]).toHaveTextContent('Oct 2026');
    expect(rows[2]).toHaveTextContent('$20,000');
    expect(rows[4]).toHaveTextContent('Total');
    expect(rows[4]).toHaveTextContent('$21,000');
    expect(rows[4]).toHaveTextContent('$23,000');
  });

  it('shows where deals moved to, each month', async () => {
    show();
    await screen.findByRole('region', { name: 'Summary' });
    const table = screen.getByRole('table', { name: 'Deals moved into each stage, by month' });
    const header = within(table).getAllByRole('columnheader').map((h) => h.textContent);
    expect(header).toEqual(['Month', 'Lead', 'Qualified', 'Won', 'Lost']);
    const rows = within(table).getAllByRole('row');
    expect(within(rows[1]).getAllByRole('cell').map((c) => c.textContent)).toEqual(['Sep 2026', '0', '1', '2', '0']);
    expect(within(rows[4]).getAllByRole('cell').map((c) => c.textContent)).toEqual(['Total', '0', '2', '3', '1']);
  });

  it('lists stalled deals longest first, and flags an estimate', async () => {
    show();
    await screen.findByRole('region', { name: 'Summary' });
    const table = screen.getByRole('table', { name: /Open deals by time in their current stage/ });
    const rows = within(table).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Foxtrot');
    expect(rows[1]).toHaveTextContent('up to 130 days');
    expect(rows[1]).toHaveTextContent('estimate');
    expect(within(rows[1]).getByRole('link', { name: 'Foxtrot' })).toHaveAttribute('href', '/deals/d6');
    expect(rows[2]).toHaveTextContent('36 days');
    expect(rows[2]).not.toHaveTextContent('estimate');
    expect(screen.getByText(/Showing the 2 longest of 4 open deals/)).toBeInTheDocument();
  });

  it('is honest about what the figures cover', async () => {
    show();
    const note = await screen.findByLabelText('What these figures cover');
    expect(note).toHaveTextContent('Deals created is complete for every month');
    expect(note).toHaveTextContent('recorded from');
    expect(note).toHaveTextContent('1 deal was already won or lost before then ($8,000)');
    expect(note).toHaveTextContent('not placed in any month');
  });

  it('does not claim a history date when none is known', async () => {
    show(fixture({ historySince: null, closedDateUnknown: { won: { count: 0, value: 0 }, lost: { count: 0, value: 0 } } }));
    const note = await screen.findByLabelText('What these figures cover');
    expect(note).toHaveTextContent('have not been recorded long enough to date');
    expect(note).not.toHaveTextContent('already won or lost');
  });

  it('splits the figures by person', async () => {
    show();
    await screen.findByRole('region', { name: 'Summary' });
    const table = screen.getByRole('table', { name: 'Deal figures by owner' });
    const rows = within(table).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Bob');
    expect(rows[1]).toHaveTextContent('$40,000');
    expect(rows[2]).toHaveTextContent('Alice');
    expect(rows[2]).toHaveTextContent('2 · $23,000');
  });

  it('refetches for a different period, and for one person', async () => {
    show();
    await screen.findByRole('region', { name: 'Summary' });
    await userEvent.selectOptions(screen.getByLabelText('Period'), '12');
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/reports/deals', { params: { months: 12 } }));
    await userEvent.selectOptions(screen.getByLabelText('Person'), 'a');
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/reports/deals', { params: { months: 12, ownerId: 'a' } }));
  });

  it('hides the by-person table when a single person is chosen', async () => {
    show(fixture({ byPerson: [fixture().byPerson[1]], options: { months: 6, ownerId: 'a' } }));
    await screen.findByRole('region', { name: 'Summary' });
    expect(screen.queryByRole('table', { name: 'Deal figures by owner' })).not.toBeInTheDocument();
  });

  it('says so when there is nothing to report on', async () => {
    show(
      fixture({
        summary: { created: { count: 0, value: 0 }, won: { count: 0, value: 0 }, lost: { count: 0, value: 0 }, winRate: null, open: { count: 0, value: 0, weighted: 0 } },
        byPerson: [],
      }),
    );
    expect(await screen.findByText('No deals to report on')).toBeInTheDocument();
  });

  it('shows "None yet" for the win rate when nothing has closed', async () => {
    show(fixture({ summary: { ...fixture().summary, won: { count: 0, value: 0 }, lost: { count: 0, value: 0 }, winRate: null } }));
    const summary = await screen.findByRole('region', { name: 'Summary' });
    expect(summary).toHaveTextContent('None yet');
    expect(summary).toHaveTextContent('No deals closed in this period');
  });

  it('says when the report cannot be loaded', async () => {
    (api.get as any).mockRejectedValue(new Error('boom'));
    renderWithProviders(<Reports />);
    expect(await screen.findByText('Failed to load the report')).toBeInTheDocument();
  });

  describe('exporting', () => {
    it('offers CSV export on each section to people who may export', async () => {
      show();
      await screen.findByRole('region', { name: 'Summary' });
      expect(screen.getAllByRole('button', { name: /export csv/i })).toHaveLength(4);
    });

    it('offers none to people without the export permission', async () => {
      permissions = ['deals.view'];
      show();
      await screen.findByRole('region', { name: 'Summary' });
      expect(screen.queryByRole('button', { name: /export csv/i })).not.toBeInTheDocument();
    });

    it('exports exactly the figures on screen, safely named', async () => {
      const spy = vi.spyOn(csv, 'downloadCsv').mockImplementation(() => {});
      show();
      await screen.findByRole('region', { name: 'Summary' });
      await userEvent.click(screen.getAllByRole('button', { name: /export csv/i })[0]);

      expect(spy).toHaveBeenCalledTimes(1);
      const [name, rows] = spy.mock.calls[0];
      expect(name).toMatch(/^deals-over-time-\d{4}-\d{2}-\d{2}\.csv$/);
      expect(rows[0]).toEqual(['Month', 'Created (deals)', 'Created (value)', 'Won (deals)', 'Won (value)', 'Lost (deals)', 'Lost (value)', 'Stage moves']);
      expect(rows[1]).toEqual(['Sep 2026', 3, 15000, 1, 3000, 0, 0, 4]); // numbers stay numbers
      expect(rows).toHaveLength(4);
    });
  });
});
