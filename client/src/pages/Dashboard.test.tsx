import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import Dashboard from './Dashboard';
import { renderWithProviders } from '@/test/utils';
import type { DashboardSummary, ReferenceValue } from '@/types';

const ref = (over: Partial<ReferenceValue>): ReferenceValue => ({
  id: 'x',
  name: 'Name',
  colour: 'secondary',
  sortOrder: 0,
  isActive: true,
  ...over,
});

const mockData: DashboardSummary = {
  totalPeople: 5,
  totalCompanies: 3,
  openDeals: 4,
  pipelineValue: 255000,
  dealsByStage: [
    { stage: ref({ id: 'stage-lead', name: 'Lead' }), count: 1, value: 15000 },
    { stage: ref({ id: 'stage-qualified', name: 'Qualified', colour: 'info' }), count: 1, value: 120000 },
    { stage: ref({ id: 'stage-proposal', name: 'Proposal', colour: 'warning' }), count: 1, value: 45000 },
  ],
  upcomingTasks: [
    {
      id: 't1',
      title: 'Follow up call',
      statusId: 'status-todo',
      priorityId: 'priority-high',
      status: ref({ id: 'status-todo', name: 'To Do' }),
      priority: ref({ id: 'priority-high', name: 'High', colour: 'destructive' }),
      dueDate: new Date(Date.now() - 86400000).toISOString(),
      createdAt: '',
      updatedAt: '',
    },
  ],
  recentContacts: [
    {
      id: 'a1',
      typeId: 'type-call',
      type: ref({ id: 'type-call', name: 'Call', colour: 'success', icon: 'phone' }),
      subject: 'Discovery call',
      createdAt: new Date().toISOString(),
    },
  ],
};

vi.mock('@/hooks/queries', () => ({
  useDashboard: vi.fn(),
}));

import { useDashboard } from '@/hooks/queries';

describe('Dashboard', () => {
  it('shows a loading state', () => {
    (useDashboard as any).mockReturnValue({ isLoading: true });
    renderWithProviders(<Dashboard />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('shows an error state', () => {
    (useDashboard as any).mockReturnValue({ isLoading: false, isError: true });
    renderWithProviders(<Dashboard />);
    expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
  });

  it('renders KPIs and highlights overdue tasks', async () => {
    (useDashboard as any).mockReturnValue({ isLoading: false, isError: false, data: mockData });
    renderWithProviders(<Dashboard />);

    await waitFor(() => expect(screen.getByText('Total People')).toBeInTheDocument());
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('Discovery call')).toBeInTheDocument();
    expect(screen.getByText(/overdue/i)).toBeInTheDocument();
  });
});

describe('Dashboard forecast', () => {
  const withForecast = (forecast: DashboardSummary['forecast']): DashboardSummary => ({ ...mockData, forecast });

  it('shows the weighted forecast and a row per close month, with special rows explained', async () => {
    (useDashboard as any).mockReturnValue({
      isLoading: false,
      isError: false,
      data: withForecast({
        count: 4,
        total: 255000,
        weighted: 110250,
        rows: [
          { key: 'overdue', kind: 'overdue', count: 1, value: 15000, weighted: 1500 },
          { key: '2026-11', kind: 'month', count: 1, value: 75000, weighted: 56250 },
          { key: '2026-12', kind: 'month', count: 2, value: 165000, weighted: 52500 },
          { key: 'none', kind: 'none', count: 0, value: 0, weighted: 0 },
        ],
      }),
    });
    renderWithProviders(<Dashboard />);

    // Headline figure sits with the other KPIs.
    expect(screen.getByText('Weighted Forecast')).toBeInTheDocument();
    expect(screen.getByText('$110,250')).toBeInTheDocument();

    // By month, in the order the server sent.
    // Title -> header -> the whole card.
    const card = screen.getByText('Forecast by close month').parentElement!.parentElement!;
    expect(card).toHaveTextContent('Overdue');
    expect(card).toHaveTextContent('November 2026');
    expect(card).toHaveTextContent('December 2026');
    expect(card).toHaveTextContent('No close date');
    expect(card).toHaveTextContent('2 deals');
    expect(card).toHaveTextContent('$52,500 expected');
    // The explanation of an overdue row.
    expect(card).toHaveTextContent(/close date has passed/i);
    expect(card).toHaveTextContent('43%');
  });

  it('says so when there are no open deals', async () => {
    (useDashboard as any).mockReturnValue({
      isLoading: false,
      isError: false,
      data: withForecast({ count: 0, total: 0, weighted: 0, rows: [] }),
    });
    renderWithProviders(<Dashboard />);
    expect(screen.getByText(/no open deals to forecast/i)).toBeInTheDocument();
  });

  it('leaves the forecast out without deals access', () => {
    (useDashboard as any).mockReturnValue({ isLoading: false, isError: false, data: withForecast(null) });
    renderWithProviders(<Dashboard />);
    expect(screen.queryByText('Weighted Forecast')).not.toBeInTheDocument();
    expect(screen.queryByText('Forecast by close month')).not.toBeInTheDocument();
  });
});
describe('Dashboard with a limited role profile', () => {
  it('leaves out the sections the profile cannot view', () => {
    (useDashboard as any).mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        totalPeople: 5,
        totalCompanies: null,
        openDeals: null,
        pipelineValue: null,
        dealsByStage: null,
        upcomingTasks: null,
        recentContacts: null,
      },
    });
    renderWithProviders(<Dashboard />);
    expect(screen.getByText('Total People')).toBeInTheDocument();
    expect(screen.queryByText('Total Companies')).not.toBeInTheDocument();
    expect(screen.queryByText('Pipeline Value')).not.toBeInTheDocument();
    expect(screen.queryByText('Pipeline by Stage')).not.toBeInTheDocument();
    expect(screen.queryByText('Recent Contacts')).not.toBeInTheDocument();
  });

  it('explains when nothing can be shown', () => {
    (useDashboard as any).mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        totalPeople: null,
        totalCompanies: null,
        openDeals: null,
        pipelineValue: null,
        dealsByStage: null,
        upcomingTasks: null,
        recentContacts: null,
      },
    });
    renderWithProviders(<Dashboard />);
    expect(screen.getByText(/doesn't include any areas shown on the dashboard/i)).toBeInTheDocument();
  });
});

describe('Dashboard drill-down', () => {
  const withForecast = {
    ...mockData,
    forecast: { count: 4, total: 255000, weighted: 90000, rows: [] },
  } as DashboardSummary;

  it('opens the analysis behind every top-line card', () => {
    (useDashboard as any).mockReturnValue({ isLoading: false, isError: false, data: withForecast });
    renderWithProviders(<Dashboard />);
    const link = (label: string) => screen.getByRole('link', { name: new RegExp(`^${label}:`) });
    expect(link('Total People')).toHaveAttribute('href', '/analyse/people');
    expect(link('Total Companies')).toHaveAttribute('href', '/analyse/companies');
    expect(link('Open Deals')).toHaveAttribute('href', '/analyse/open-deals');
    expect(link('Pipeline Value')).toHaveAttribute('href', '/analyse/pipeline');
    expect(link('Weighted Forecast')).toHaveAttribute('href', '/analyse/forecast');
  });

  it('keeps the figure on the card and says it can be analysed', () => {
    (useDashboard as any).mockReturnValue({ isLoading: false, isError: false, data: withForecast });
    renderWithProviders(<Dashboard />);
    expect(screen.getByRole('link', { name: /^Total People: 5\./ })).toBeInTheDocument();
    expect(screen.getAllByText('Analyse').length).toBe(5);
  });

  it('only offers cards for the areas the profile can see', () => {
    (useDashboard as any).mockReturnValue({ isLoading: false, isError: false, data: { ...mockData, totalPeople: null, totalCompanies: null, forecast: null } });
    renderWithProviders(<Dashboard />);
    expect(screen.queryByRole('link', { name: /^Total People/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Open Deals/ })).toBeInTheDocument();
  });

  it('links each stage in the pipeline to the deals in that stage, won and lost included', () => {
    (useDashboard as any).mockReturnValue({ isLoading: false, isError: false, data: withForecast });
    renderWithProviders(<Dashboard />);
    const hrefs = screen.getAllByTitle('See these deals').map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/analyse/open-deals?f.stage=Qualified&closed=1');
    expect(hrefs).toHaveLength(3);
  });
});
