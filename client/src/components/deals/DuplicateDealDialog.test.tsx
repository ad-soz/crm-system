import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DuplicateDealDialog, copyOf } from './DuplicateDealDialog';
import { ToastProvider } from '@/context/ToastContext';
import { renderWithProviders } from '@/test/utils';
import { api } from '@/lib/api';
import type { Deal } from '@/types';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { get: vi.fn(), post: vi.fn() } };
});

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', firstName: 'A', lastName: 'B', email: 'a@b.com', permissions: ['deals.create', 'deals.view'] } }),
}));

const won = {
  id: 'd1',
  title: 'Acme ERP',
  amount: 12500,
  stageId: 'stage-won',
  stage: { id: 'stage-won', name: 'Won', colour: 'success', sortOrder: 5, isActive: true },
  companyId: 'c1',
  personId: 'p1',
  ownerId: 'someone-else',
  expectedCloseDate: '2026-12-15T00:00:00.000Z',
  createdAt: '',
  updatedAt: '',
} as Deal;

function show(deal: Deal | null = won, handlers: { onClose?: () => void; onCreated?: (d: Deal) => void } = {}) {
  const onClose = handlers.onClose ?? vi.fn();
  renderWithProviders(
    <ToastProvider>
      <DuplicateDealDialog deal={deal} onClose={onClose} onCreated={handlers.onCreated} />
    </ToastProvider>,
  );
  return { onClose };
}

describe('what a copy starts with', () => {
  it('keeps title (marked as a copy), amount, company, person and close date', () => {
    expect(copyOf(won)).toEqual({
      title: 'Acme ERP (copy)',
      amount: 12500,
      companyId: 'c1',
      personId: 'p1',
      expectedCloseDate: '2026-12-15T00:00:00.000Z',
    });
  });

  it('does not carry the stage, the owner or the id over', () => {
    const copy = copyOf(won) as Record<string, unknown>;
    expect(copy).not.toHaveProperty('stageId');
    expect(copy).not.toHaveProperty('ownerId');
    expect(copy).not.toHaveProperty('id');
  });

  it('copes with a deal that has no company, person or date', () => {
    expect(copyOf({ ...won, companyId: null, personId: null, expectedCloseDate: null })).toEqual({ title: 'Acme ERP (copy)', amount: 12500 });
  });
});

describe('DuplicateDealDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.get as any).mockResolvedValue({ data: { key: 'x', values: [], data: [] } });
    (api.post as any).mockResolvedValue({ data: { id: 'd2', title: 'Acme ERP (copy)' } });
  });

  it('shows nothing when no deal is being copied', () => {
    show(null);
    expect(screen.queryByText('Duplicate deal')).not.toBeInTheDocument();
  });

  it('opens filled in from the original, and says what is not copied', async () => {
    show();
    expect(await screen.findByLabelText('Title *')).toHaveValue('Acme ERP (copy)');
    expect(screen.getByLabelText('Amount *')).toHaveValue(12500);
    expect(screen.getByLabelText('Expected close date')).toHaveValue('2026-12-15');
    expect(screen.getByText(/contacts, tasks and history are not copied/i)).toBeInTheDocument();
  });

  it('puts the cursor in the title with its text selected, so a new name can be typed straight over it', async () => {
    show();
    const title = (await screen.findByLabelText('Title *')) as HTMLInputElement;
    await waitFor(() => expect(title).toHaveFocus());
    expect(title.selectionStart).toBe(0);
    expect(title.selectionEnd).toBe('Acme ERP (copy)'.length);
  });

  it('creates the copy with one Enter, as a new deal at the default stage even though the original is won', async () => {
    const { onClose } = show();
    await screen.findByLabelText('Title *');
    await userEvent.keyboard('Acme ERP phase 2{Enter}');
    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const [url, body] = (api.post as any).mock.calls[0];
    expect(url).toBe('/deals');
    expect(body).toMatchObject({ title: 'Acme ERP phase 2', amount: 12500, companyId: 'c1', personId: 'p1', expectedCloseDate: '2026-12-15' });
    // No stage is sent, so the server uses the default; and no reason for a stage move is sent either.
    expect(body.stageId).toBeUndefined();
    expect(body.stageComment).toBeUndefined();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('tells the page about the new deal, so it can open it', async () => {
    const onCreated = vi.fn();
    show(won, { onCreated });
    await screen.findByLabelText('Title *');
    await userEvent.click(screen.getByRole('button', { name: 'Create copy' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ id: 'd2', title: 'Acme ERP (copy)' }));
  });

  it('lets the details be changed before saving', async () => {
    show();
    const amount = await screen.findByLabelText('Amount *');
    await userEvent.clear(amount);
    await userEvent.type(amount, '9000');
    await userEvent.click(screen.getByRole('button', { name: 'Create copy' }));
    await waitFor(() => expect((api.post as any).mock.calls[0][1].amount).toBe(9000));
  });

  it('keeps the form open, with what was typed, and says why when the server refuses', async () => {
    (api.post as any).mockRejectedValue({ isAxiosError: true, response: { data: { message: 'Referenced company does not exist' } } });
    const { onClose } = show();
    await screen.findByLabelText('Title *');
    await userEvent.keyboard('My new name{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent(/company does not exist/i);
    expect(screen.getByLabelText('Title *')).toHaveValue('My new name');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('will not create a copy with no title', async () => {
    show();
    await userEvent.clear(await screen.findByLabelText('Title *'));
    await userEvent.click(screen.getByRole('button', { name: 'Create copy' }));
    expect(await screen.findByText('Title is required')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('creates nothing when cancelled', async () => {
    const { onClose } = show();
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });
});
