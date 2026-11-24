import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import Analyse from './Analyse';
import { renderWithProviders } from '@/test/utils';
import { api } from '@/lib/api';
import type { DealRow } from '@/components/analyse/subjects';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { get: vi.fn() } };
});

let permissions = ['deals.view', 'people.view', 'companies.view', 'data.export'];
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', firstName: 'A', lastName: 'B', email: 'a@b.com', permissions } }),
}));

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

const deal = (over: Partial<DealRow>): DealRow => ({
  id: 'd?',
  title: 'Deal',
  companyId: null,
  company: null,
  personId: null,
  person: null,
  owner: 'Ann',
  stage: 'Lead',
  stageColour: 'secondary',
  outcome: 'OPEN',
  amount: 0,
  winChance: 10,
  expected: 0,
  expectedCloseDate: null,
  createdAt: daysAgo(10),
  contacts: 0,
  lastContactAt: null,
  tasks: 0,
  openTasks: 0,
  ...over,
});

// Worked out by hand: open amounts 1000 + 3000 + 500 = 4500; expected 100 + 1500 + 50 = 1650.
const rows: DealRow[] = [
  deal({ id: 'd1', title: 'Alpha ERP', company: 'Acme', companyId: 'c1', stage: 'Lead', amount: 1000, winChance: 10, expected: 100, expectedCloseDate: '2026-12-10T00:00:00.000Z' }),
  deal({ id: 'd2', title: 'Beta CRM', company: 'Acme', companyId: 'c1', owner: 'Bob', stage: 'Proposal', amount: 3000, winChance: 50, expected: 1500, expectedCloseDate: '2026-12-20T00:00:00.000Z' }),
  deal({ id: 'd3', title: 'Gamma Cloud', company: 'Zenith', companyId: 'c2', stage: 'Lead', amount: 500, winChance: 10, expected: 50, expectedCloseDate: '2027-01-05T00:00:00.000Z' }),
  deal({ id: 'd4', title: 'Delta Won', company: 'Zenith', companyId: 'c2', stage: 'Won', outcome: 'WON', amount: 4000, winChance: null, expected: null }),
];

let payload: { subject: string; rows: unknown[]; total: number; truncated: boolean; limit: number };
const setDeals = (list: DealRow[] = rows, over: Partial<typeof payload> = {}) => {
  payload = { subject: 'deals', rows: list, total: list.length, truncated: false, limit: 5000, ...over };
  (api.get as any).mockResolvedValue({ data: payload });
};

function show(path: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/analyse/:subject" element={<Analyse />} />
      <Route path="/" element={<p>The dashboard</p>} />
    </Routes>,
    { route: path },
  );
}

/** The text of each row of the main table, in order. */
const tableTitles = () => within(screen.getByRole('table', { name: 'Rows' })).getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[0].textContent);
const figure = (label: string) => within(screen.getByLabelText('Figures')).getByText(label).parentElement!.parentElement!.textContent ?? '';

describe('Analyse: open deals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    permissions = ['deals.view', 'people.view', 'companies.view', 'data.export'];
    setDeals();
  });

  it('asks the server for the deals and shows only the open ones', async () => {
    show('/analyse/open-deals');
    expect(await screen.findByText('Alpha ERP')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/analyse/deals');
    expect(screen.queryByText('Delta Won')).not.toBeInTheDocument();
    expect(screen.getByText(/showing 3 of 3 deals/i)).toBeInTheDocument();
  });

  it('shows figures that add up: pipeline 4,500 and forecast 1,650', async () => {
    show('/analyse/open-deals');
    await screen.findByText('Alpha ERP');
    expect(figure('Open deals')).toContain('3');
    expect(figure('Pipeline value')).toContain('$4,500');
    expect(figure('Weighted forecast')).toContain('$1,650');
    expect(figure('Average deal')).toContain('$1,500');
  });

  it('says which figure is the dashboard card, and notices when filters change it', async () => {
    show('/analyse/open-deals');
    await screen.findByText('Alpha ERP');
    expect(screen.getByText('The figure on the dashboard card')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Search'), 'alpha');
    expect(await screen.findByText('Narrowed by your filters')).toBeInTheDocument();
  });

  it('narrows the rows and the figures as you type in the search box', async () => {
    show('/analyse/open-deals');
    await screen.findByText('Alpha ERP');
    await userEvent.type(screen.getByLabelText('Search'), 'acme');
    await waitFor(() => expect(tableTitles()).toEqual(['Beta CRM', 'Alpha ERP']));
    expect(figure('Pipeline value')).toContain('$4,000');
    expect(screen.getByText(/showing 2 of 3 deals/i)).toBeInTheDocument();
  });

  it('sorts by a column, and the other way on a second click', async () => {
    show('/analyse/open-deals');
    await screen.findByText('Alpha ERP');
    // Starts by amount, biggest first
    expect(tableTitles()).toEqual(['Beta CRM', 'Alpha ERP', 'Gamma Cloud']);
    await userEvent.click(screen.getByRole('button', { name: 'Deal' }));
    expect(tableTitles()).toEqual(['Alpha ERP', 'Beta CRM', 'Gamma Cloud']);
    await userEvent.click(screen.getByRole('button', { name: 'Deal' }));
    expect(tableTitles()).toEqual(['Gamma Cloud', 'Beta CRM', 'Alpha ERP']);
  });

  it('includes won and lost deals when asked, and relabels the figures so they do not claim to be the pipeline', async () => {
    show('/analyse/open-deals');
    await screen.findByText('Alpha ERP');
    await userEvent.click(screen.getByLabelText(/include won and lost deals/i));
    expect(await screen.findByText('Delta Won')).toBeInTheDocument();
    expect(figure('Total amount')).toContain('$8,500');
    expect(screen.queryByText('Pipeline value')).not.toBeInTheDocument();
  });

  it('groups by stage and adds up each group', async () => {
    show('/analyse/open-deals');
    await screen.findByText('Alpha ERP');
    const groups = screen.getByRole('table', { name: /by stage/i });
    const lead = within(groups).getByRole('button', { name: 'Lead' }).closest('tr')!;
    expect(within(lead).getAllByRole('cell').map((c) => c.textContent)).toEqual(['Lead', '2', '66.67%']);
    const all = within(groups).getByText('All').closest('tr')!;
    expect(within(all).getAllByRole('cell').map((c) => c.textContent)).toEqual(['All', '3', '100%']);
  });

  it('measures the groups by amount, with totals and averages', async () => {
    show('/analyse/open-deals');
    await screen.findByText('Alpha ERP');
    await userEvent.selectOptions(screen.getByLabelText('Measure'), 'amount');
    const groups = await screen.findByRole('table', { name: /amount by stage/i });
    const lead = within(groups).getByRole('button', { name: 'Lead' }).closest('tr')!;
    // Lead: 1000 + 500 = 1500, average 750, 1500 of 4500 = 33.33%
    expect(within(lead).getAllByRole('cell').map((c) => c.textContent)).toEqual(['Lead', '2', '$1,500', '$750', '33.33%']);
  });

  it('drills into a group: clicking it narrows the whole page to those rows', async () => {
    show('/analyse/open-deals');
    await screen.findByText('Alpha ERP');
    await userEvent.click(within(screen.getByRole('table', { name: /by stage/i })).getByRole('button', { name: 'Lead' }));
    await waitFor(() => expect(tableTitles()).toEqual(['Alpha ERP', 'Gamma Cloud']));
    expect(screen.getByLabelText('Stage: Lead')).toBeChecked();
    expect(figure('Pipeline value')).toContain('$1,500');
  });

  it('filters by ticking values, and by an amount range', async () => {
    show('/analyse/open-deals');
    await screen.findByText('Alpha ERP');
    await userEvent.click(screen.getByRole('button', { name: /filters/i }));
    await userEvent.click(await screen.findByLabelText('Owner: Bob'));
    await waitFor(() => expect(tableTitles()).toEqual(['Beta CRM']));
    await userEvent.click(screen.getByLabelText('Owner: Bob'));
    await userEvent.type(screen.getByLabelText('Amount at least'), '800');
    await waitFor(() => expect(tableTitles()).toEqual(['Beta CRM', 'Alpha ERP']));
  });

  it('opens already narrowed when the address says so (this is how the stage rows on the dashboard link here)', async () => {
    show('/analyse/open-deals?f.stage=Won&closed=1');
    expect(await screen.findByText('Delta Won')).toBeInTheDocument();
    expect(tableTitles()).toEqual(['Delta Won']);
    expect(screen.getByLabelText('Stage: Won')).toBeChecked();
  });

  it('lets you choose the columns', async () => {
    show('/analyse/open-deals');
    await screen.findByText('Alpha ERP');
    const table = () => screen.getByRole('table', { name: 'Rows' });
    expect(within(table()).queryByText('Age (days)')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /columns/i }));
    await userEvent.click(screen.getByLabelText('Show column Age (days)'));
    expect(within(table()).getByText('Age (days)')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Show column Owner'));
    expect(within(table()).queryByText('Owner')).not.toBeInTheDocument();
  });

  it('starts again with one click', async () => {
    show('/analyse/open-deals?q=zenith&closed=1');
    await screen.findByText('Delta Won');
    await userEvent.click(screen.getByRole('button', { name: /start again/i }));
    await waitFor(() => expect(tableTitles()).toEqual(['Beta CRM', 'Alpha ERP', 'Gamma Cloud']));
  });

  it('says plainly when nothing matches', async () => {
    show('/analyse/open-deals?q=zzzz');
    expect(await screen.findByText('Nothing matches')).toBeInTheDocument();
  });

  it('offers CSV export only to people allowed to export', async () => {
    show('/analyse/open-deals');
    await screen.findByText('Alpha ERP');
    expect(screen.getByRole('button', { name: /export csv/i })).toBeInTheDocument();
  });

  it('does not offer export without the permission', async () => {
    permissions = ['deals.view'];
    show('/analyse/open-deals');
    await screen.findByText('Alpha ERP');
    expect(screen.queryByRole('button', { name: /export csv/i })).not.toBeInTheDocument();
  });

  it('warns when there are more rows than were sent', async () => {
    setDeals(rows, { total: 7000, truncated: true, limit: 5000 });
    show('/analyse/open-deals');
    expect(await screen.findByText(/there are 7,000 deals; the newest 4 are shown/i)).toBeInTheDocument();
  });

  it('pages through many rows', async () => {
    const many = Array.from({ length: 60 }, (_, i) => deal({ id: `m${i}`, title: `Deal ${String(i).padStart(2, '0')}`, amount: 1000 - i, stage: 'Lead', expected: 1 }));
    setDeals(many);
    show('/analyse/open-deals?sort=title&dir=asc');
    await screen.findByText('Deal 00');
    expect(screen.getByText('1-25 of 60')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('26-50 of 60')).toBeInTheDocument();
    expect(screen.getByText('Deal 25')).toBeInTheDocument();
  });
});

describe('Analyse: the other cards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    permissions = ['deals.view', 'people.view', 'companies.view'];
    setDeals();
  });

  it('Pipeline value starts by adding up amounts by stage', async () => {
    show('/analyse/pipeline');
    await screen.findByText('Alpha ERP');
    expect(screen.getByRole('table', { name: /amount by stage/i })).toBeInTheDocument();
    expect(screen.getByText('The figure on the dashboard card').closest('div')!.textContent).toContain('$4,500');
  });

  it('Weighted forecast starts by adding up expected value by close month, in order', async () => {
    show('/analyse/forecast');
    await screen.findByText('Alpha ERP');
    const groups = screen.getByRole('table', { name: /expected by expected close/i });
    const names = within(groups).getAllByRole('row').slice(1, -1).map((r) => within(r).getAllByRole('cell')[0].textContent);
    expect(names).toEqual(['Dec 2026', 'Jan 2027']);
    const dec = within(groups).getByRole('button', { name: 'Dec 2026' }).closest('tr')!;
    // December: 100 + 1500 = 1600
    expect(within(dec).getAllByRole('cell').map((c) => c.textContent)).toEqual(['Dec 2026', '2', '$1,600', '$800', '96.97%']);
    expect(screen.getByText('The figure on the dashboard card').closest('div')!.textContent).toContain('$1,650');
  });

  it('drilling into a month filters to that month\'s close dates', async () => {
    show('/analyse/forecast');
    await screen.findByText('Alpha ERP');
    await userEvent.click(within(screen.getByRole('table', { name: /expected by expected close/i })).getByRole('button', { name: 'Jan 2027' }));
    await waitFor(() => expect(tableTitles()).toEqual(['Gamma Cloud']));
  });

  it('People: lists people, grouped by company', async () => {
    (api.get as any).mockResolvedValue({
      data: {
        subject: 'people',
        total: 2,
        truncated: false,
        limit: 5000,
        rows: [
          { id: 'p1', name: 'Ana Lyse', title: 'Buyer', email: null, phone: null, companyId: 'c1', company: 'Acme', owner: 'Ann', createdAt: daysAgo(3), contacts: 2, lastContactAt: daysAgo(1), openDeals: 1, openDealValue: 1000, openTasks: 0 },
          { id: 'p2', name: 'Bo Ring', title: null, email: null, phone: null, companyId: null, company: null, owner: null, createdAt: daysAgo(2), contacts: 0, lastContactAt: null, openDeals: 0, openDealValue: 0, openTasks: 1 },
        ],
      },
    });
    show('/analyse/people');
    expect(await screen.findByText('Ana Lyse')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/analyse/people');
    expect(figure('People')).toContain('2');
    expect(figure('With open deals')).toContain('1');
    expect(screen.getByRole('table', { name: /rows by company/i })).toBeInTheDocument();
  });

  it('Companies: several industries put a company in each group, and says so', async () => {
    (api.get as any).mockResolvedValue({
      data: {
        subject: 'companies',
        total: 2,
        truncated: false,
        limit: 5000,
        rows: [
          { id: 'c1', name: 'Acme', industries: ['Technology', 'Retail'], website: null, phone: null, email: null, address: null, createdAt: daysAgo(5), people: 3, deals: 2, openDeals: 1, openDealValue: 1000 },
          { id: 'c2', name: 'Zenith', industries: ['Technology'], website: null, phone: null, email: null, address: null, createdAt: daysAgo(4), people: 1, deals: 1, openDeals: 0, openDealValue: 0 },
        ],
      },
    });
    show('/analyse/companies');
    expect(await screen.findByText(/appear in each group/i)).toBeInTheDocument();
    const groups = screen.getByRole('table', { name: /rows by industry/i });
    expect(within(within(groups).getByRole('button', { name: 'Technology' }).closest('tr')!).getAllByRole('cell')[1].textContent).toBe('2');
    // The total still counts each company once.
    expect(within(within(groups).getByText('All').closest('tr')!).getAllByRole('cell')[1].textContent).toBe('2');
  });
});

describe('Analyse: access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setDeals();
  });

  it('shows a plain message, and asks for nothing, when the role profile does not include the area', () => {
    permissions = ['tasks.view'];
    show('/analyse/pipeline');
    expect(screen.getByText('Not available')).toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });

  it('sends an unknown address back to the dashboard', () => {
    permissions = ['deals.view'];
    show('/analyse/passwords');
    expect(screen.getByText('The dashboard')).toBeInTheDocument();
  });

  it('leaves out columns the person may not see, rather than showing blanks', async () => {
    permissions = ['deals.view'];
    setDeals(rows.map((r) => ({ ...r, contacts: null, lastContactAt: null, tasks: null, openTasks: null })));
    show('/analyse/open-deals');
    await screen.findByText('Alpha ERP');
    await userEvent.click(screen.getByRole('button', { name: /columns/i }));
    expect(screen.queryByLabelText('Show column Last contact')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Show column Open tasks')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Show column Amount')).toBeInTheDocument();
  });

  it('says so when the figures cannot be loaded', async () => {
    permissions = ['deals.view'];
    (api.get as any).mockRejectedValue(new Error('down'));
    show('/analyse/open-deals');
    expect(await screen.findByText(/failed to load the figures/i)).toBeInTheDocument();
  });
});
