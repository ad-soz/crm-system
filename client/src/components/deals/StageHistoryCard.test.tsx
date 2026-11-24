import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { StageHistoryCard, formatWhen } from './StageHistoryCard';
import { renderWithProviders } from '@/test/utils';
import { api } from '@/lib/api';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { get: vi.fn() } };
});

const change = (over: object = {}) => ({
  id: 'c1',
  comment: 'Budget approved by finance',
  userId: 'u1',
  userName: 'Sarah Admin',
  createdAt: '2026-11-08T21:41:00.000Z',
  fromStage: { id: 'stage-lead', name: 'Lead', colour: 'secondary' },
  toStage: { id: 'stage-qualified', name: 'Qualified', colour: 'info' },
  ...over,
});

describe('StageHistoryCard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows who moved the deal, when, from where to where, and why', async () => {
    (api.get as any).mockResolvedValue({ data: [change()] });
    renderWithProviders(<StageHistoryCard dealId="d1" />);

    expect(await screen.findByText('Budget approved by finance')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/deals/d1/history');
    const item = screen.getByRole('listitem');
    expect(item).toHaveTextContent('Lead');
    expect(item).toHaveTextContent('Qualified');
    expect(item).toHaveTextContent('Sarah Admin');
    // The date AND the time, as a machine-readable timestamp too.
    expect(item).toHaveTextContent(/2026/);
    expect(item).toHaveTextContent(/\d{1,2}:\d{2}\s?(AM|PM)/i);
    expect(item.querySelector('time')).toHaveAttribute('dateTime', '2026-11-08T21:41:00.000Z');
  });

  it('keeps the order the server gave (newest first) and every comment', async () => {
    (api.get as any).mockResolvedValue({
      data: [change({ id: 'c2', comment: 'Second move' }), change({ id: 'c1', comment: 'First move' })],
    });
    renderWithProviders(<StageHistoryCard dealId="d1" />);
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2));
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Second move');
    expect(items[1]).toHaveTextContent('First move');
  });

  it('still names someone who has since been removed', async () => {
    (api.get as any).mockResolvedValue({ data: [change({ userId: null, userName: 'Pat Leaver' })] });
    renderWithProviders(<StageHistoryCard dealId="d1" />);
    expect(await screen.findByText(/Pat Leaver/)).toBeInTheDocument();
  });

  it('keeps line breaks in a comment', async () => {
    (api.get as any).mockResolvedValue({ data: [change({ comment: 'Line one\nLine two' })] });
    renderWithProviders(<StageHistoryCard dealId="d1" />);
    const text = await screen.findByText(/Line one/);
    expect(text.className).toContain('whitespace-pre-wrap');
  });

  it('shows comment text as plain text, never as markup', async () => {
    (api.get as any).mockResolvedValue({ data: [change({ comment: '<img src=x onerror=alert(1)>' })] });
    const { container } = renderWithProviders(<StageHistoryCard dealId="d1" />);
    expect(await screen.findByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });

  it('explains an empty history', async () => {
    (api.get as any).mockResolvedValue({ data: [] });
    renderWithProviders(<StageHistoryCard dealId="d1" />);
    expect(await screen.findByText(/no moves recorded yet/i)).toBeInTheDocument();
  });

  it('says so when the history cannot be loaded', async () => {
    (api.get as any).mockRejectedValue(new Error('boom'));
    renderWithProviders(<StageHistoryCard dealId="d1" />);
    expect(await screen.findByText(/failed to load the stage history/i)).toBeInTheDocument();
  });

  it('formats a timestamp with date and time', () => {
    expect(formatWhen('2026-11-08T21:41:00.000Z')).toMatch(/2026/);
    expect(formatWhen('2026-11-08T21:41:00.000Z')).toMatch(/:\d{2}/);
  });
});
