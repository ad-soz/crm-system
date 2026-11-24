import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BackupsSection, formatSize } from './BackupsSection';
import { ToastProvider } from '@/context/ToastContext';
import { renderWithProviders } from '@/test/utils';
import { api } from '@/lib/api';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { get: vi.fn(), post: vi.fn() } };
});

const status = (over: object = {}) => ({
  running: false,
  lastSuccess: null,
  lastError: null,
  directory: 'C:\\Users\\x\\AppData\\Local\\CRM\\backups',
  keep: { auto: 14, manual: 10, 'pre-update': 5 },
  checkedEveryHours: 1,
  maxAgeHours: 24,
  ...over,
});

const show = () =>
  renderWithProviders(
    <ToastProvider>
      <BackupsSection />
    </ToastProvider>,
  );

describe('BackupsSection', () => {
  beforeEach(() => vi.clearAllMocks());

  it('formats sizes for people', () => {
    expect(formatSize(500)).toBe('500 B');
    expect(formatSize(204800)).toBe('200 KB');
    expect(formatSize(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('lists backups with their type and size', async () => {
    (api.get as any).mockResolvedValue({
      data: {
        backups: [
          { name: 'crm-auto-1.db', kind: 'auto', size: 204800, createdAt: '2026-11-08T10:00:00.000Z' },
          { name: 'crm-pre-update-1.db', kind: 'pre-update', size: 102400, createdAt: '2026-11-06T10:00:00.000Z' },
        ],
        status: status(),
      },
    });
    show();
    await waitFor(() => expect(screen.getByText('Automatic')).toBeInTheDocument());
    expect(screen.getByText('Before an update')).toBeInTheDocument();
    expect(screen.getByText('200 KB')).toBeInTheDocument();
    expect(screen.getByText(/restore-backup\.ps1/)).toBeInTheDocument();
  });

  it('warns when there are no backups yet', async () => {
    (api.get as any).mockResolvedValue({ data: { backups: [], status: status() } });
    show();
    await waitFor(() => expect(screen.getByText(/no backups yet/i)).toBeInTheDocument());
  });

  it('shows a failed backup without alarm about the data or the app', async () => {
    (api.get as any).mockResolvedValue({
      data: { backups: [], status: status({ lastError: { message: 'disk full', at: '2026-11-08T10:00:00.000Z' } }) },
    });
    show();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The last backup did not work');
    expect(alert).toHaveTextContent('disk full');
    expect(alert).toHaveTextContent(/app is still running/i);
  });

  it('backs up on demand', async () => {
    (api.get as any).mockResolvedValue({ data: { backups: [], status: status() } });
    (api.post as any).mockResolvedValue({ data: {} });
    show();
    await userEvent.click(await screen.findByRole('button', { name: /back up now/i }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/backups'));
    await waitFor(() => expect(screen.getByText('Backup created')).toBeInTheDocument());
  });
});
