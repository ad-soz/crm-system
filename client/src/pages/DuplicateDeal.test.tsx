import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import Deals from './Deals';
import DealDetail from './DealDetail';
import { ToastProvider } from '@/context/ToastContext';
import { renderWithProviders } from '@/test/utils';
import { api } from '@/lib/api';
import type { Deal } from '@/types';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } };
});

let permissions = ['deals.view', 'deals.create', 'deals.edit', 'deals.delete'];
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', firstName: 'A', lastName: 'B', email: 'a@b.com', permissions } }),
}));

const stage = (id: string, name: string, sortOrder: number, extra = {}) => ({ id, name, colour: 'secondary' as const, sortOrder, isActive: true, ...extra });
const stages = [stage('stage-lead', 'Lead', 0, { isDefault: true }), stage('stage-won', 'Won', 1)];

const deal = (over: Partial<Deal>): Deal =>
  ({
    id: 'd1',
    title: 'Acme ERP',
    amount: 5000,
    stageId: 'stage-lead',
    stage: stages[0],
    companyId: null,
    personId: null,
    expectedCloseDate: null,
    company: { id: 'c1', name: 'Acme' },
    createdAt: '',
    updatedAt: '',
    ...over,
  }) as Deal;

const deals = [deal({ id: 'd1', title: 'Acme ERP' }), deal({ id: 'd2', title: 'Beta CRM', stageId: 'stage-won', stage: stages[1], amount: 900 })];

function route(url: string) {
  if (url.startsWith('/reference/deal-stages')) return Promise.resolve({ data: { key: 'deal-stages', values: stages } });
  if (url.startsWith('/reference/')) return Promise.resolve({ data: { key: 'x', values: [] } });
  if (url === '/deals') return Promise.resolve({ data: { data: deals, total: 2, page: 1, limit: 500, totalPages: 1 } });
  if (url === '/deals/d1') return Promise.resolve({ data: { ...deals[0], contacts: [], tasks: [] } });
  if (url.endsWith('/history')) return Promise.resolve({ data: [] });
  return Promise.resolve({ data: { data: [], values: [] } });
}

function show(path: string) {
  return renderWithProviders(
    <ToastProvider>
      <Routes>
        <Route path="/deals" element={<Deals />} />
        <Route path="/deals/:id" element={<DealDetail />} />
      </Routes>
    </ToastProvider>,
    { route: path },
  );
}

describe('Duplicating a deal from the deals page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    permissions = ['deals.view', 'deals.create', 'deals.edit', 'deals.delete'];
    (api.get as any).mockImplementation(route);
    (api.post as any).mockResolvedValue({ data: { id: 'd9', title: 'Acme ERP (copy)' } });
  });

  it('offers a copy button on each deal on the board', async () => {
    show('/deals');
    await screen.findByText('Acme ERP');
    expect(screen.getByRole('button', { name: 'Duplicate deal: Acme ERP' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Duplicate deal: Beta CRM' })).toBeInTheDocument();
  });

  it('opens the copy form for that deal without opening the deal itself', async () => {
    show('/deals');
    await screen.findByText('Acme ERP');
    await userEvent.click(screen.getByRole('button', { name: 'Duplicate deal: Acme ERP' }));
    expect(await screen.findByLabelText('Title *')).toHaveValue('Acme ERP (copy)');
    // Still on the deals page, not on the deal's own page.
    expect(screen.getByRole('heading', { name: 'Deals' })).toBeInTheDocument();
  });

  it('creates the copy and stays on the list, which refreshes', async () => {
    show('/deals');
    await screen.findByText('Acme ERP');
    await userEvent.click(screen.getByRole('button', { name: 'Duplicate deal: Acme ERP' }));
    await screen.findByLabelText('Title *');
    await userEvent.keyboard('Acme ERP renewal{Enter}');
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/deals', expect.objectContaining({ title: 'Acme ERP renewal', amount: 5000 })));
    await waitFor(() => expect(screen.queryByLabelText('Title *')).not.toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Deals' })).toBeInTheDocument();
  });

  it('copies a won deal as a new deal with no stage chosen, so it starts at the default', async () => {
    show('/deals');
    await screen.findByText('Beta CRM');
    await userEvent.click(screen.getByRole('button', { name: 'Duplicate deal: Beta CRM' }));
    await screen.findByLabelText('Title *');
    await userEvent.click(screen.getByRole('button', { name: 'Create copy' }));
    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect((api.post as any).mock.calls[0][1].stageId).toBeUndefined();
  });

  it('offers a copy button on each row in the table view too, without opening the row', async () => {
    show('/deals');
    await screen.findByText('Acme ERP');
    await userEvent.click(screen.getByRole('button', { name: 'Toggle view' }));
    const row = (await screen.findByRole('cell', { name: 'Acme ERP' })).closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: 'Duplicate deal: Acme ERP' }));
    expect(await screen.findByLabelText('Title *')).toHaveValue('Acme ERP (copy)');
    expect(screen.getByRole('heading', { name: 'Deals' })).toBeInTheDocument();
  });

  it('is not offered to someone who cannot create deals', async () => {
    permissions = ['deals.view', 'deals.edit'];
    show('/deals');
    await screen.findByText('Acme ERP');
    expect(screen.queryByRole('button', { name: /duplicate deal/i })).not.toBeInTheDocument();
  });
});

describe('Duplicating a deal from its own page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    permissions = ['deals.view', 'deals.create', 'deals.edit', 'deals.delete'];
    (api.get as any).mockImplementation(route);
    (api.post as any).mockResolvedValue({ data: { id: 'd9', title: 'Acme ERP (copy)' } });
  });

  it('has a Duplicate button next to Edit and Delete', async () => {
    show('/deals/d1');
    expect(await screen.findByRole('button', { name: /^duplicate$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
  });

  it('opens the copy form, creates the copy, then goes to the new deal', async () => {
    show('/deals/d1');
    await userEvent.click(await screen.findByRole('button', { name: /^duplicate$/i }));
    expect(await screen.findByLabelText('Title *')).toHaveValue('Acme ERP (copy)');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/deals', expect.objectContaining({ title: 'Acme ERP (copy)' })));
    // The page now asks for the new deal.
    await waitFor(() => expect((api.get as any).mock.calls.some((c: any[]) => c[0] === '/deals/d9')).toBe(true));
  });

  it('is not offered without permission to create deals', async () => {
    permissions = ['deals.view', 'deals.edit'];
    show('/deals/d1');
    await screen.findByRole('button', { name: /edit/i });
    expect(screen.queryByRole('button', { name: /^duplicate$/i })).not.toBeInTheDocument();
  });
});
