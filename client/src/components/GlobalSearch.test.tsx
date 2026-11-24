import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { GlobalSearch } from './GlobalSearch';
import { renderWithProviders } from '@/test/utils';
import { api } from '@/lib/api';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { get: vi.fn() } };
});

const none = { people: [], companies: [], deals: [] };

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function show() {
  return renderWithProviders(
    <>
      <GlobalSearch />
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
    </>,
  );
}

const box = () => screen.getByPlaceholderText(/search people/i);
const type = (text: string) => userEvent.type(box(), text);
const WAIT = { timeout: 2000 };

describe('GlobalSearch', () => {
  beforeEach(() => vi.clearAllMocks());

  it('debounces input and shows grouped results', async () => {
    (api.get as any).mockResolvedValue({
      data: {
        people: [{ type: 'person', id: 'c1', label: 'Alice Johnson', sublabel: 'alice@x.com' }],
        companies: [{ type: 'company', id: 'co1', label: 'Acme Corp' }],
        deals: [],
      },
    });

    show();
    await type('ac');

    await waitFor(() => expect(screen.getByText('Alice Johnson')).toBeInTheDocument(), WAIT);
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('People')).toBeInTheDocument();
    expect(screen.getByText('Companies')).toBeInTheDocument();
    // Typing two letters quickly asks once, not twice.
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith('/search', { params: { q: 'ac' } });
  });

  it('shows a no-results state', async () => {
    (api.get as any).mockResolvedValue({ data: none });
    show();
    await type('zzz');
    await waitFor(() => expect(screen.getByText(/no results found/i)).toBeInTheDocument(), WAIT);
  });

  it('shows a deal with its stage, amount and company', async () => {
    (api.get as any).mockResolvedValue({
      data: { ...none, deals: [{ type: 'deal', id: 'd1', label: 'Zorblax Renewal', sublabel: 'Lead · $42,000 · Zorblax Industries' }] },
    });
    show();
    await type('zorblax');
    expect(await screen.findByText('Zorblax Renewal', {}, WAIT)).toBeInTheDocument();
    expect(screen.getByText('Lead · $42,000 · Zorblax Industries')).toBeInTheDocument();
  });

  it('does not blank the page when something that is not text arrives (this once took the whole app down)', async () => {
    // The old server sent a deal's whole stage record where the screen expected text.
    (api.get as any).mockResolvedValue({
      data: { ...none, deals: [{ type: 'deal', id: 'd1', label: 'Big Deal', sublabel: { id: 'stage-lead', name: 'Lead', colour: 'info' } }] },
    });
    show();
    await type('big');
    expect(await screen.findByText('Big Deal', {}, WAIT)).toBeInTheDocument();
    // The search box is still there: the page did not crash.
    expect(box()).toBeInTheDocument();
    expect(screen.queryByText('[object Object]')).not.toBeInTheDocument();
  });

  it('does not blank the page when a group is missing or malformed', async () => {
    (api.get as any).mockResolvedValue({ data: { people: [{ type: 'person', id: 'p1', label: 'Only People' }] } });
    show();
    await type('only');
    expect(await screen.findByText('Only People', {}, WAIT)).toBeInTheDocument();
    expect(box()).toBeInTheDocument();
  });

  it('says so, instead of showing nothing, when the search cannot be done', async () => {
    (api.get as any).mockRejectedValue(new Error('down'));
    show();
    await type('anything');
    expect(await screen.findByRole('alert', {}, WAIT)).toHaveTextContent(/search is not available/i);
    expect(screen.queryByText(/no results found/i)).not.toBeInTheDocument();
  });

  it('recovers on the next search after a failure', async () => {
    (api.get as any).mockRejectedValueOnce(new Error('down')).mockResolvedValue({ data: { ...none, companies: [{ type: 'company', id: 'co1', label: 'Acme Corp' }] } });
    show();
    await type('ac');
    await screen.findByRole('alert', {}, WAIT);
    await type('m');
    expect(await screen.findByText('Acme Corp', {}, WAIT)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the answer to the latest search even if an earlier one finishes later', async () => {
    let finishFirst: (v: unknown) => void = () => {};
    (api.get as any)
      .mockImplementationOnce(() => new Promise((resolve) => (finishFirst = resolve)))
      .mockResolvedValueOnce({ data: { ...none, companies: [{ type: 'company', id: 'new', label: 'Newer Answer' }] } });
    show();
    await type('ab');
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1), WAIT);
    await type('c');
    expect(await screen.findByText('Newer Answer', {}, WAIT)).toBeInTheDocument();
    // The slow first answer arrives last. It must not replace the newer one.
    finishFirst({ data: { ...none, companies: [{ type: 'company', id: 'old', label: 'Stale Answer' }] } });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText('Stale Answer')).not.toBeInTheDocument();
    expect(screen.getByText('Newer Answer')).toBeInTheDocument();
  });

  it('takes you to the person, company or deal you pick, and clears the box', async () => {
    (api.get as any).mockResolvedValue({
      data: {
        people: [{ type: 'person', id: 'p1', label: 'Alice Johnson' }],
        companies: [{ type: 'company', id: 'co1', label: 'Acme Corp' }],
        deals: [{ type: 'deal', id: 'd1', label: 'Big Deal' }],
      },
    });
    show();
    await type('a');
    await userEvent.click(await screen.findByRole('button', { name: /alice johnson/i }, WAIT));
    expect(screen.getByTestId('where')).toHaveTextContent('/people/p1');
    expect(box()).toHaveValue('');

    await type('a');
    await userEvent.click(await screen.findByRole('button', { name: /acme corp/i }, WAIT));
    expect(screen.getByTestId('where')).toHaveTextContent('/companies/co1');

    await type('a');
    await userEvent.click(await screen.findByRole('button', { name: /big deal/i }, WAIT));
    expect(screen.getByTestId('where')).toHaveTextContent('/deals/d1');
  });

  it('closes on Escape and clears when the box is emptied', async () => {
    (api.get as any).mockResolvedValue({ data: { ...none, companies: [{ type: 'company', id: 'co1', label: 'Acme Corp' }] } });
    show();
    await type('ac');
    await screen.findByText('Acme Corp', {}, WAIT);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByText('Acme Corp')).not.toBeInTheDocument();
    await userEvent.clear(box());
    expect(screen.queryByText(/no results/i)).not.toBeInTheDocument();
  });

  it('asks for nothing while the box is empty or blank', async () => {
    show();
    await type('   ');
    await new Promise((r) => setTimeout(r, 450));
    expect(api.get).not.toHaveBeenCalled();
  });
});
